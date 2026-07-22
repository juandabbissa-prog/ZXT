import { NextResponse } from 'next/server';
import { createLogger, fail, ok } from '@re-agent/shared';
import { checkRedis } from '../../../../lib/redis';
export const dynamic = 'force-dynamic';
const logger = createLogger('web');
export async function GET() {
  try {
    return NextResponse.json(ok(await checkRedis()));
  } catch (error) {
    logger.error({ error }, 'Redis health check failed.');
    return NextResponse.json(fail('Redis health check failed'), { status: 503 });
  }
}
