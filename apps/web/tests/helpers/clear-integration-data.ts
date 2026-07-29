import { prisma } from '@re-agent/database';

export async function clearIntegrationData() {
  await prisma.buyerPersona.updateMany({ data: { latestSnapshotId: null } });
  await prisma.personaEvidenceLink.deleteMany();
  await prisma.personaDimensionAssessment.deleteMany();
  await prisma.personaSnapshot.deleteMany();
  await prisma.buyerPersona.deleteMany();
  await prisma.signalEvidence.deleteMany();
  await prisma.contentSignal.deleteMany();
  await prisma.observationRecord.deleteMany();
  await prisma.anchor.deleteMany();
  await prisma.platformAccount.deleteMany();
  await prisma.keywordTagLink.deleteMany();
  await prisma.keywordRoleLink.deleteMany();
  await prisma.keywordVariant.deleteMany();
  await prisma.keyword.deleteMany();
  await prisma.keywordTag.deleteMany();
  await prisma.keywordCategory.deleteMany();
}
