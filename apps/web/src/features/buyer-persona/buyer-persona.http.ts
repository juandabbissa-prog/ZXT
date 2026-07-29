import { NextResponse } from 'next/server';
import { AppError, fail } from '@re-agent/shared';

export function buyerPersonaErrorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      fail(error.expose ? error.message : 'Buyer Persona operation failed.'),
      {
        status: error.statusCode,
      },
    );
  }
  return NextResponse.json(fail('Buyer Persona operation failed.'), { status: 500 });
}
