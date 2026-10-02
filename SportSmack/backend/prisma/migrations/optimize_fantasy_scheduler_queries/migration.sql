-- Optimize active fantasy league pagination for the scheduler.
CREATE INDEX "FantasyLeague_status_id_idx"
ON "FantasyLeague" ("status", "id");

-- Optimize discovery of leagues with pending waiver claims.
CREATE INDEX "FantasyWaiverClaim_status_leagueId_idx"
ON "FantasyWaiverClaim" ("status", "leagueId");