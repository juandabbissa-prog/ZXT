import { createLogger } from '@re-agent/shared';
const logger = createLogger('crawler');
logger.info('Crawler service shell started; no collection behavior is implemented in Sprint 1.');
process.on('SIGTERM', () => { logger.info('Crawler service stopped.'); process.exit(0); });
