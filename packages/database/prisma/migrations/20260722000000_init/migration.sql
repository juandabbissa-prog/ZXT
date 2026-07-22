CREATE TABLE "SystemConfig" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SystemConfig_key_key" ON "SystemConfig"("key");

CREATE TABLE "SystemEvent" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SystemEvent_type_idx" ON "SystemEvent"("type");
CREATE INDEX "SystemEvent_source_idx" ON "SystemEvent"("source");
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");
