import { NextResponse } from 'next/server';
import { checkDatabase } from '@re-agent/database';
import { createLogger, fail, ok } from '@re-agent/shared';
export const dynamic = 'force-dynamic';
const logger = createLogger('web');
export async function GET() {
  try {
    return NextResponse.json(ok(await checkDatabase()));
  } catch (error) {
    logger.error({ error }, 'Database health check failed.');
    return NextResponse.json(fail('Database health check failed'), { status: 503 });
  }
}
