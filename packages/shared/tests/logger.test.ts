import { describe, expect, it } from 'vitest';
import { createLogger } from '../src/logger';
describe('createLogger', () => it('creates a structured logger', () => expect(createLogger('test').bindings().service).toBe('test')));
