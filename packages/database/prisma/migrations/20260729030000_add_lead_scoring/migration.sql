CREATE TYPE "PurchaseStage" AS ENUM ('UNKNOWN', 'AWARENESS', 'EXPLORATION', 'COMPARISON', 'DECISION_PREPARATION');
CREATE TYPE "LeadGrade" AS ENUM ('UNASSESSED', 'LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "ScoreBasisType" AS ENUM ('PERSONA_DIMENSION', 'CONTENT_SIGNAL', 'EVIDENCE', 'PERSONA_SNAPSHOT');
CREATE TYPE "ScoreBasisDirection" AS ENUM ('SUPPORTS', 'CONTRADICTS', 'CONTEXT_ONLY');

CREATE TABLE "lead_score_assessments" (
  "id" UUID NOT NULL,
  "persona_id" UUID NOT NULL,
  "persona_snapshot_id" UUID NOT NULL,
  "purchase_stage" "PurchaseStage" NOT NULL,
  "lead_grade" "LeadGrade" NOT NULL,
  "score" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "explanation" VARCHAR(2000) NOT NULL,
  "policy_version" VARCHAR(64) NOT NULL,
  "input_fingerprint" VARCHAR(128) NOT NULL,
  "assessed_at" TIMESTAMPTZ(3) NOT NULL,
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_score_assessments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_score_assessment_score_check" CHECK ("score" BETWEEN 0 AND 100),
  CONSTRAINT "lead_score_assessment_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100),
  CONSTRAINT "lead_score_assessment_window_check" CHECK ("expires_at" IS NULL OR "expires_at" >= "assessed_at")
);

CREATE TABLE "lead_score_bases" (
  "id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "basis_type" "ScoreBasisType" NOT NULL,
  "source_id" UUID NOT NULL,
  "direction" "ScoreBasisDirection" NOT NULL,
  "contribution" INTEGER NOT NULL,
  "confidence" INTEGER NOT NULL,
  "reason_code" VARCHAR(120) NOT NULL,
  "explanation" VARCHAR(1000) NOT NULL,
  "observed_at" TIMESTAMPTZ(3),
  "expires_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_score_bases_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_score_basis_contribution_check" CHECK ("contribution" BETWEEN -100 AND 100),
  CONSTRAINT "lead_score_basis_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);

CREATE TABLE "lead_score_evidence_links" (
  "id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "source_type" "ScoreBasisType" NOT NULL,
  "source_id" UUID NOT NULL,
  "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_score_evidence_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_score_assessments_input_fingerprint_policy_version_key" ON "lead_score_assessments"("input_fingerprint", "policy_version");
CREATE INDEX "lead_score_assessments_persona_id_assessed_at_idx" ON "lead_score_assessments"("persona_id", "assessed_at" DESC);
CREATE INDEX "lead_score_assessments_persona_snapshot_id_idx" ON "lead_score_assessments"("persona_snapshot_id");
CREATE INDEX "lead_score_bases_assessment_id_idx" ON "lead_score_bases"("assessment_id");
CREATE INDEX "lead_score_bases_basis_type_source_id_idx" ON "lead_score_bases"("basis_type", "source_id");
CREATE UNIQUE INDEX "lead_score_evidence_links_assessment_id_source_type_source_id_key" ON "lead_score_evidence_links"("assessment_id", "source_type", "source_id");
CREATE INDEX "lead_score_evidence_links_source_type_source_id_idx" ON "lead_score_evidence_links"("source_type", "source_id");

ALTER TABLE "lead_score_assessments" ADD CONSTRAINT "lead_score_assessments_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "buyer_personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_score_assessments" ADD CONSTRAINT "lead_score_assessments_persona_snapshot_id_fkey" FOREIGN KEY ("persona_snapshot_id") REFERENCES "persona_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_score_bases" ADD CONSTRAINT "lead_score_bases_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "lead_score_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lead_score_evidence_links" ADD CONSTRAINT "lead_score_evidence_links_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "lead_score_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
