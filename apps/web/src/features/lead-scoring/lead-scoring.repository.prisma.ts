import type { PrismaClient } from '@prisma/client';
import type {
  CreateLeadScoreAssessmentInput,
  LeadScoreAssessmentDetail,
  LeadScoringRepository,
  Page,
  PageRequest,
  PersistenceTransactionContext,
} from '@re-agent/shared';
import { toLeadScoreAssessmentDetail } from '../../infrastructure/persistence/lead-scoring.mapper';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';

const detail = {
  bases: { orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] },
  evidenceLinks: { orderBy: [{ linkedAt: 'asc' as const }, { id: 'asc' as const }] },
};

export class PrismaLeadScoringRepository implements LeadScoringRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createAssessment(
    input: CreateLeadScoreAssessmentInput,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail> {
    const row = await resolvePrismaExecutor(this.prisma, context).leadScoreAssessment.create({
      data: {
        ...input.assessment,
        confidence: Math.round(input.assessment.confidence * 100),
        bases: {
          create: input.bases.map((basis) => ({
            ...basis,
            confidence: Math.round(basis.confidence * 100),
          })),
        },
        evidenceLinks: {
          create: input.evidenceLinks.map((link) => ({
            sourceType: link.sourceType,
            sourceId: link.sourceId,
          })),
        },
      },
      include: detail,
    });
    return toLeadScoreAssessmentDetail(row);
  }

  async findAssessmentById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail | null> {
    const row = await resolvePrismaExecutor(this.prisma, context).leadScoreAssessment.findUnique({
      where: { id },
      include: detail,
    });
    return row ? toLeadScoreAssessmentDetail(row) : null;
  }

  async findLatestByPersonaId(
    personaId: string,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail | null> {
    const row = await resolvePrismaExecutor(this.prisma, context).leadScoreAssessment.findFirst({
      where: { personaId },
      include: detail,
      orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
    });
    return row ? toLeadScoreAssessmentDetail(row) : null;
  }

  async listByPersonaId(
    personaId: string,
    request: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<LeadScoreAssessmentDetail>> {
    const client = resolvePrismaExecutor(this.prisma, context);
    const where = { personaId };
    const [rows, total] = await Promise.all([
      client.leadScoreAssessment.findMany({
        where,
        include: detail,
        orderBy: [{ assessedAt: 'desc' }, { id: 'desc' }],
        skip: (request.page - 1) * request.pageSize,
        take: request.pageSize,
      }),
      client.leadScoreAssessment.count({ where }),
    ]);
    return {
      items: rows.map(toLeadScoreAssessmentDetail),
      page: request.page,
      pageSize: request.pageSize,
      total,
    };
  }

  async findByInputFingerprint(
    inputFingerprint: string,
    policyVersion: string,
    context?: PersistenceTransactionContext,
  ): Promise<LeadScoreAssessmentDetail | null> {
    const row = await resolvePrismaExecutor(this.prisma, context).leadScoreAssessment.findUnique({
      where: { inputFingerprint_policyVersion: { inputFingerprint, policyVersion } },
      include: detail,
    });
    return row ? toLeadScoreAssessmentDetail(row) : null;
  }
}
