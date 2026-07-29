import type { Page, PageRequest, PersistenceTransactionContext } from './persistence';

export type PlatformAccountStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type AnchorPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type AnchorStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type AnchorRiskLevel = 'UNKNOWN' | 'LOW' | 'MEDIUM' | 'HIGH';

export type PlatformAccountRecord = Readonly<{
  id: string;
  platform: string;
  accountName: string;
  accountIdentifier: string;
  profileUrl: string;
  followerCount: number;
  contentDomains: readonly string[];
  regionTags: readonly string[];
  status: PlatformAccountStatus;
  createdAt: Date;
  updatedAt: Date;
}>;

export type AnchorRecord = Readonly<{
  id: string;
  name: string;
  platformAccountId: string;
  observationReason: string;
  tags: readonly string[];
  priority: AnchorPriority;
  status: AnchorStatus;
  riskLevel: AnchorRiskLevel;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}>;

export type ObservationRecord = Readonly<{
  id: string;
  anchorId: string;
  observedAt: Date;
  source: string;
  result: string;
  notes: string | null;
  confidence: number;
  createdAt: Date;
}>;

export type CreatePlatformAccountInput = Readonly<{
  platform: string;
  accountName: string;
  accountIdentifier: string;
  profileUrl: string;
  followerCount: number;
  contentDomains: readonly string[];
  regionTags: readonly string[];
  status: PlatformAccountStatus;
}>;

export type CreateAnchorInput = Readonly<{
  name: string;
  platformAccountId: string;
  observationReason: string;
  tags: readonly string[];
  priority: AnchorPriority;
  status: AnchorStatus;
  riskLevel: AnchorRiskLevel;
}>;

export type UpdateAnchorInput = Readonly<{
  tags?: readonly string[];
  priority?: AnchorPriority;
  status?: AnchorStatus;
  archivedAt?: Date | null;
}>;

export type AnchorListFilter = Readonly<{
  platform?: string;
  tag?: string;
  status?: AnchorStatus;
}>;

export type CreateObservationRecordInput = Readonly<{
  anchorId: string;
  observedAt: Date;
  source: string;
  result: string;
  notes: string | null;
  confidence: number;
}>;

export interface PlatformAccountRepository {
  create(
    input: CreatePlatformAccountInput,
    context?: PersistenceTransactionContext,
  ): Promise<PlatformAccountRecord>;
  findById(
    id: string,
    context?: PersistenceTransactionContext,
  ): Promise<PlatformAccountRecord | null>;
  findByPlatformAndIdentifier(
    platform: string,
    accountIdentifier: string,
    context?: PersistenceTransactionContext,
  ): Promise<PlatformAccountRecord | null>;
}

export interface AnchorRepository {
  create(input: CreateAnchorInput, context?: PersistenceTransactionContext): Promise<AnchorRecord>;
  findById(id: string, context?: PersistenceTransactionContext): Promise<AnchorRecord | null>;
  findByPlatformAccountId(
    platformAccountId: string,
    context?: PersistenceTransactionContext,
  ): Promise<AnchorRecord | null>;
  list(
    filter: AnchorListFilter,
    page: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<AnchorRecord>>;
  update(
    id: string,
    input: UpdateAnchorInput,
    context?: PersistenceTransactionContext,
  ): Promise<AnchorRecord | null>;
}

export interface ObservationRecordRepository {
  create(
    input: CreateObservationRecordInput,
    context?: PersistenceTransactionContext,
  ): Promise<ObservationRecord>;
  listByAnchorId(
    anchorId: string,
    page: PageRequest,
    context?: PersistenceTransactionContext,
  ): Promise<Page<ObservationRecord>>;
}
