import Redis from 'ioredis';
import { readConfig } from '@re-agent/shared';
let client: Redis | undefined;
export function getRedis(): Redis { client ??= new Redis(readConfig().REDIS_URL, { lazyConnect: true, keyPrefix: 're-agent:' }); return client; }
export async function checkRedis() { const redis = getRedis(); if (redis.status === 'wait') await redis.connect(); await redis.ping(); return { status: 'healthy' as const }; }
export async function closeRedis() { if (client) { await client.quit(); client = undefined; } }
