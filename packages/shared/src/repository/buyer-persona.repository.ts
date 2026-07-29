import type {
  BuyerPersonaDimension,
  BuyerPersonaStatus,
  PersonaAssessmentStatus,
  PersonaCognitiveStatus,
  PersonaEvidenceRelation,
} from '../domain/buyer-persona';
import type { PersistenceTransactionContext } from './persistence';

export interface BuyerPersonaRecord {
  id: string;
  subjectReference: string | null;
  status: BuyerPersonaStatus;
  version: number;
  lastAssessedAt: Date | null;
  latestSnapshotId: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface PersonaEvidenceLinkRecord {
  id: string;
  buyerPersonaId: string;
  assessmentId: string | null;
  contentSignalId: string;
  signalEvidenceId: string | null;
  relation: PersonaEvidenceRelation;
  observedAt: Date;
  linkedAt: Date;
  reason: string | null;
  confidenceSnapshot: number;
  validUntilSnapshot: Date | null;
}

export interface PersonaDimensionAssessmentRecord {
  id: string;
  buyerPersonaId: string;
  category: BuyerPersonaDimension;
  dimensionKey: string;
  normalizedValue: unknown;
  cognitiveStatus: PersonaCognitiveStatus;
  confidence: number;
  rationale: string | null;
  validFrom: Date;
  validUntil: Date | null;
  assessedAt: Date;
  status: PersonaAssessmentStatus;
  version: number;
  changeReason: string | null;
  supersededAt: Date | null;
  createdAt: Date;
}

export interface PersonaSnapshotRecord {
  id: string;
  buyerPersonaId: string;
  snapshotVersion: number;
  personaVersion: number;
  dimensions: unknown;
  evidenceSummary: unknown;
  missingDimensions: unknown;
  generatedAt: Date;
  validUntil: Date | null;
  reason: string | null;
}

export type CreateBuyerPersonaInput = { subjectReference: string | null };
export type AddPersonaEvidenceLinkInput = Omit<PersonaEvidenceLinkRecord, 'id' | 'linkedAt'>;
export type SavePersonaAssessmentInput = Omit<
  PersonaDimensionAssessmentRecord,
  'id' | 'status' | 'supersededAt' | 'createdAt'
>;
export type CreatePersonaSnapshotInput = Omit<PersonaSnapshotRecord, 'id' | 'generatedAt'>;

export interface BuyerPersonaRepository {
  createPersona(
    input: CreateBuyerPersonaInput,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord>;
  findPersonaById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord | null>;
  findPersonaBySubjectReference(
    subjectReference: string,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord | null>;
  addEvidenceLink(
    input: AddPersonaEvidenceLinkInput,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaEvidenceLinkRecord>;
  findEvidenceLinks(
    buyerPersonaId: string,
    assessmentId?: string,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaEvidenceLinkRecord[]>;
  saveDimensionAssessment(
    input: SavePersonaAssessmentInput,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaDimensionAssessmentRecord>;
  findCurrentAssessments(
    buyerPersonaId: string,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaDimensionAssessmentRecord[]>;
  findAssessmentHistory(
    buyerPersonaId: string,
    dimensionKey: string,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaDimensionAssessmentRecord[]>;
  createSnapshot(
    input: CreatePersonaSnapshotInput,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaSnapshotRecord>;
  findLatestValidSnapshot(
    buyerPersonaId: string,
    at: Date,
    context?: PersistenceTransactionContext,
  ): Promise<PersonaSnapshotRecord | null>;
  updatePersonaStatus(
    id: string,
    status: BuyerPersonaStatus,
    archivedAt: Date | null,
    context?: PersistenceTransactionContext,
  ): Promise<BuyerPersonaRecord | null>;
}
