import { NextResponse } from 'next/server';
import { ok } from '@re-agent/shared';
export const dynamic = 'force-dynamic';
export function GET() { return NextResponse.json(ok({ service: 'web', status: 'healthy', version: '0.1.0' })); }
