import { describe, expect, test } from 'vitest';
import { evidenceCandidateSchema } from '@re-agent/shared';
import malformedFixture from './fixtures/evidence/malformed-missing-content.json';
import unsupportedFixture from './fixtures/evidence/unsupported-authorized-api.json';
import validFixture from './fixtures/evidence/valid-text.json';
import { manualFixtureAdapter } from '../src/adapters/manual-fixture-adapter';

const clone = <T>(value: T): T => structuredClone(value);
const fixtureAt = (index: number) => {
  const fixture = validFixture.cases[index];
  if (!fixture) throw new Error(`Missing test fixture at index ${index}`);
  return fixture;
};

describe('manualFixtureAdapter', () => {
  test.each(validFixture.cases)(
    'maps the $name case to a valid candidate',
    ({ dataSource, sourcePayload }) => {
      const result = manualFixtureAdapter.adapt(sourcePayload, dataSource);

      expect(result.status).toBe('SUCCESS');
      if (result.status === 'SUCCESS') {
        expect(evidenceCandidateSchema.safeParse(result.candidate).success).toBe(true);
        expect(result.candidate.adapterId).toBe('manual-fixture');
        expect(result.candidate.adapterVersion).toBe('1.0.0');
      }
    },
  );

  test('preserves a null source reference', () => {
    const fixture = fixtureAt(0);
    const result = manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource);

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') expect(result.candidate.provenance.sourceReference).toBeNull();
  });

  test('maps the source reference only into provenance', () => {
    const fixture = fixtureAt(1);
    const result = manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource);

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.candidate.provenance.sourceReference).toBe('manual-record-001');
      expect(JSON.stringify(result.candidate).match(/manual-record-001/g)).toHaveLength(1);
    }
  });

  test('rejects an inner payload missing content', () => {
    expect(
      manualFixtureAdapter.adapt(malformedFixture.sourcePayload, malformedFixture.dataSource),
    ).toEqual({
      status: 'ERROR',
      error: { code: 'MALFORMED_PAYLOAD', field: 'payload.content' },
    });
  });

  test('rejects a schema-valid unsupported source without fallback', () => {
    expect(
      manualFixtureAdapter.adapt(unsupportedFixture.sourcePayload, unsupportedFixture.dataSource),
    ).toEqual({
      status: 'ERROR',
      error: { code: 'UNSUPPORTED_SOURCE', field: 'sourceType' },
    });
  });

  test.each([
    ['dataSourceId', 'other-source'],
    ['businessSpaceId', 'other-space'],
  ] as const)('rejects a %s mismatch', (field, value) => {
    const fixture = clone(fixtureAt(0));
    fixture.sourcePayload[field] = value;

    expect(manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource)).toEqual({
      status: 'ERROR',
      error: { code: 'INVALID_INPUT', field },
    });
  });

  test('maps an unsupported contract version to VERSION_MISMATCH', () => {
    const fixture = clone(fixtureAt(0));
    fixture.sourcePayload.contractVersion = '2.0.0';
    fixture.dataSource.contractVersion = '2.0.0';

    expect(manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource)).toEqual({
      status: 'ERROR',
      error: { code: 'VERSION_MISMATCH', field: 'contractVersion' },
    });
  });

  test('rejects a secret-like source reference without echoing it', () => {
    const fixture = clone(fixtureAt(1));
    fixture.sourcePayload.sourceReference = 'token=YOUR_TOKEN_HERE';
    const result = manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource);

    expect(result).toEqual({
      status: 'ERROR',
      error: { code: 'SECRET_DETECTED', field: 'sourceReference' },
    });
    expect(JSON.stringify(result)).not.toContain('YOUR_TOKEN_HERE');
  });

  test.each([
    [
      'payload.referenceUrl',
      (fixture: ReturnType<typeof clone<(typeof validFixture.cases)[number]>>) => {
        fixture.sourcePayload.payload.referenceUrl = 'not-a-url';
      },
    ],
    [
      'acquiredAt',
      (fixture: ReturnType<typeof clone<(typeof validFixture.cases)[number]>>) => {
        fixture.sourcePayload.acquiredAt = 'not-a-time';
      },
    ],
    [
      'sourceType',
      (fixture: ReturnType<typeof clone<(typeof validFixture.cases)[number]>>) => {
        fixture.sourcePayload.sourceType = 'INVALID';
      },
    ],
  ] as const)('rejects invalid %s input as malformed', (_field, mutate) => {
    const fixture = clone(fixtureAt(0));
    mutate(fixture);

    expect(manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource)).toMatchObject({
      status: 'ERROR',
      error: { code: 'MALFORMED_PAYLOAD' },
    });
  });

  test('does not mutate its inputs', () => {
    const fixture = clone(fixtureAt(1));
    const before = clone(fixture);

    manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource);

    expect(fixture).toEqual(before);
  });

  test('returns deeply equal candidates for identical inputs', () => {
    const fixture = fixtureAt(0);

    expect(manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource)).toEqual(
      manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource),
    );
  });

  test('does not create gate or envelope fields', () => {
    const fixture = fixtureAt(0);
    const result = manualFixtureAdapter.adapt(fixture.sourcePayload, fixture.dataSource);

    expect(result.status).toBe('SUCCESS');
    if (result.status === 'SUCCESS') {
      expect(result.candidate).not.toHaveProperty('fingerprint');
      expect(result.candidate).not.toHaveProperty('evidenceId');
      expect(result.candidate).not.toHaveProperty('qualityFacts');
      expect(result.candidate).not.toHaveProperty('realtimeEligibility');
    }
  });
});
