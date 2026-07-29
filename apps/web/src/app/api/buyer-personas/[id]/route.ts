import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import type { BuyerPersonaStatus } from '@re-agent/shared';
import { buyerPersonaErrorResponse } from '../../../../features/buyer-persona/buyer-persona.http';
import { buyerPersonaService } from '../../../../features/buyer-persona/buyer-persona.runtime';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(ok(await buyerPersonaService.get(id)));
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status: BuyerPersonaStatus };
    return NextResponse.json(ok(await buyerPersonaService.changeStatus(id, body.status)));
  } catch (error) {
    return buyerPersonaErrorResponse(error);
  }
}
