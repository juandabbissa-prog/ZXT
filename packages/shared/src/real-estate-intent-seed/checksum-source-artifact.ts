import { createHash } from 'node:crypto';

export const checksumSourceArtifact = (sourceBytes: Uint8Array): string =>
  createHash('sha256').update(sourceBytes).digest('hex');
