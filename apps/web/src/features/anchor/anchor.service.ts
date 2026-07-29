import {
  AppError,
  type AnchorListFilter,
  type AnchorPriority,
  type AnchorRecord,
  type AnchorRepository,
  type AnchorRiskLevel,
  type AnchorStatus,
  type CreateAnchorInput,
  type CreateObservationRecordInput,
  type CreatePlatformAccountInput,
  type ObservationRecord,
  type ObservationRecordRepository,
  type Page,
  type PageRequest,
  type PersistenceTransactionContext,
  type PlatformAccountRecord,
  type PlatformAccountRepository,
  ValidationError,
} from '@re-agent/shared';
import { AnchorPersistenceError } from '../../infrastructure/persistence/anchor-persistence-error';

const priorities = new Set<AnchorPriority>(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
const statuses = new Set<AnchorStatus>(['ACTIVE', 'PAUSED', 'ARCHIVED']);
const riskLevels = new Set<AnchorRiskLevel>(['UNKNOWN', 'LOW', 'MEDIUM', 'HIGH']);

export type AnchorTransactionRunner = Readonly<{
  run<T>(operation: (context: PersistenceTransactionContext) => Promise<T>): Promise<T>;
}>;

export type CreatePlatformAccountCommand = Readonly<{
  platform: string;
  accountName: string;
  accountIdentifier: string;
  profileUrl: string;
  followerCount?: number;
  contentDomains?: readonly string[];
  regionTags?: readonly string[];
}>;

export type CreateAnchorCommand = Readonly<{
  name: string;
  platformAccountId: string;
  observationReason: string;
  tags?: readonly string[];
  priority?: AnchorPriority;
  riskLevel?: AnchorRiskLevel;
}>;

export type ListAnchorsQuery = Readonly<{
  page?: number;
  pageSize?: number;
  platform?: string;
  tag?: string;
  status?: AnchorStatus;
}>;

export type UpdateAnchorCommand = Readonly<{
  id: string;
  tags?: readonly string[];
  priority?: AnchorPriority;
  status?: AnchorStatus;
}>;

export type RecordObservationCommand = Readonly<{
  anchorId: string;
  observedAt: Date;
  source: string;
  result: string;
  notes?: string | null;
  confidence: number;
}>;

export class AnchorServiceError extends AppError {
  constructor(message: string, statusCode: number, code: string) {
    super(message, { statusCode, code, expose: true });
  }
}

/** Domain boundary for observation-source management. It contains no collection behavior. */
export class AnchorService {
  constructor(
    private readonly platformAccounts: PlatformAccountRepository,
    private readonly anchors: AnchorRepository,
    private readonly observations: ObservationRecordRepository,
    private readonly transactions: AnchorTransactionRunner,
  ) {}

  async createPlatformAccount(
    command: CreatePlatformAccountCommand,
  ): Promise<PlatformAccountRecord> {
    const input = this.toPlatformAccountInput(command);
    return this.execute(async (context) => {
      const existing = await this.platformAccounts.findByPlatformAndIdentifier(
        input.platform,
        input.accountIdentifier,
        context,
      );
      if (existing) {
        throw new AnchorServiceError(
          'Platform Account already exists.',
          409,
          'PLATFORM_ACCOUNT_DUPLICATE',
        );
      }
      return this.platformAccounts.create(input, context);
    });
  }

  async createAnchor(command: CreateAnchorCommand): Promise<AnchorRecord> {
    const input = this.toAnchorInput(command);
    return this.execute(async (context) => {
      const account = await this.platformAccounts.findById(input.platformAccountId, context);
      if (!account) {
        throw new AnchorServiceError('Platform Account was not found.', 404, 'NOT_FOUND');
      }
      if (account.status !== 'ACTIVE') {
        throw new AnchorServiceError(
          'Platform Account must be active.',
          409,
          'PLATFORM_ACCOUNT_NOT_ACTIVE',
        );
      }
      if (await this.anchors.findByPlatformAccountId(input.platformAccountId, context)) {
        throw new AnchorServiceError('Anchor already exists.', 409, 'ANCHOR_DUPLICATE');
      }
      return this.anchors.create(input, context);
    });
  }

  async getAnchor(id: string): Promise<AnchorRecord> {
    const anchor = await this.execute((context) =>
      this.anchors.findById(this.requireText(id, 'id', 120), context),
    );
    if (!anchor) throw new AnchorServiceError('Anchor was not found.', 404, 'NOT_FOUND');
    return anchor;
  }

  async listAnchors(query: ListAnchorsQuery = {}): Promise<Page<AnchorRecord>> {
    const page: PageRequest = {
      page: this.requirePositiveInteger(query.page ?? 1, 'page'),
      pageSize: this.requirePageSize(query.pageSize ?? 20),
    };
    const filter: AnchorListFilter = {
      ...(query.platform ? { platform: this.requireCode(query.platform, 'platform') } : {}),
      ...(query.tag ? { tag: this.requireCode(query.tag, 'tag') } : {}),
      ...(query.status ? { status: this.requireStatus(query.status) } : {}),
    };
    return this.execute((context) => this.anchors.list(filter, page, context));
  }

  async updateAnchor(command: UpdateAnchorCommand): Promise<AnchorRecord> {
    const id = this.requireText(command.id, 'id', 120);
    if (
      command.tags === undefined &&
      command.priority === undefined &&
      command.status === undefined
    ) {
      throw new ValidationError('At least one mutable Anchor field is required.');
    }
    const tags = command.tags === undefined ? undefined : this.uniqueCodes(command.tags, 'tags');
    const priority =
      command.priority === undefined ? undefined : this.requirePriority(command.priority);
    const requestedStatus =
      command.status === undefined ? undefined : this.requireStatus(command.status);

    return this.execute(async (context) => {
      const current = await this.anchors.findById(id, context);
      if (!current) throw new AnchorServiceError('Anchor was not found.', 404, 'NOT_FOUND');
      if (requestedStatus && !this.isAllowedTransition(current.status, requestedStatus)) {
        throw new AnchorServiceError(
          'Anchor status transition is not allowed.',
          409,
          'INVALID_STATE_TRANSITION',
        );
      }
      const updated = await this.anchors.update(
        id,
        {
          ...(tags !== undefined ? { tags } : {}),
          ...(priority !== undefined ? { priority } : {}),
          ...(requestedStatus !== undefined
            ? {
                status: requestedStatus,
                archivedAt: requestedStatus === 'ARCHIVED' ? new Date() : null,
              }
            : {}),
        },
        context,
      );
      if (!updated) throw new AnchorServiceError('Anchor was not found.', 404, 'NOT_FOUND');
      return updated;
    });
  }

  async recordObservation(command: RecordObservationCommand): Promise<ObservationRecord> {
    const input = this.toObservationInput(command);
    return this.execute(async (context) => {
      const anchor = await this.anchors.findById(input.anchorId, context);
      if (!anchor) throw new AnchorServiceError('Anchor was not found.', 404, 'NOT_FOUND');
      if (anchor.status !== 'ACTIVE') {
        throw new AnchorServiceError(
          'Observations require an active Anchor.',
          409,
          'ANCHOR_NOT_ACTIVE',
        );
      }
      return this.observations.create(input, context);
    });
  }

  private async execute<T>(
    operation: (context: PersistenceTransactionContext) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.run(operation);
    } catch (error) {
      if (error instanceof AnchorPersistenceError) throw this.mapPersistenceError(error);
      if (error instanceof AppError) throw error;
      throw new AppError('Anchor Center operation failed.');
    }
  }

  private toPlatformAccountInput(
    command: CreatePlatformAccountCommand,
  ): CreatePlatformAccountInput {
    const followerCount = command.followerCount ?? 0;
    if (!Number.isInteger(followerCount) || followerCount < 0) {
      throw new ValidationError('followerCount must be a non-negative integer.');
    }
    return {
      platform: this.requireCode(command.platform, 'platform'),
      accountName: this.requireText(command.accountName, 'accountName', 160),
      accountIdentifier: this.requireText(command.accountIdentifier, 'accountIdentifier', 160),
      profileUrl: this.requireHttpUrl(command.profileUrl),
      followerCount,
      contentDomains: this.uniqueCodes(command.contentDomains ?? [], 'contentDomains'),
      regionTags: this.uniqueCodes(command.regionTags ?? [], 'regionTags'),
      status: 'ACTIVE',
    };
  }

  private toAnchorInput(command: CreateAnchorCommand): CreateAnchorInput {
    return {
      name: this.requireText(command.name, 'name', 160),
      platformAccountId: this.requireText(command.platformAccountId, 'platformAccountId', 120),
      observationReason: this.requireText(command.observationReason, 'observationReason', 1000),
      tags: this.uniqueCodes(command.tags ?? [], 'tags'),
      priority: this.requirePriority(command.priority ?? 'NORMAL'),
      status: 'ACTIVE',
      riskLevel: this.requireRiskLevel(command.riskLevel ?? 'UNKNOWN'),
    };
  }

  private toObservationInput(command: RecordObservationCommand): CreateObservationRecordInput {
    if (!(command.observedAt instanceof Date) || Number.isNaN(command.observedAt.getTime())) {
      throw new ValidationError('observedAt must be a valid Date.');
    }
    if (
      !Number.isInteger(command.confidence) ||
      command.confidence < 0 ||
      command.confidence > 100
    ) {
      throw new ValidationError('confidence must be an integer between 0 and 100.');
    }
    return {
      anchorId: this.requireText(command.anchorId, 'anchorId', 120),
      observedAt: command.observedAt,
      source: this.requireCode(command.source, 'source'),
      result: this.requireText(command.result, 'result', 2000),
      notes:
        command.notes === undefined || command.notes === null
          ? null
          : this.optionalText(command.notes, 'notes', 2000),
      confidence: command.confidence,
    };
  }

  private mapPersistenceError(error: AnchorPersistenceError): AppError {
    if (error.kind === 'UNIQUE') {
      return new AnchorServiceError('Anchor Center record already exists.', 409, 'DUPLICATE');
    }
    if (error.kind === 'FOREIGN_KEY') {
      return new AnchorServiceError(
        'Anchor Center reference does not exist.',
        400,
        'VALIDATION_ERROR',
      );
    }
    return new AppError('Anchor Center operation could not be completed.');
  }

  private isAllowedTransition(from: AnchorStatus, to: AnchorStatus): boolean {
    if (from === to || from === 'ARCHIVED') return false;
    return (
      (from === 'ACTIVE' && (to === 'PAUSED' || to === 'ARCHIVED')) ||
      (from === 'PAUSED' && (to === 'ACTIVE' || to === 'ARCHIVED'))
    );
  }

  private requirePriority(value: AnchorPriority): AnchorPriority {
    if (!priorities.has(value)) throw new ValidationError('Anchor priority is invalid.');
    return value;
  }

  private requireStatus(value: AnchorStatus): AnchorStatus {
    if (!statuses.has(value)) throw new ValidationError('Anchor status is invalid.');
    return value;
  }

  private requireRiskLevel(value: AnchorRiskLevel): AnchorRiskLevel {
    if (!riskLevels.has(value)) throw new ValidationError('Anchor risk level is invalid.');
    return value;
  }

  private requireText(value: string, name: string, maximum: number): string {
    if (typeof value !== 'string') throw new ValidationError(`${name} is required.`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum) {
      throw new ValidationError(`${name} must contain between 1 and ${maximum} characters.`);
    }
    return normalized;
  }

  private optionalText(value: string, name: string, maximum: number): string | null {
    if (typeof value !== 'string') throw new ValidationError(`${name} must be text.`);
    const normalized = value.trim();
    if (normalized.length > maximum) {
      throw new ValidationError(`${name} must not exceed ${maximum} characters.`);
    }
    return normalized || null;
  }

  private requireCode(value: string, name: string): string {
    const code = this.requireText(value, name, 64).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]*$/u.test(code)) {
      throw new ValidationError(`${name} contains unsupported characters.`);
    }
    return code;
  }

  private uniqueCodes(values: readonly string[], name: string): readonly string[] {
    if (!Array.isArray(values)) throw new ValidationError(`${name} must be a list.`);
    const codes = (values as readonly unknown[]).map((value) => {
      if (typeof value !== 'string') {
        throw new ValidationError(`${name} must contain only strings.`);
      }
      return this.requireCode(value, name);
    });
    return [...new Set(codes)];
  }

  private requireHttpUrl(value: string): string {
    const candidate = this.requireText(value, 'profileUrl', 2048);
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol');
      return url.toString();
    } catch {
      throw new ValidationError('profileUrl must be a valid HTTP or HTTPS URL.');
    }
  }

  private requirePositiveInteger(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 1) {
      throw new ValidationError(`${name} must be a positive integer.`);
    }
    return value;
  }

  private requirePageSize(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new ValidationError('pageSize must be an integer between 1 and 100.');
    }
    return value;
  }
}
