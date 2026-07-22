import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
export async function checkDatabase() { await prisma.$queryRawUnsafe('SELECT 1'); return { status: 'healthy' as const }; }
export async function closeDatabase() { await prisma.$disconnect(); }
