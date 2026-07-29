import { NextResponse } from 'next/server';
import { AppError, fail } from '@re-agent/shared';

export function leadScoringErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      fail(error.expose ? error.message : 'Lead Scoring operation failed.'),
      {
        status: error.statusCode,
      },
    );
  }
  return NextResponse.json(fail('Lead Scoring operation failed.'), { status: 500 });
}
