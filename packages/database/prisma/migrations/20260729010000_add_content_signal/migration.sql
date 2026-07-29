CREATE TYPE "ContentSignalType" AS ENUM ('DEMAND', 'PAIN_POINT', 'PREFERENCE', 'OBJECTION', 'INTENT');
CREATE TYPE "ContentSignalStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "SignalSourceType" AS ENUM ('MANUAL', 'IMPORT', 'AUTHORIZED_API', 'SYSTEM');
CREATE TYPE "SignalEvidenceType" AS ENUM ('TEXT', 'URL', 'METRIC', 'OBSERVATION');
CREATE TYPE "SignalEvidenceStatus" AS ENUM ('AVAILABLE', 'REDACTED');

CREATE TABLE "content_signals" (
    "id" UUID NOT NULL,
    "anchor_id" UUID NOT NULL,
    "keyword_id" UUID,
    "type" "ContentSignalType" NOT NULL,
    "summary" VARCHAR(1000) NOT NULL,
    "normalized_summary" VARCHAR(1000) NOT NULL,
    "source_type" "SignalSourceType" NOT NULL,
    "source_reference" VARCHAR(2048),
    "source_description" VARCHAR(1000),
    "confidence" INTEGER NOT NULL,
    "confidence_rationale" VARCHAR(1000) NOT NULL,
    "occurred_at" TIMESTAMPTZ(3),
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "ContentSignalStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "content_signals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_signals_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
    CONSTRAINT "content_signals_timestamp_check" CHECK ("occurred_at" <= "observed_at")
);

CREATE TABLE "signal_evidence" (
    "id" UUID NOT NULL,
    "content_signal_id" UUID NOT NULL,
    "type" "SignalEvidenceType" NOT NULL,
    "status" "SignalEvidenceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "content" VARCHAR(2000) NOT NULL,
    "reference_url" VARCHAR(2048),
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signal_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_signals_anchor_type_summary_occurred_key"
    ON "content_signals"("anchor_id", "type", "normalized_summary", "occurred_at") NULLS NOT DISTINCT;
CREATE INDEX "content_signals_anchor_id_status_observed_at_idx"
    ON "content_signals"("anchor_id", "status", "observed_at" DESC);
CREATE INDEX "content_signals_keyword_id_idx" ON "content_signals"("keyword_id");
CREATE INDEX "signal_evidence_content_signal_id_observed_at_idx"
    ON "signal_evidence"("content_signal_id", "observed_at" DESC);

ALTER TABLE "content_signals"
    ADD CONSTRAINT "content_signals_anchor_id_fkey"
    FOREIGN KEY ("anchor_id") REFERENCES "anchors"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_signals"
    ADD CONSTRAINT "content_signals_keyword_id_fkey"
    FOREIGN KEY ("keyword_id") REFERENCES "keywords"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "signal_evidence"
    ADD CONSTRAINT "signal_evidence_content_signal_id_fkey"
    FOREIGN KEY ("content_signal_id") REFERENCES "content_signals"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
