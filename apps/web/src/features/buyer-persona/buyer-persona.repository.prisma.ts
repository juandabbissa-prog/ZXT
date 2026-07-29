import type { Prisma, PrismaClient } from '@prisma/client';
import type {
  AddPersonaEvidenceLinkInput,
  BuyerPersonaRecord,
  BuyerPersonaRepository,
  BuyerPersonaStatus,
  CreateBuyerPersonaInput,
  CreatePersonaSnapshotInput,
  PersistenceTransactionContext,
  PersonaDimensionAssessmentRecord,
  PersonaEvidenceLinkRecord,
  PersonaSnapshotRecord,
  SavePersonaAssessmentInput,
} from '@re-agent/shared';
import {
  toBuyerPersonaRecord,
  toPersonaAssessmentRecord,
  toPersonaEvidenceLinkRecord,
  toPersonaSnapshotRecord,
} from '../../infrastructure/persistence/buyer-persona.mapper';
import { resolvePrismaExecutor } from '../../infrastructure/persistence/prisma-transaction-context';

export class PrismaBuyerPersonaRepository implements BuyerPersonaRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createPersona(
    input: CreateBuyerPersonaInput,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord> {
    const row = await resolvePrismaExecutor(this.prisma, context).buyerPersona.create({
      data: input,
    });
    return toBuyerPersonaRecord(row);
  }

  async findPersonaById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord | null> {
    const row = await resolvePrismaExecutor(this.prisma, context).buyerPersona.findUnique({
      where: { id },
    });
    return row ? toBuyerPersonaRecord(row) : null;
  }

  async findPersonaBySubjectReference(
    subjectReference: string,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord | null> {
    const row = await resolvePrismaExecutor(this.prisma, context).buyerPersona.findUnique({
      where: { subjectReference },
    });
    return row ? toBuyerPersonaRecord(row) : null;
  }

  async addEvidenceLink(
    input: AddPersonaEvidenceLinkInput,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaEvidenceLinkRecord> {
    const row = await resolvePrismaExecutor(this.prisma, context).personaEvidenceLink.create({
      data: input,
    });
    return toPersonaEvidenceLinkRecord(row);
  }

  async findEvidenceLinks(
    buyerPersonaId: string,
    assessmentId?: string,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaEvidenceLinkRecord[]> {
    const rows = await resolvePrismaExecutor(this.prisma, context).personaEvidenceLink.findMany({
      where: { buyerPersonaId, ...(assessmentId ? { assessmentId } : {}) },
      orderBy: [{ linkedAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => toPersonaEvidenceLinkRecord(row));
  }

  async saveDimensionAssessment(
    input: SavePersonaAssessmentInput,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaDimensionAssessmentRecord> {
    const client = resolvePrismaExecutor(this.prisma, context);
    await client.personaDimensionAssessment.updateMany({
      where: {
        buyerPersonaId: input.buyerPersonaId,
        dimensionKey: input.dimensionKey,
        status: 'CURRENT',
      },
      data: { status: 'SUPERSEDED', supersededAt: input.assessedAt },
    });
    const row = await client.personaDimensionAssessment.create({
      data: {
        ...input,
        normalizedValue: input.normalizedValue as Prisma.InputJsonValue,
      },
    });
    await client.buyerPersona.update({
      where: { id: input.buyerPersonaId },
      data: { lastAssessedAt: input.assessedAt, version: { increment: 1 } },
    });
    return toPersonaAssessmentRecord(row);
  }

  async findCurrentAssessments(
    buyerPersonaId: string,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaDimensionAssessmentRecord[]> {
    const rows = await resolvePrismaExecutor(
      this.prisma,
      context,
    ).personaDimensionAssessment.findMany({
      where: { buyerPersonaId, status: 'CURRENT' },
      orderBy: [{ category: 'asc' }, { dimensionKey: 'asc' }],
    });
    return rows.map((row) => toPersonaAssessmentRecord(row));
  }

  async findAssessmentHistory(
    buyerPersonaId: string,
    dimensionKey: string,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaDimensionAssessmentRecord[]> {
    const rows = await resolvePrismaExecutor(
      this.prisma,
      context,
    ).personaDimensionAssessment.findMany({
      where: { buyerPersonaId, dimensionKey },
      orderBy: [{ version: 'desc' }, { assessedAt: 'desc' }],
    });
    return rows.map((row) => toPersonaAssessmentRecord(row));
  }

  async createSnapshot(
    input: CreatePersonaSnapshotInput,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaSnapshotRecord> {
    const client = resolvePrismaExecutor(this.prisma, context);
    const row = await client.personaSnapshot.create({
      data: {
        ...input,
        dimensions: input.dimensions as Prisma.InputJsonValue,
        evidenceSummary: input.evidenceSummary as Prisma.InputJsonValue,
        missingDimensions: input.missingDimensions as Prisma.InputJsonValue,
      },
    });
    await client.buyerPersona.update({
      where: { id: input.buyerPersonaId },
      data: { latestSnapshotId: row.id },
    });
    return toPersonaSnapshotRecord(row);
  }

  async findLatestValidSnapshot(
    buyerPersonaId: string,
    at: Date,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaSnapshotRecord | null> {
    const row = await resolvePrismaExecutor(this.prisma, context).personaSnapshot.findFirst({
      where: {
        buyerPersonaId,
        OR: [{ validUntil: null }, { validUntil: { gte: at } }],
      },
      orderBy: [{ snapshotVersion: 'desc' }],
    });
    return row ? toPersonaSnapshotRecord(row) : null;
  }

  async updatePersonaStatus(
    id: string,
    status: BuyerPersonaStatus,
    archivedAt: Date | null,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord | null> {
    const client = resolvePrismaExecutor(this.prisma, context);
    if (!(await client.buyerPersona.findUnique({ where: { id }, select: { id: true } }))) {
      return null;
    }
    const row = await client.buyerPersona.update({
      where: { id },
      data: { status, archivedAt },
    });
    return toBuyerPersonaRecord(row);
  }
}
