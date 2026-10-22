-- CreateTable
CREATE TABLE "platform"."user_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'system',
    "density" TEXT NOT NULL DEFAULT 'comfortable',
    "focus_mode" BOOLEAN NOT NULL DEFAULT false,
    "reduce_motion" BOOLEAN NOT NULL DEFAULT false,
    "sidebar_collapsed" BOOLEAN NOT NULL DEFAULT false,
    "pause_character" BOOLEAN NOT NULL DEFAULT false,
    "room_view" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "platform"."user_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "platform"."user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "platform"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
