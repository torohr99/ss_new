-- Add nullable hash columns without changing existing token behavior.
-- The application rollout and backfill are handled separately.
ALTER TABLE "User"
  ADD COLUMN "verificationTokenHash" TEXT,
  ADD COLUMN "verificationTokenExpires" TIMESTAMP(3),
  ADD COLUMN "resetPasswordTokenHash" TEXT;

CREATE UNIQUE INDEX "User_verificationTokenHash_key"
  ON "User"("verificationTokenHash");

CREATE UNIQUE INDEX "User_resetPasswordTokenHash_key"
  ON "User"("resetPasswordTokenHash");
