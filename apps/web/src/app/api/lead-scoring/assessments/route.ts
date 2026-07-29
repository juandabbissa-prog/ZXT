import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import type { AssessLeadCommand } from '../../../../features/lead-scoring/lead-scoring.service';
import { leadScoringErrorResponse } from '../../../../features/lead-scoring/lead-scoring.http';
import { leadScoringService } from '../../../../features/lead-scoring/lead-scoring.runtime';

type AssessmentBody = AssessLeadCommand & { personaId: string; expiresAt?: string | null };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AssessmentBody;
    const result = await leadScoringService.assess(body.personaId, {
      personaSnapshotId: body.personaSnapshotId,
      sources: body.sources,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
    });
    return NextResponse.json(ok(result), { status: 201 });
  } catch (error) {
    return leadScoringErrorResponse(error);
  }
}
