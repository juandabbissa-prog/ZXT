import { prisma } from '@re-agent/database';
import { runInTransaction } from '../../infrastructure/persistence/transaction-runner';
import { PrismaBuyerPersonaRepository } from '../buyer-persona/buyer-persona.repository.prisma';
import { PrismaContentSignalRepository } from '../content-signal/content-signal.repository.prisma';
import { PrismaLeadScoringRepository } from './lead-scoring.repository.prisma';
import { LeadScoringService } from './lead-scoring.service';

export const leadScoringService = new LeadScoringService(
  new PrismaLeadScoringRepository(prisma),
  new PrismaBuyerPersonaRepository(prisma),
  new PrismaContentSignalRepository(prisma),
  { run: (operation) => runInTransaction(prisma, operation) },
);
