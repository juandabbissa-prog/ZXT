import type {
  Anchor as AnchorRow,
  ObservationRecord as ObservationRecordRow,
  PlatformAccount as PlatformAccountRow,
} from '@prisma/client';
import type { AnchorRecord, ObservationRecord, PlatformAccountRecord } from '@re-agent/shared';

export const toPlatformAccountRecord = (row: PlatformAccountRow): PlatformAccountRecord => ({
  ...row,
  contentDomains: [...row.contentDomains],
  regionTags: [...row.regionTags],
});

export const toAnchorRecord = (row: AnchorRow): AnchorRecord => ({
  ...row,
  tags: [...row.tags],
});

export const toObservationRecord = (row: ObservationRecordRow): ObservationRecord => ({
  ...row,
});
