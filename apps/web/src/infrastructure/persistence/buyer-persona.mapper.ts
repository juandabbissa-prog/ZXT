import type {
  BuyerPersonaRecord,
  PersonaDimensionAssessmentRecord,
  PersonaEvidenceLinkRecord,
  PersonaSnapshotRecord,
} from '@re-agent/shared';

export const toBuyerPersonaRecord = (row: BuyerPersonaRecord): BuyerPersonaRecord => row;

export const toPersonaAssessmentRecord = (
  row: PersonaDimensionAssessmentRecord,
): PersonaDimensionAssessmentRecord => row;

export const toPersonaEvidenceLinkRecord = (
  row: PersonaEvidenceLinkRecord,
): PersonaEvidenceLinkRecord => row;

export const toPersonaSnapshotRecord = (row: PersonaSnapshotRecord): PersonaSnapshotRecord => row;
