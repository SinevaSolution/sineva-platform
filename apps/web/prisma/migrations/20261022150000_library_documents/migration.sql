-- CreateTable
CREATE TABLE "platform"."library_folders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "parent_id" UUID,
    "parent_key" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."library_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "folder_id" UUID,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "storage_key" TEXT,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'unknown',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "status_detail" JSONB,
    "page_count" INTEGER,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "ocr_page_count" INTEGER NOT NULL DEFAULT 0,
    "embedding_model" TEXT,
    "last_indexed_at" TIMESTAMPTZ(6),
    "source_updated_at" TIMESTAMPTZ(6),
    "review_interval_days" INTEGER,
    "review_due_at" TIMESTAMPTZ(6),
    "review_reminded_at" TIMESTAMPTZ(6),
    "ingest_job_id" UUID,
    "ingest_attempted_at" TIMESTAMPTZ(6),
    "last_ingest_sequence" INTEGER NOT NULL DEFAULT 0,
    "acl_synced_at" TIMESTAMPTZ(6),
    "uploaded_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."library_document_scopes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_document_scopes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform"."library_ingest_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "event_id" UUID,
    "job_id" UUID,
    "sequence" INTEGER,
    "stage" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "status" TEXT,
    "detail" JSONB,
    "applied" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_ingest_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_folders_workspace_id_parent_id_idx" ON "platform"."library_folders"("workspace_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "library_folders_workspace_id_parent_key_name_key" ON "platform"."library_folders"("workspace_id", "parent_key", "name");

-- CreateIndex
CREATE INDEX "library_documents_workspace_id_status_idx" ON "platform"."library_documents"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "library_documents_workspace_id_content_hash_idx" ON "platform"."library_documents"("workspace_id", "content_hash");

-- CreateIndex
CREATE INDEX "library_documents_workspace_id_folder_id_idx" ON "platform"."library_documents"("workspace_id", "folder_id");

-- CreateIndex
CREATE INDEX "library_documents_review_due_at_idx" ON "platform"."library_documents"("review_due_at");

-- CreateIndex
CREATE INDEX "library_document_scopes_workspace_id_scope_type_scope_ref_idx" ON "platform"."library_document_scopes"("workspace_id", "scope_type", "scope_ref");

-- CreateIndex
CREATE UNIQUE INDEX "library_document_scopes_document_id_scope_type_scope_ref_key" ON "platform"."library_document_scopes"("document_id", "scope_type", "scope_ref");

-- CreateIndex
CREATE INDEX "library_ingest_events_document_id_created_at_idx" ON "platform"."library_ingest_events"("document_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "library_ingest_events_document_id_event_id_key" ON "platform"."library_ingest_events"("document_id", "event_id");

-- AddForeignKey
ALTER TABLE "platform"."library_folders" ADD CONSTRAINT "library_folders_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_folders" ADD CONSTRAINT "library_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "platform"."library_folders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_documents" ADD CONSTRAINT "library_documents_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_documents" ADD CONSTRAINT "library_documents_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "platform"."library_folders"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_document_scopes" ADD CONSTRAINT "library_document_scopes_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "platform"."library_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_document_scopes" ADD CONSTRAINT "library_document_scopes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_ingest_events" ADD CONSTRAINT "library_ingest_events_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "platform"."library_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform"."library_ingest_events" ADD CONSTRAINT "library_ingest_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "platform"."workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
