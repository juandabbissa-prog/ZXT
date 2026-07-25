import { describe, expect, it } from 'vitest';
import { GET } from '../src/app/api/health/route';

describe('/api/health', () =>
  it('returns the standard response', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(true);
  }));
