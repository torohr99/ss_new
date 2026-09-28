-- Remove the temporary database default from FantasyLeague.season.
--
-- Existing FantasyLeague rows already have an explicit season value.
-- New leagues must receive their season from application code.

ALTER TABLE "FantasyLeague"
ALTER COLUMN "season" DROP DEFAULT;