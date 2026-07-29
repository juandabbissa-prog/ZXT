import {
  AppError,
  type AnchorRepository,
  type ContentSignalListFilter,
  type ContentSignalRecord,
  type ContentSignalRepository,
  type ContentSignalStatus,
  type ContentSignalType,
  type KeywordRepository,
  type Page,
  type PageRequest,
  type PersistenceTransactionContext,
  type SignalEvidenceType,
  type SignalEvidenceStatus,
  type SignalSourceType,
  ValidationError,
} from '@re-agent/shared';
import { ContentSignalPersistenceError } from '../../infrastructure/persistence/content-signal-persistence-error';

const signalTypes = new Set<ContentSignalType>([
  'DEMAND',
  'PAIN_POINT',
  'PREFERENCE',
  'OBJECTION',
  'INTENT',
]);
const sourceTypes = new Set<SignalSourceType>(['MANUAL', 'IMPORT', 'AUTHORIZED_API', 'SYSTEM']);
const evidenceTypes = new Set<SignalEvidenceType>(['TEXT', 'URL', 'METRIC', 'OBSERVATION']);
const evidenceStatuses = new Set<SignalEvidenceStatus>(['AVAILABLE', 'REDACTED']);

export type ContentSignalTransactionRunner = Readonly<{
  run<T>(operation: (context: PersistenceTransactionContext) => Promise<T>): Promise<T>;
}>;

export type CreateSignalEvidenceCommand = Readonly<{
  type: SignalEvidenceType;
  status?: SignalEvidenceStatus;
  content: string;
  referenceUrl?: string | null;
  observedAt: Date;
}>;

export type CreateContentSignalCommand = Readonly<{
  anchorId: string;
  keywordId?: string | null;
  type: ContentSignalType;
  summary: string;
  source: Readonly<{
    type: SignalSourceType;
    reference?: string | null;
    description?: string | null;
  }>;
  evidence: ReadonlyArray<CreateSignalEvidenceCommand>;
  confidence: number;
  confidenceRationale: string;
  occurredAt?: Date | null;
  observedAt: Date;
}>;

export type ListContentSignalsQuery = Readonly<{
  anchorId: string;
  page?: number;
  pageSize?: number;
  type?: ContentSignalType;
  status?: ContentSignalStatus;
  observedFrom?: Date;
  observedTo?: Date;
}>;

export class ContentSignalServiceError extends AppError {
  constructor(message: string, statusCode: number, code: string) {
    super(message, { statusCode, code, expose: true });
  }
}

export class ContentSignalService {
  constructor(
    private readonly signals: ContentSignalRepository,
    private readonly anchors: AnchorRepository,
    private readonly keywords: KeywordRepository,
    private readonly transactions: ContentSignalTransactionRunner,
  ) {}

  async create(command: CreateContentSignalCommand): Promise<ContentSignalRecord> {
    const input = this.validateCreate(command);
    return this.execute(async (context) => {
      const anchor = await this.anchors.findById(input.anchorId, context);
      if (!anchor) throw new ContentSignalServiceError('Anchor was not found.', 404, 'NOT_FOUND');
      if (anchor.status !== 'ACTIVE') {
        throw new ContentSignalServiceError(
          'Content Signal requires an active Anchor.',
          409,
          'ANCHOR_NOT_ACTIVE',
        );
      }
      if (input.keywordId) {
        const keyword = await this.keywords.findById(input.keywordId, context);
        if (!keyword || keyword.deletedAt) {
          throw new ContentSignalServiceError('Keyword was not found.', 404, 'KEYWORD_NOT_FOUND');
        }
      }
      if (
        await this.signals.findDuplicate(
          {
            anchorId: input.anchorId,
            type: input.type,
            normalizedSummary: input.normalizedSummary,
            occurredAt: input.occurredAt,
          },
          context,
        )
      ) {
        throw new ContentSignalServiceError(
          'Content Signal already exists.',
          409,
          'CONTENT_SIGNAL_DUPLICATE',
        );
      }
      return this.signals.create(input, context);
    });
  }

  async get(id: string): Promise<ContentSignalRecord> {
    const signal = await this.execute((context) =>
      this.signals.findById(this.requireText(id, 'id', 120), context),
    );
    if (!signal)
      throw new ContentSignalServiceError('Content Signal was not found.', 404, 'NOT_FOUND');
    return signal;
  }

  async list(query: ListContentSignalsQuery): Promise<Page<ContentSignalRecord>> {
    const filter: ContentSignalListFilter = {
      anchorId: this.requireText(query.anchorId, 'anchorId', 120),
      ...(query.type ? { type: this.requireSignalType(query.type) } : {}),
      ...(query.status ? { status: this.requireStatus(query.status) } : {}),
      ...(query.observedFrom
        ? { observedFrom: this.requireDate(query.observedFrom, 'observedFrom') }
        : {}),
      ...(query.observedTo ? { observedTo: this.requireDate(query.observedTo, 'observedTo') } : {}),
    };
    if (
      filter.observedFrom &&
      filter.observedTo &&
      filter.observedFrom.getTime() > filter.observedTo.getTime()
    ) {
      throw new ValidationError('observedFrom must not be after observedTo.');
    }
    const page: PageRequest = {
      page: this.requirePositiveInteger(query.page ?? 1, 'page'),
      pageSize: this.requirePageSize(query.pageSize ?? 20),
    };
    return this.execute((context) => this.signals.findByAnchor(filter, page, context));
  }

  async archive(id: string): Promise<ContentSignalRecord> {
    const normalizedId = this.requireText(id, 'id', 120);
    return this.execute(async (context) => {
      const current = await this.signals.findById(normalizedId, context);
      if (!current) {
        throw new ContentSignalServiceError('Content Signal was not found.', 404, 'NOT_FOUND');
      }
      if (current.status !== 'ACTIVE') {
        throw new ContentSignalServiceError(
          'Content Signal status transition is not allowed.',
          409,
          'INVALID_STATE_TRANSITION',
        );
      }
      const updated = await this.signals.updateStatus(
        normalizedId,
        'ARCHIVED',
        new Date(),
        context,
      );
      if (!updated)
        throw new ContentSignalServiceError('Content Signal was not found.', 404, 'NOT_FOUND');
      return updated;
    });
  }

  private validateCreate(command: CreateContentSignalCommand) {
    if (!command || typeof command !== 'object') {
      throw new ValidationError('Content Signal input is required.');
    }
    const occurredAt =
      command.occurredAt === undefined || command.occurredAt === null
        ? null
        : this.requireDate(command.occurredAt, 'occurredAt');
    const observedAt = this.requireDate(command.observedAt, 'observedAt');
    if (occurredAt && occurredAt.getTime() > observedAt.getTime()) {
      throw new ValidationError('occurredAt must not be after observedAt.');
    }
    if (
      !Number.isInteger(command.confidence) ||
      command.confidence < 0 ||
      command.confidence > 100
    ) {
      throw new ValidationError('confidence must be an integer between 0 and 100.');
    }
    const evidence = command.evidence as unknown;
    if (!Array.isArray(evidence) || evidence.length === 0) {
      throw new ValidationError('At least one Evidence item is required.');
    }
    const evidenceItems = evidence as readonly CreateSignalEvidenceCommand[];
    if (!command.source || typeof command.source !== 'object') {
      throw new ValidationError('Signal Source is required.');
    }
    const summary = this.requireText(command.summary, 'summary', 1000);
    return {
      anchorId: this.requireText(command.anchorId, 'anchorId', 120),
      keywordId:
        command.keywordId === undefined || command.keywordId === null
          ? null
          : this.requireText(command.keywordId, 'keywordId', 120),
      type: this.requireSignalType(command.type),
      summary,
      normalizedSummary: summary.toLocaleLowerCase('en-US').replace(/\s+/gu, ' '),
      source: {
        type: this.requireSourceType(command.source?.type),
        reference:
          command.source.reference === undefined || command.source.reference === null
            ? null
            : this.optionalText(command.source.reference, 'source.reference', 2048),
        description:
          command.source.description === undefined || command.source.description === null
            ? null
            : this.optionalText(command.source.description, 'source.description', 1000),
      },
      evidence: evidenceItems.map((item) => ({
        type: this.requireEvidenceType(item.type),
        status: this.requireEvidenceStatus(item.status ?? 'AVAILABLE'),
        content: this.requireText(item.content, 'evidence.content', 2000),
        referenceUrl:
          item.referenceUrl === undefined || item.referenceUrl === null
            ? null
            : this.requireHttpUrl(item.referenceUrl, 'evidence.referenceUrl'),
        observedAt: this.requireDate(item.observedAt, 'evidence.observedAt'),
      })),
      confidence: command.confidence,
      confidenceRationale: this.requireText(
        command.confidenceRationale,
        'confidenceRationale',
        1000,
      ),
      occurredAt,
      observedAt,
      status: 'ACTIVE' as const,
    };
  }

  private async execute<T>(
    operation: (context: PersistenceTransactionContext) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.transactions.run(operation);
    } catch (error) {
      if (error instanceof ContentSignalPersistenceError) {
        if (error.kind === 'UNIQUE') {
          throw new ContentSignalServiceError(
            'Content Signal already exists.',
            409,
            'CONTENT_SIGNAL_DUPLICATE',
          );
        }
        if (error.kind === 'FOREIGN_KEY') {
          throw new ContentSignalServiceError(
            'Content Signal reference does not exist.',
            400,
            'VALIDATION_ERROR',
          );
        }
        throw new AppError('Content Signal operation could not be completed.');
      }
      if (error instanceof AppError) throw error;
      throw new AppError('Content Signal operation failed.');
    }
  }

  private requireSignalType(value: unknown): ContentSignalType {
    if (typeof value !== 'string' || !signalTypes.has(value as ContentSignalType)) {
      throw new ValidationError('Content Signal type is invalid.');
    }
    return value as ContentSignalType;
  }
  private requireSourceType(value: unknown): SignalSourceType {
    if (typeof value !== 'string' || !sourceTypes.has(value as SignalSourceType)) {
      throw new ValidationError('Signal Source type is invalid.');
    }
    return value as SignalSourceType;
  }
  private requireEvidenceType(value: unknown): SignalEvidenceType {
    if (typeof value !== 'string' || !evidenceTypes.has(value as SignalEvidenceType)) {
      throw new ValidationError('Signal Evidence type is invalid.');
    }
    return value as SignalEvidenceType;
  }
  private requireEvidenceStatus(value: unknown): SignalEvidenceStatus {
    if (typeof value !== 'string' || !evidenceStatuses.has(value as SignalEvidenceStatus)) {
      throw new ValidationError('Signal Evidence status is invalid.');
    }
    return value as SignalEvidenceStatus;
  }
  private requireStatus(value: unknown): ContentSignalStatus {
    if (value !== 'ACTIVE' && value !== 'ARCHIVED') {
      throw new ValidationError('Content Signal status is invalid.');
    }
    return value;
  }
  private requireDate(value: unknown, name: string): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      throw new ValidationError(`${name} must be a valid Date.`);
    }
    return value;
  }
  private requireText(value: unknown, name: string, maximum: number): string {
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
    if (normalized.length > maximum) throw new ValidationError(`${name} is too long.`);
    return normalized || null;
  }
  private requireHttpUrl(value: string, name: string): string {
    const candidate = this.requireText(value, name, 2048);
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
      return url.toString();
    } catch {
      throw new ValidationError(`${name} must be a valid HTTP or HTTPS URL.`);
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
