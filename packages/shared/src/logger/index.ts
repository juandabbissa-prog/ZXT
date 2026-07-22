import pino from 'pino';
import { readConfig } from '../config/env';

export function createLogger(service: string) {
  const config = readConfig();
  return pino({ base: { service, environment: config.NODE_ENV }, level: config.LOG_LEVEL, timestamp: pino.stdTimeFunctions.isoTime });
}
