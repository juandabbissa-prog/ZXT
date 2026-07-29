CREATE TYPE "BuyerPersonaStatus" AS ENUM ('DRAFT', 'ACTIVE', 'STALE', 'ARCHIVED');
CREATE TYPE "PersonaDimensionCategory" AS ENUM (
  'BASIC_DEMOGRAPHICS',
  'FAMILY_STRUCTURE',
  'WORK_AREA',
  'COMMUTE_RELATIONSHIP',
  'CURRENT_RESIDENTIAL_AREA',
  'INTEREST_PREFERENCE',
  'PROPERTY_PURCHASE_NEED',
  'BUDGET_RANGE',
  'PURCHASE_STAGE',
  'INTENT_INDICATOR'
);
CREATE TYPE "PersonaCognitiveStatus" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN');
CREATE TYPE "PersonaAssessmentStatus" AS ENUM ('CURRENT', 'SUPERSEDED', 'EXPIRED');
CREATE TYPE "PersonaEvidenceRelation" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'CONTEXT_ONLY');

CREATE TABLE "buyer_personas" (
  "id" UUID NOT NULL,
  "subject_reference" VARCHAR(160),
  "status" "BuyerPersonaStatus" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "last_assessed_at" TIMESTAMPTZ(3),
  "latest_snapshot_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "archived_at" TIMESTAMPTZ(3),
  CONSTRAINT "buyer_personas_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "persona_dimension_assessments" (
  "id" UUID NOT NULL,
  "buyer_persona_id" UUID NOT NULL,
  "category" "PersonaDimensionCategory" NOT NULL,
  "dimension_key" VARCHAR(120) NOT NULL,
  "normalized_value" JSONB,
  "cognitive_status" "PersonaCognitiveStatus" NOT NULL,
  "confidence" INTEGER NOT NULL,
  "rationale" VARCHAR(1000),
  "valid_from" TIMESTAMPTZ(3) NOT NULL,
  "valid_until" TIMESTAMPTZ(3),
  "assessed_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "PersonaAssessmentStatus" NOT NULL DEFAULT 'CURRENT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "change_reason" VARCHAR(500),
  "superseded_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "persona_dimension_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "persona_assessment_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "persona_assessment_validity_check" CHECK ("valid_until" IS NULL OR "valid_until" >= "valid_from")
);

CREATE TABLE "persona_evidence_links" (
  "id" UUID NOT NULL,
  "buyer_persona_id" UUID NOT NULL,
  "assessment_id" UUID,
  "content_signal_id" UUID NOT NULL,
  "signal_evidence_id" UUID,
  "relation" "PersonaEvidenceRelation" NOT NULL,
  "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" VARCHAR(1000),
  "confidence_snapshot" INTEGER NOT NULL,
  "valid_until_snapshot" TIMESTAMPTZ(3),
  CONSTRAINT "persona_evidence_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "persona_evidence_confidence_check" CHECK ("confidence_snapshot" BETWEEN 0 AND 100),
  CONSTRAINT "persona_evidence_validity_check" CHECK ("valid_until_snapshot" IS NULL OR "valid_until_snapshot" >= "observed_at")
);

CREATE TABLE "persona_snapshots" (
  "id" UUID NOT NULL,
  "buyer_persona_id" UUID NOT NULL,
  "snapshot_version" INTEGER NOT NULL,
  "persona_version" INTEGER NOT NULL,
  "dimensions" JSONB NOT NULL,
  "evidence_summary" JSONB NOT NULL,
  "missing_dimensions" JSONB NOT NULL,
  "generated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "valid_until" TIMESTAMPTZ(3),
  "reason" VARCHAR(500),
  CONSTRAINT "persona_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "buyer_personas_subject_reference_key" ON "buyer_personas"("subject_reference");
CREATE UNIQUE INDEX "buyer_personas_latest_snapshot_id_key" ON "buyer_personas"("latest_snapshot_id");
CREATE INDEX "buyer_personas_status_idx" ON "buyer_personas"("status");
CREATE INDEX "buyer_personas_updated_at_idx" ON "buyer_personas"("updated_at" DESC);
CREATE UNIQUE INDEX "persona_dimension_assessments_buyer_persona_id_dimension_key_version_key"
  ON "persona_dimension_assessments"("buyer_persona_id", "dimension_key", "version");
CREATE UNIQUE INDEX "persona_dimension_assessments_current_key"
  ON "persona_dimension_assessments"("buyer_persona_id", "dimension_key")
  WHERE "status" = 'CURRENT';
CREATE INDEX "persona_dimension_assessments_buyer_persona_id_status_idx"
  ON "persona_dimension_assessments"("buyer_persona_id", "status");
CREATE INDEX "persona_dimension_assessments_category_idx"
  ON "persona_dimension_assessments"("category");
CREATE UNIQUE INDEX "persona_evidence_links_identity_key"
  ON "persona_evidence_links"(
    "buyer_persona_id",
    COALESCE("assessment_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "content_signal_id",
    COALESCE("signal_evidence_id", '00000000-0000-0000-0000-000000000000'::uuid),
    "relation"
  );
CREATE INDEX "persona_evidence_links_buyer_persona_id_linked_at_idx"
  ON "persona_evidence_links"("buyer_persona_id", "linked_at" DESC);
CREATE INDEX "persona_evidence_links_assessment_id_idx" ON "persona_evidence_links"("assessment_id");
CREATE INDEX "persona_evidence_links_content_signal_id_idx" ON "persona_evidence_links"("content_signal_id");
CREATE INDEX "persona_evidence_links_signal_evidence_id_idx" ON "persona_evidence_links"("signal_evidence_id");
CREATE UNIQUE INDEX "persona_snapshots_buyer_persona_id_snapshot_version_key"
  ON "persona_snapshots"("buyer_persona_id", "snapshot_version");
CREATE INDEX "persona_snapshots_buyer_persona_id_generated_at_idx"
  ON "persona_snapshots"("buyer_persona_id", "generated_at" DESC);

ALTER TABLE "persona_dimension_assessments"
  ADD CONSTRAINT "persona_dimension_assessments_buyer_persona_id_fkey"
  FOREIGN KEY ("buyer_persona_id") REFERENCES "buyer_personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_evidence_links"
  ADD CONSTRAINT "persona_evidence_links_buyer_persona_id_fkey"
  FOREIGN KEY ("buyer_persona_id") REFERENCES "buyer_personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_evidence_links"
  ADD CONSTRAINT "persona_evidence_links_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "persona_dimension_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_evidence_links"
  ADD CONSTRAINT "persona_evidence_links_content_signal_id_fkey"
  FOREIGN KEY ("content_signal_id") REFERENCES "content_signals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_evidence_links"
  ADD CONSTRAINT "persona_evidence_links_signal_evidence_id_fkey"
  FOREIGN KEY ("signal_evidence_id") REFERENCES "signal_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "persona_snapshots"
  ADD CONSTRAINT "persona_snapshots_buyer_persona_id_fkey"
  FOREIGN KEY ("buyer_persona_id") REFERENCES "buyer_personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "buyer_personas"
  ADD CONSTRAINT "buyer_personas_latest_snapshot_id_fkey"
  FOREIGN KEY ("latest_snapshot_id") REFERENCES "persona_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
