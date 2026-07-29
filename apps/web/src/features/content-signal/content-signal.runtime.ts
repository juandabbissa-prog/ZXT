import { prisma } from '@re-agent/database';
import { PrismaAnchorRepository } from '../anchor/anchor.repository.prisma';
import { PrismaKeywordRepository } from '../keyword/keyword.repository.prisma';
import { runInTransaction } from '../../infrastructure/persistence/transaction-runner';
import { PrismaContentSignalRepository } from './content-signal.repository.prisma';
import { ContentSignalService } from './content-signal.service';

const contentSignalRepository = new PrismaContentSignalRepository(prisma);
const anchorRepository = new PrismaAnchorRepository(prisma);
const keywordRepository = new PrismaKeywordRepository(prisma);

export const contentSignalService = new ContentSignalService(
  contentSignalRepository,
  anchorRepository,
  keywordRepository,
  {
    run: (operation) => runInTransaction(prisma, operation),
  },
);
