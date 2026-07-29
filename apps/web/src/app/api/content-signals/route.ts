import { NextResponse } from 'next/server';
import { ok, ValidationError } from '@re-agent/shared';
import type {
  ContentSignalStatus,
  ContentSignalType,
  SignalEvidenceType,
  SignalEvidenceStatus,
  SignalSourceType,
} from '@re-agent/shared';
import { contentSignalErrorResponse } from '../../../features/content-signal/content-signal.http';
import { contentSignalService } from '../../../features/content-signal/content-signal.runtime';

export const dynamic = 'force-dynamic';

type CreateBody = {
  anchorId: string;
  keywordId?: string | null;
  type: ContentSignalType;
  summary: string;
  source: {
    type: SignalSourceType;
    reference?: string | null;
    description?: string | null;
  };
  evidence: {
    type: SignalEvidenceType;
    status?: SignalEvidenceStatus;
    content: string;
    referenceUrl?: string | null;
    observedAt: string;
  }[];
  confidence: number;
  confidenceRationale: string;
  occurredAt?: string | null;
  observedAt: string;
};

function parseCreateBody(value: unknown): CreateBody {
  if (!value || typeof value !== 'object') {
    throw new ValidationError('Content Signal request body is required.');
  }
  const body = value as Partial<CreateBody>;
  if (
    !body.source ||
    typeof body.source !== 'object' ||
    !Array.isArray(body.evidence) ||
    body.evidence.some((item) => !item || typeof item !== 'object')
  ) {
    throw new ValidationError('Content Signal source and evidence must be valid objects.');
  }
  return body as CreateBody;
}

export async function POST(request: Request) {
  try {
    const body = parseCreateBody(await request.json());
    const created = await contentSignalService.create({
      ...body,
      occurredAt: body.occurredAt ? new Date(body.occurredAt) : null,
      observedAt: new Date(body.observedAt),
      evidence: body.evidence.map((item) => ({
        ...item,
        observedAt: new Date(item.observedAt),
      })),
    });
    return NextResponse.json(ok(created), { status: 201 });
  } catch (error) {
    return contentSignalErrorResponse(error);
  }
}

export async function GET(request: Request) {
  try {
    const search = new URL(request.url).searchParams;
    const result = await contentSignalService.list({
      anchorId: search.get('anchorId') ?? '',
      page: Number(search.get('page') ?? 1),
      pageSize: Number(search.get('pageSize') ?? 20),
      ...(search.get('type') ? { type: search.get('type') as ContentSignalType } : {}),
      ...(search.get('status') ? { status: search.get('status') as ContentSignalStatus } : {}),
      ...(search.get('observedFrom')
        ? { observedFrom: new Date(search.get('observedFrom') as string) }
        : {}),
      ...(search.get('observedTo')
        ? { observedTo: new Date(search.get('observedTo') as string) }
        : {}),
    });
    return NextResponse.json(ok(result));
  } catch (error) {
    return contentSignalErrorResponse(error);
  }
}
