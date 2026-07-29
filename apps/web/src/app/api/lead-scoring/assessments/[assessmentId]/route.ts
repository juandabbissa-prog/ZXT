import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import { leadScoringErrorResponse } from '../../../../../features/lead-scoring/lead-scoring.http';
import { leadScoringService } from '../../../../../features/lead-scoring/lead-scoring.runtime';

type RouteContext = { params: Promise<{ assessmentId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { assessmentId } = await context.params;
    return NextResponse.json(ok(await leadScoringService.get(assessmentId)));
  } catch (error) {
    return leadScoringErrorResponse(error);
  }
}
