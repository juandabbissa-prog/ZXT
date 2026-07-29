import {
  AppError,
  assertAssessmentEvidence,
  assertConfidence,
  assertValidityRange,
  BUYER_PERSONA_DIMENSIONS,
  type BuyerPersonaDimension,
  type BuyerPersonaRecord,
  type BuyerPersonaRepository,
  type BuyerPersonaStatus,
  type ContentSignalRepository,
  type PersistenceTransactionContext,
  type PersonaCognitiveStatus,
  type PersonaEvidenceRelation,
  type PersonaSnapshotRecord,
  ValidationError,
} from '@re-agent/shared';

export type BuyerPersonaTransactionRunner = Readonly<{
  run<T>(operation: (context: PersistenceTransactionContext) => Promise<T>): Promise<T>;
}>;

export class BuyerPersonaServiceError extends AppError {
  constructor(message: string, statusCode: number, code: string) {
    super(message, { statusCode, code, expose: true });
  }
}

export type EvidenceReference = Readonly<{
  contentSignalId: string;
  signalEvidenceId?: string | null;
  relation: PersonaEvidenceRelation;
  reason?: string | null;
}>;

export type RecordAssessmentCommand = Readonly<{
  category: BuyerPersonaDimension;
  dimensionKey: string;
  normalizedValue: unknown;
  cognitiveStatus: PersonaCognitiveStatus;
  confidence: number;
  rationale: string | null;
  validFrom: Date;
  validUntil: Date | null;
  expectedPersonaVersion: number;
  evidence: readonly EvidenceReference[];
  changeReason?: string | null;
}>;

const transitions: Readonly<Record<BuyerPersonaStatus, readonly BuyerPersonaStatus[]>> = {
  DRAFT: ['ACTIVE', 'STALE', 'ARCHIVED'],
  ACTIVE: ['STALE', 'ARCHIVED'],
  STALE: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: [],
};

export class BuyerPersonaService {
  constructor(
    private readonly personas: BuyerPersonaRepository,
    private readonly signals: ContentSignalRepository,
    private readonly transactions: BuyerPersonaTransactionRunner,
  ) {}

  async create(command: { subjectReference?: string | null }): Promise<BuyerPersonaRecord> {
    const subjectReference = command.subjectReference?.trim() || null;
    if (subjectReference && subjectReference.length > 200) {
      throw new ValidationError('subjectReference is too long.');
    }
    return this.transactions.run(async (context) => {
      if (
        subjectReference &&
        (await this.personas.findPersonaBySubjectReference(subjectReference, context))
      ) {
        throw new BuyerPersonaServiceError(
          'Buyer Persona already exists.',
          409,
          'BUYER_PERSONA_ALREADY_EXISTS',
        );
      }
      return this.personas.createPersona({ subjectReference }, context);
    });
  }

  async get(id: string) {
    const persona = await this.personas.findPersonaById(this.requireId(id));
    if (!persona) this.notFound();
    const assessments = await this.personas.findCurrentAssessments(id);
    const evidence = await this.personas.findEvidenceLinks(id);
    return {
      persona,
      assessments: assessments.filter(
        (item) => !item.validUntil || item.validUntil.getTime() >= Date.now(),
      ),
      evidence,
      missingDimensions: BUYER_PERSONA_DIMENSIONS.filter(
        (dimension) => !assessments.some((item) => item.category === dimension),
      ),
    };
  }

  async recordAssessment(id: string, command: RecordAssessmentCommand) {
    this.validateAssessment(command);
    return this.transactions.run(async (context) => {
      const persona = await this.personas.findPersonaById(this.requireId(id), context);
      if (!persona) this.notFound();
      if (persona.version !== command.expectedPersonaVersion) {
        throw new BuyerPersonaServiceError(
          'Buyer Persona version conflict.',
          409,
          'BUYER_PERSONA_VERSION_CONFLICT',
        );
      }
      const evidenceRows = [];
      for (const reference of command.evidence) {
        const signal = await this.signals.findById(this.requireId(reference.contentSignalId), context);
        if (!signal) {
          throw new BuyerPersonaServiceError(
            'Content Signal was not found.',
            404,
            'CONTENT_SIGNAL_NOT_FOUND',
          );
        }
        const evidence = reference.signalEvidenceId
          ? signal.evidence.find((item) => item.id === reference.signalEvidenceId)
          : null;
        if (reference.signalEvidenceId && !evidence) {
          throw new BuyerPersonaServiceError(
            'Signal Evidence was not found for the Content Signal.',
            404,
            'SIGNAL_EVIDENCE_NOT_FOUND',
          );
        }
        evidenceRows.push({ reference, signal, evidence });
      }
      const previous = await this.personas.findAssessmentHistory(
        id,
        command.dimensionKey,
        context,
      );
      const assessment = await this.personas.saveDimensionAssessment(
        {
          buyerPersonaId: id,
          category: command.category,
          dimensionKey: command.dimensionKey.trim(),
          normalizedValue: command.cognitiveStatus === 'UNKNOWN' ? null : command.normalizedValue,
          cognitiveStatus: command.cognitiveStatus,
          confidence: command.confidence,
          rationale: command.rationale?.trim() || null,
          validFrom: command.validFrom,
          validUntil: command.validUntil,
          assessedAt: new Date(),
          version: (previous[0]?.version ?? 0) + 1,
          changeReason: command.changeReason?.trim() || null,
        },
        context,
      );
      await Promise.all(
        evidenceRows.map(({ reference, signal, evidence }) =>
          this.personas.addEvidenceLink(
            {
              buyerPersonaId: id,
              assessmentId: assessment.id,
              contentSignalId: signal.id,
              signalEvidenceId: evidence?.id ?? null,
              relation: reference.relation,
              observedAt: evidence?.observedAt ?? signal.observedAt,
              reason: reference.reason?.trim() || null,
              confidenceSnapshot: signal.confidence,
              validUntilSnapshot: command.validUntil,
            },
            context,
          ),
        ),
      );
      return assessment;
    });
  }

  async history(id: string, dimensionKey: string) {
    await this.requirePersona(id);
    return this.personas.findAssessmentHistory(id, this.requireId(dimensionKey));
  }

  async generateSnapshot(
    id: string,
    command: { reason?: string | null; validUntil: Date | null },
  ): Promise<PersonaSnapshotRecord> {
    return this.transactions.run(async (context) => {
      const persona = await this.personas.findPersonaById(this.requireId(id), context);
      if (!persona) this.notFound();
      const assessments = (await this.personas.findCurrentAssessments(id, context)).filter(
        (item) => !item.validUntil || item.validUntil.getTime() >= Date.now(),
      );
      const evidence = await this.personas.findEvidenceLinks(id, undefined, context);
      const latest = await this.personas.findLatestValidSnapshot(id, new Date(0), context);
      return this.personas.createSnapshot(
        {
          buyerPersonaId: id,
          snapshotVersion: (latest?.snapshotVersion ?? 0) + 1,
          personaVersion: persona.version,
          dimensions: assessments,
          evidenceSummary: evidence.map((item) => ({
            contentSignalId: item.contentSignalId,
            signalEvidenceId: item.signalEvidenceId,
            relation: item.relation,
          })),
          missingDimensions: BUYER_PERSONA_DIMENSIONS.filter(
            (dimension) => !assessments.some((item) => item.category === dimension),
          ),
          validUntil: command.validUntil,
          reason: command.reason?.trim() || null,
        },
        context,
      );
    });
  }

  async latestSnapshot(id: string) {
    await this.requirePersona(id);
    const snapshot = await this.personas.findLatestValidSnapshot(id, new Date());
    if (!snapshot) {
      throw new BuyerPersonaServiceError('Persona Snapshot was not found.', 404, 'NOT_FOUND');
    }
    return snapshot;
  }

  async changeStatus(id: string, target: BuyerPersonaStatus) {
    const persona = await this.requirePersona(id);
    if (!transitions[persona.status].includes(target)) {
      throw new BuyerPersonaServiceError(
        'Buyer Persona status transition is not allowed.',
        409,
        'INVALID_PERSONA_STATE_TRANSITION',
      );
    }
    const updated = await this.personas.updatePersonaStatus(
      id,
      target,
      target === 'ARCHIVED' ? new Date() : null,
    );
    if (!updated) this.notFound();
    return updated;
  }

  private validateAssessment(command: RecordAssessmentCommand): void {
    if (!BUYER_PERSONA_DIMENSIONS.includes(command.category)) {
      throw new BuyerPersonaServiceError(
        'Buyer Persona dimension is invalid.',
        400,
        'INVALID_PERSONA_DIMENSION',
      );
    }
    this.requireId(command.dimensionKey);
    assertConfidence(command.confidence);
    assertValidityRange(command.validFrom, command.validUntil);
    assertAssessmentEvidence(
      command.cognitiveStatus,
      command.evidence.map((item) => item.contentSignalId),
    );
    if (command.cognitiveStatus === 'INFERENCE' && !command.rationale?.trim()) {
      throw new ValidationError('INFERENCE assessments require a rationale.');
    }
  }

  private async requirePersona(id: string) {
    const persona = await this.personas.findPersonaById(this.requireId(id));
    if (!persona) this.notFound();
    return persona;
  }
  private requireId(value: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new ValidationError('id is required.');
    return value.trim();
  }
  private notFound(): never {
    throw new BuyerPersonaServiceError(
      'Buyer Persona was not found.',
      404,
      'BUYER_PERSONA_NOT_FOUND',
    );
  }
}
