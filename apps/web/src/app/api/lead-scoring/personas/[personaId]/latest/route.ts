import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import { leadScoringErrorResponse } from '../../../../../../features/lead-scoring/lead-scoring.http';
import { leadScoringService } from '../../../../../../features/lead-scoring/lead-scoring.runtime';

type RouteContext = { params: Promise<{ personaId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { personaId } = await context.params;
    return NextResponse.json(ok(await leadScoringService.latest(personaId)));
  } catch (error) {
    return leadScoringErrorResponse(error);
  }
}
