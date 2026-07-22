export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly expose: boolean;
  constructor(message: string, options: { statusCode?: number; code?: string; expose?: boolean } = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'INTERNAL_ERROR';
    this.expose = options.expose ?? false;
  }
}
export class ValidationError extends AppError { constructor(message: string) { super(message, { statusCode: 400, code: 'VALIDATION_ERROR', expose: true }); } }
export class DatabaseError extends AppError { constructor(message = 'Database operation failed') { super(message, { code: 'DATABASE_ERROR' }); } }
export class RedisError extends AppError { constructor(message = 'Redis operation failed') { super(message, { code: 'REDIS_ERROR' }); } }
export class ExternalServiceError extends AppError { constructor(message = 'External service failed') { super(message, { code: 'EXTERNAL_SERVICE_ERROR' }); } }
