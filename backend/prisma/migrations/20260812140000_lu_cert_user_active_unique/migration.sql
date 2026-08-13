-- One active Learning Universe certificate per user + learning universe.
-- Partial unique index preserves revoked historical rows and reissue flow.
CREATE UNIQUE INDEX IF NOT EXISTS "LearningUniverseCertificate_user_lu_active_key"
ON "LearningUniverseCertificate" ("user_id", "learning_universe_id")
WHERE "status" = 'active';
