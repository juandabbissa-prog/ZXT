import { describe, expect, it } from 'vitest';
import { ValidationError } from '../src/errors/app-error';
describe('ValidationError', () => it('is safe to expose', () => { const error = new ValidationError('invalid'); expect(error.statusCode).toBe(400); expect(error.expose).toBe(true); }));
