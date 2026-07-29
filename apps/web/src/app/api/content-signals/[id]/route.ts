import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
import { contentSignalErrorResponse } from '../../../../features/content-signal/content-signal.http';
import { contentSignalService } from '../../../../features/content-signal/content-signal.runtime';

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(ok(await contentSignalService.get(id)));
  } catch (error) {
    return contentSignalErrorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const body = (await request.json()) as { action?: string };
    if (body.action !== 'archive') {
      return NextResponse.json(
        {
          success: false,
          message: 'Only the archive action is supported.',
          data: {},
          error: 'Only the archive action is supported.',
        },
        { status: 400 },
      );
    }
    const { id } = await context.params;
    return NextResponse.json(ok(await contentSignalService.archive(id)));
  } catch (error) {
    return contentSignalErrorResponse(error);
  }
}
