import { NextResponse } from 'next/server';
import { ok, ValidationError } from '@re-agent/shared';
import { buyerPersonaErrorResponse } from '../../../features/buyer-persona/buyer-persona.http';
import { buyerPersonaService } from '../../../features/buyer-persona/buyer-persona.runtime';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { subjectReference?: string | null };
    if (!body || typeof body !== 'object') throw new ValidationError('Request body is required.');
    return NextResponse.json(ok(await buyerPersonaService.create(body)), { status: 201 });
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}
