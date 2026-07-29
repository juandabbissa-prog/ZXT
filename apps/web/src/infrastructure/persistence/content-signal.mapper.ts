import type { ContentSignal, SignalEvidence } from '@prisma/client';
import type { ContentSignalRecord } from '@re-agent/shared';

type ContentSignalWithEvidence = ContentSignal & { evidence: SignalEvidence[] };

export const toContentSignalRecord = (row: ContentSignalWithEvidence): ContentSignalRecord => ({
  id: row.id,
  anchorId: row.anchorId,
  keywordId: row.keywordId,
  type: row.type,
  summary: row.summary,
  source: {
    type: row.sourceType,
    reference: row.sourceReference,
    description: row.sourceDescription,
  },
  evidence: row.evidence.map((item) => ({ ...item })),
  confidence: row.confidence,
  confidenceRationale: row.confidenceRationale,
  occurredAt: row.occurredAt,
  observedAt: row.observedAt,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  archivedAt: row.archivedAt,
});
