import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import { leadScoringErrorResponse } from '../../../../../../features/lead-scoring/lead-scoring.http';
import { leadScoringService } from '../../../../../../features/lead-scoring/lead-scoring.runtime';

type RouteContext = { params: Promise<{ personaId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { personaId } = await context.params;
    const query = new URL(request.url).searchParams;
    return NextResponse.json(
      ok(
        await leadScoringService.list(personaId, {
          page: Number(query.get('page') ?? 1),
          pageSize: Number(query.get('pageSize') ?? 20),
        }),
      ),
    );
  } catch (error) {
    return leadScoringErrorResponse(error);
  }
}
