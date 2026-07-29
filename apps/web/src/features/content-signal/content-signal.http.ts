import { NextResponse } from 'next/server';
import { AppError, fail } from '@re-agent/shared';

export function contentSignalErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    const message = error.expose ? error.message : 'Content Signal operation failed.';
    return NextResponse.json(fail(message), { status: error.statusCode });
  }
  return NextResponse.json(fail('Content Signal operation failed.'), { status: 500 });
}
