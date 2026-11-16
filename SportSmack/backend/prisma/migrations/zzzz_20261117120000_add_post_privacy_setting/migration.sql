-- Existing and new accounts default to friends-only visibility.
-- The database constraint prevents invalid privacy values from being stored.
ALTER TABLE "User"
ADD COLUMN "postPrivacy" TEXT NOT NULL DEFAULT 'FRIENDS_ONLY';

ALTER TABLE "User"
ADD CONSTRAINT "User_postPrivacy_check"
CHECK ("postPrivacy" IN ('FRIENDS_ONLY', 'PUBLIC'));
