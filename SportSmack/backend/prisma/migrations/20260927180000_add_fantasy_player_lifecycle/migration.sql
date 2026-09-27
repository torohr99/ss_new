-- Add current-season lifecycle tracking to fantasy players.
-- Historical season rows remain unchanged.

ALTER TABLE "FantasyPlayer"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "FantasyPlayer"
ADD COLUMN "lastSeenAt" TIMESTAMP(3);

CREATE INDEX "FantasyPlayer_season_isActive_position_idx"
ON "FantasyPlayer"("season", "isActive", "position");