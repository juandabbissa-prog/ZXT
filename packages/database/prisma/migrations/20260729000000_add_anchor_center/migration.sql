CREATE TYPE "PlatformAccountStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "AnchorPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "AnchorStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "AnchorRiskLevel" AS ENUM ('UNKNOWN', 'LOW', 'MEDIUM', 'HIGH');

CREATE TABLE "platform_accounts" (
    "id" UUID NOT NULL,
    "platform" VARCHAR(64) NOT NULL,
    "account_name" VARCHAR(160) NOT NULL,
    "account_identifier" VARCHAR(160) NOT NULL,
    "profile_url" VARCHAR(2048) NOT NULL,
    "follower_count" INTEGER NOT NULL DEFAULT 0,
    "content_domains" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "region_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "PlatformAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_accounts_follower_count_check" CHECK ("follower_count" >= 0)
);

CREATE TABLE "anchors" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "platform_account_id" UUID NOT NULL,
    "observation_reason" VARCHAR(1000) NOT NULL,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "priority" "AnchorPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "AnchorStatus" NOT NULL DEFAULT 'ACTIVE',
    "risk_level" "AnchorRiskLevel" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "anchors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "observation_records" (
    "id" UUID NOT NULL,
    "anchor_id" UUID NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "source" VARCHAR(64) NOT NULL,
    "result" VARCHAR(2000) NOT NULL,
    "notes" VARCHAR(2000),
    "confidence" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observation_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "observation_records_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);

CREATE UNIQUE INDEX "platform_accounts_platform_account_identifier_key"
    ON "platform_accounts"("platform", "account_identifier");
CREATE INDEX "platform_accounts_platform_idx" ON "platform_accounts"("platform");
CREATE INDEX "platform_accounts_status_idx" ON "platform_accounts"("status");
CREATE INDEX "platform_accounts_updated_at_idx" ON "platform_accounts"("updated_at" DESC);

CREATE UNIQUE INDEX "anchors_platform_account_id_key" ON "anchors"("platform_account_id");
CREATE INDEX "anchors_status_idx" ON "anchors"("status");
CREATE INDEX "anchors_priority_idx" ON "anchors"("priority");
CREATE INDEX "anchors_risk_level_idx" ON "anchors"("risk_level");
CREATE INDEX "anchors_updated_at_idx" ON "anchors"("updated_at" DESC);

CREATE INDEX "observation_records_anchor_id_observed_at_idx"
    ON "observation_records"("anchor_id", "observed_at" DESC);
CREATE INDEX "observation_records_source_idx" ON "observation_records"("source");

ALTER TABLE "anchors"
    ADD CONSTRAINT "anchors_platform_account_id_fkey"
    FOREIGN KEY ("platform_account_id") REFERENCES "platform_accounts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "observation_records"
    ADD CONSTRAINT "observation_records_anchor_id_fkey"
    FOREIGN KEY ("anchor_id") REFERENCES "anchors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
