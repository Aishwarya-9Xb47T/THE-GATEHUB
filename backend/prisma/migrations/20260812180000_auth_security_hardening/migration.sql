-- Auth security hardening: email verification + one-time tokens + security audit log
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pending_email" TEXT;

UPDATE "User" SET "email_verified" = true, "email_verified_at" = COALESCE("email_verified_at", NOW()) WHERE "email_verified" = false;

CREATE TABLE IF NOT EXISTS "AuthToken" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "payload" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthToken_token_hash_key" ON "AuthToken"("token_hash");
CREATE INDEX IF NOT EXISTS "AuthToken_user_id_type_idx" ON "AuthToken"("user_id", "type");
CREATE INDEX IF NOT EXISTS "AuthToken_expires_at_idx" ON "AuthToken"("expires_at");
CREATE INDEX IF NOT EXISTS "AuthToken_type_used_at_idx" ON "AuthToken"("type", "used_at");

DO $$ BEGIN
  ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SecurityAuditLog" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "email" TEXT,
    "action" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SecurityAuditLog_action_created_at_idx" ON "SecurityAuditLog"("action", "created_at");
CREATE INDEX IF NOT EXISTS "SecurityAuditLog_user_id_created_at_idx" ON "SecurityAuditLog"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "SecurityAuditLog_email_created_at_idx" ON "SecurityAuditLog"("email", "created_at");

DO $$ BEGIN
  ALTER TABLE "SecurityAuditLog" ADD CONSTRAINT "SecurityAuditLog_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
