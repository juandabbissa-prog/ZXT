import { createHash } from 'node:crypto';
import type { EvidenceCandidate } from './schemas';

export type CanonicalizationVersion = '1.0.0';

export type CanonicalEvidenceIdentity = Readonly<{
  canonicalBytes: string;
  fingerprint: string;
  evidenceId: string;
}>;

const normalizeText = (value: string): string => value.trim().normalize('NFC');

const normalizeTimestamp = (value: string): string => new Date(value).toISOString();

const normalizeUrl = (value: string | null): string | null =>
  value === null ? null : new URL(value).toString();

const member = (key: string, value: string | null): string =>
  `${JSON.stringify(key)}:${JSON.stringify(value)}`;

export const canonicalizeEvidenceIdentity = (
  candidate: EvidenceCandidate,
  canonicalizationVersion: CanonicalizationVersion,
): CanonicalEvidenceIdentity => {
  const canonicalBytes = `{${[
    member('canonicalizationVersion', canonicalizationVersion),
    member('schemaVersion', candidate.schemaVersion),
    member('dataSourceId', candidate.dataSourceId),
    member('sourceType', candidate.sourceType),
    member('sourceRecordId', candidate.sourceRecordId),
    member('businessSpaceId', candidate.businessSpaceId),
    member('purposeCode', candidate.purposeCode),
    member('evidenceType', candidate.evidenceType),
    member('content', normalizeText(candidate.content)),
    member(
      'sourceReference',
      candidate.provenance.sourceReference === null
        ? null
        : normalizeText(candidate.provenance.sourceReference),
    ),
    member('referenceUrl', normalizeUrl(candidate.referenceUrl)),
    member(
      'occurredAt',
      candidate.occurredAt === null ? null : normalizeTimestamp(candidate.occurredAt),
    ),
    member('observedAt', normalizeTimestamp(candidate.observedAt)),
  ].join(',')}}`;

  const fingerprint = createHash('sha256').update(canonicalBytes, 'utf8').digest('hex');

  return {
    canonicalBytes,
    fingerprint,
    evidenceId: `ev1_${fingerprint}`,
  };
};
