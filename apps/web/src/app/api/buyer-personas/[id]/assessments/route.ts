import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import type {
  BuyerPersonaDimension,
  PersonaCognitiveStatus,
  PersonaEvidenceRelation,
} from '@re-agent/shared';
import { buyerPersonaErrorResponse } from '../../../../../features/buyer-persona/buyer-persona.http';
import { buyerPersonaService } from '../../../../../features/buyer-persona/buyer-persona.runtime';

type RouteContext = { params: Promise<{ id: string }> };
type AssessmentBody = {
  category: BuyerPersonaDimension;
  dimensionKey: string;
  normalizedValue: unknown;
  cognitiveStatus: PersonaCognitiveStatus;
  confidence: number;
  rationale: string | null;
  validFrom: string;
  validUntil: string | null;
  expectedPersonaVersion: number;
  evidence: {
    contentSignalId: string;
    signalEvidenceId?: string | null;
    relation: PersonaEvidenceRelation;
    reason?: string | null;
  }[];
  changeReason?: string | null;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as AssessmentBody;
    const result = await buyerPersonaService.recordAssessment(id, {
      ...body,
      validFrom: new Date(body.validFrom),
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
    });
    return NextResponse.json(ok(result), { status: 201 });
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const dimensionKey = new URL(request.url).searchParams.get('dimensionKey') ?? '';
    return NextResponse.json(ok(await buyerPersonaService.history(id, dimensionKey)));
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}
