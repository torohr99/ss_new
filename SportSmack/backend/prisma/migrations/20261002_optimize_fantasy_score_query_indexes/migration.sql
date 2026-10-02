CREATE INDEX "FantasyPlayerWeeklyScore_weekNumber_playerId_idx"
ON "FantasyPlayerWeeklyScore" ("weekNumber", "playerId");

CREATE INDEX "FantasyWeeklyScore_weekNumber_teamId_idx"
ON "FantasyWeeklyScore" ("weekNumber", "teamId");