import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import { buyerPersonaErrorResponse } from '../../../../../features/buyer-persona/buyer-persona.http';
import { buyerPersonaService } from '../../../../../features/buyer-persona/buyer-persona.runtime';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { reason?: string | null; validUntil?: string | null };
    const snapshot = await buyerPersonaService.generateSnapshot(id, {
      reason: body.reason,
      validUntil: body.validUntil ? new Date(body.validUntil) : null,
    });
    return NextResponse.json(ok(snapshot), { status: 201 });
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(ok(await buyerPersonaService.latestSnapshot(id)));
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}
