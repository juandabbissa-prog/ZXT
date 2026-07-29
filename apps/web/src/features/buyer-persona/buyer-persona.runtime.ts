import { prisma } from '@re-agent/database';
import { runInTransaction } from '../../infrastructure/persistence/transaction-runner';
import { PrismaContentSignalRepository } from '../content-signal/content-signal.repository.prisma';
import { PrismaBuyerPersonaRepository } from './buyer-persona.repository.prisma';
import { BuyerPersonaService } from './buyer-persona.service';

export const buyerPersonaService = new BuyerPersonaService(
  new PrismaBuyerPersonaRepository(prisma),
  new PrismaContentSignalRepository(prisma),
  { run: (operation) => runInTransaction(prisma, operation) },
);
