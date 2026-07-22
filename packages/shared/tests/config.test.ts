import { describe, expect, it } from 'vitest';
import { readConfig } from '../src/config/env';

const valid = { DATABASE_URL: 'postgresql://user:pass@localhost:5432/db', REDIS_URL: 'redis://localhost:6379' };
describe('readConfig', () => {
  it('applies safe defaults', () => expect(readConfig(valid).APP_NAME).toBe('RE-Agent'));
  it('fails clearly for missing configuration', () => expect(() => readConfig({})).toThrow('Invalid environment configuration'));
});
