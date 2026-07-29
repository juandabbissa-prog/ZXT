import { createHash } from 'node:crypto';
import {
  AppError,
  assertAssessmentWindow,
  type BuyerPersonaRepository,
  type ContentSignalRepository,
  type LeadScoreAssessmentDetail,
  type LeadScoringRepository,
  type PageRequest,
  type PersistenceTransactionContext,
  type ScoreBasisType,
  ValidationError,
} from '@re-agent/shared';
import {
  evaluateLeadScore,
  LEAD_SCORING_POLICY_VERSION,
  type ScoringSource,
} from './lead-scoring.policy';

export type LeadScoringTransactionRunner = Readonly<{
  run<T>(operation: (context: PersistenceTransactionContext) => Promise<T>): Promise<T>;
}>;

export type AssessLeadCommand = Readonly<{
  personaSnapshotId: string;
  sources: readonly Readonly<{
    basisType: Exclude<ScoreBasisType, 'PERSONA_SNAPSHOT'>;
    sourceId: string;
  }>[];
  expiresAt?: Date | null;
}>;

export class LeadScoringServiceError extends AppError {
  constructor(message: string, statusCode: number, code: string) {
    super(message, { statusCode, code, expose: true });
  }
}

export class LeadScoringService {
  constructor(
    private readonly assessments: LeadScoringRepository,
    private readonly personas: BuyerPersonaRepository,
    private readonly signals: ContentSignalRepository,
    private readonly transactions: LeadScoringTransactionRunner,
  ) {}

  async assess(personaId: string, command: AssessLeadCommand): Promise<LeadScoreAssessmentDetail> {
    const cleanPersonaId = this.id(personaId);
    const snapshotId = this.id(command.personaSnapshotId);
    const assessedAt = new Date();
    assertAssessmentWindow(assessedAt, command.expiresAt);
    return this.transactions.run(async (context) => {
      const persona = await this.personas.findPersonaById(cleanPersonaId, context);
      if (!persona) this.notFound('Buyer Persona', 'BUYER_PERSONA_NOT_FOUND');
      const snapshot = await this.personas.findLatestValidSnapshot(
        cleanPersonaId,
        assessedAt,
        context,
      );
      if (!snapshot || snapshot.id !== snapshotId) {
        this.notFound('Current Persona Snapshot', 'PERSONA_SNAPSHOT_NOT_FOUND');
      }
      const sources: ScoringSource[] = [
        {
          basisType: 'PERSONA_SNAPSHOT',
          sourceId: snapshot.id,
          confidence: 1,
          observedAt: snapshot.generatedAt,
          expiresAt: snapshot.validUntil,
        },
      ];
      const dimensions = await this.personas.findCurrentAssessments(cleanPersonaId, context);
      for (const input of command.sources) {
        const sourceId = this.id(input.sourceId);
        if (input.basisType === 'PERSONA_DIMENSION') {
          const dimension = dimensions.find((item) => item.id === sourceId);
          if (!dimension) this.notFound('Persona Dimension', 'PERSONA_DIMENSION_NOT_FOUND');
          sources.push({
            basisType: input.basisType,
            sourceId,
            confidence: dimension.confidence / 100,
            observedAt: dimension.assessedAt,
            expiresAt: dimension.validUntil,
          });
          continue;
        }
        const signal =
          input.basisType === 'CONTENT_SIGNAL'
            ? await this.signals.findById(sourceId, context)
            : null;
        const evidenceSignal =
          input.basisType === 'EVIDENCE'
            ? await this.findSignalByEvidence(cleanPersonaId, sourceId, context)
            : null;
        const record = signal ?? evidenceSignal?.signal;
        if (!record) this.notFound(input.basisType, `${input.basisType}_NOT_FOUND`);
        const evidence = evidenceSignal?.evidence;
        sources.push({
          basisType: input.basisType,
          sourceId,
          confidence: record.confidence / 100,
          observedAt: evidence?.observedAt ?? record.observedAt,
          expiresAt: null,
        });
      }
      const fingerprint = this.fingerprint(cleanPersonaId, snapshotId, sources);
      const existing = await this.assessments.findByInputFingerprint(
        fingerprint,
        LEAD_SCORING_POLICY_VERSION,
        context,
      );
      if (existing) return existing;
      const result = evaluateLeadScore(sources);
      return this.assessments.createAssessment(
        {
          assessment: {
            personaId: cleanPersonaId,
            personaSnapshotId: snapshotId,
            purchaseStage: result.purchaseStage,
            leadGrade: result.leadGrade,
            score: result.score,
            confidence: result.confidence,
            explanation: result.explanation,
            policyVersion: LEAD_SCORING_POLICY_VERSION,
            inputFingerprint: fingerprint,
            assessedAt,
            expiresAt: command.expiresAt ?? null,
          },
          bases: result.bases,
          evidenceLinks: sources.map(({ basisType, sourceId }) => ({
            sourceType: basisType,
            sourceId,
          })),
        },
        context,
      );
    });
  }

  async get(id: string) {
    const result = await this.assessments.findAssessmentById(this.id(id));
    if (!result) this.notFound('Lead Score Assessment', 'LEAD_SCORE_ASSESSMENT_NOT_FOUND');
    return result;
  }

  async latest(personaId: string) {
    const result = await this.assessments.findLatestByPersonaId(this.id(personaId));
    if (!result) this.notFound('Lead Score Assessment', 'LEAD_SCORE_ASSESSMENT_NOT_FOUND');
    return result;
  }

  async list(personaId: string, page: PageRequest) {
    if (page.page < 1 || page.pageSize < 1 || page.pageSize > 100) {
      throw new ValidationError('Invalid pagination.');
    }
    return this.assessments.listByPersonaId(this.id(personaId), page);
  }

  private async findSignalByEvidence(
    personaId: string,
    evidenceId: string,
    context: PersistenceTransactionContext,
  ) {
    const links = await this.personas.findEvidenceLinks(personaId, undefined, context);
    const linked = links.find((item) => item.signalEvidenceId === evidenceId);
    if (!linked) return null;
    const signal = await this.signals.findById(linked.contentSignalId, context);
    const evidence = signal?.evidence.find((item) => item.id === evidenceId);
    return signal && evidence ? { signal, evidence } : null;
  }

  private fingerprint(personaId: string, snapshotId: string, sources: readonly ScoringSource[]) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          personaId,
          snapshotId,
          policyVersion: LEAD_SCORING_POLICY_VERSION,
          sources: sources.map(({ basisType, sourceId }) => `${basisType}:${sourceId}`).sort(),
        }),
      )
      .digest('hex');
  }

  private id(value: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new ValidationError('id is required.');
    return value.trim();
  }

  private notFound(subject: string, code: string): never {
    throw new LeadScoringServiceError(`${subject} was not found.`, 404, code);
  }
}
