import type { EvidenceCandidate, EvidenceIntakeErrorCode } from '@re-agent/shared';

export type AdapterSuccess = Readonly<{
  status: 'SUCCESS';
  candidate: EvidenceCandidate;
}>;

export type AdapterFailure = Readonly<{
  status: 'ERROR';
  error: Readonly<{
    code: EvidenceIntakeErrorCode;
    field: string | null;
  }>;
}>;

export type AdapterResult = AdapterSuccess | AdapterFailure;

export interface AdapterContract {
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly supportedSourceTypes: readonly ('FIXTURE' | 'MANUAL_IMPORT')[];

  adapt(sourcePayload: unknown, dataSource: unknown): AdapterResult;
}
