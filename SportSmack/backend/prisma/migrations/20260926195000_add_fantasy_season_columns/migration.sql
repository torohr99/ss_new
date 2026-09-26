-- Add season to FantasyLeague.
-- Existing leagues are assigned to the current 2026 fantasy season.
ALTER TABLE "FantasyLeague"
ADD COLUMN "season" INTEGER NOT NULL DEFAULT 2026;

-- Add season to FantasyPlayer.
-- Existing players are assigned to the 2026 fantasy season.
ALTER TABLE "FantasyPlayer"
ADD COLUMN "season" INTEGER NOT NULL DEFAULT 2026;

-- Remove the old globally-unique ESPN ID constraint.
-- ESPN IDs only need to be unique within a fantasy season.
DROP INDEX "FantasyPlayer_espnId_key";

-- Remove the temporary database default.
-- The Prisma schema requires application code to provide season
-- for newly created FantasyPlayer records.
ALTER TABLE "FantasyPlayer"
ALTER COLUMN "season" DROP DEFAULT;

-- Enforce ESPN ID uniqueness within each fantasy season.
CREATE UNIQUE INDEX "FantasyPlayer_season_espnId_key"
ON "FantasyPlayer"("season", "espnId");

-- Add season-aware lookup indexes.
CREATE INDEX "FantasyPlayer_season_position_name_idx"
ON "FantasyPlayer"("season", "position", "name");

CREATE INDEX "FantasyPlayer_season_team_idx"
ON "FantasyPlayer"("season", "team");