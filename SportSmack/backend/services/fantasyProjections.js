const axios = require('axios');
const {
  getOrSetJson
} = require('./cache');

const CURRENT_SEASON = 2026;
const CACHE_TTL_SECONDS = 60 * 60;

async function loadWeeklyProjections(
  weekNumber
) {
  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CURRENT_SEASON}` +
    `/segments/0/leaguedefaults/3`;

  const fantasyFilter = {
    players: {
      limit: 3000,
  
      sortPercOwned: {
        sortPriority: 4,
        sortAsc: false
      }
    }
  };

  const response =
    await axios.get(url, {
      params: {
        view: 'kona_player_info',
        scoringPeriodId: weekNumber
      },
      headers: {
        'X-Fantasy-Filter':
          JSON.stringify(
            fantasyFilter
          )
      },
      timeout: 30000
    });

  const players =
    response.data?.players || [];

  const projectionMap = {};

  for (const entry of players) {
    const player =
      entry?.player;

    if (!player?.id) {
      continue;
    }

    const stats =
      player.stats ||
      entry?.playerPoolEntry?.stats ||
      [];

    const weeklyStats =
      stats.filter(
        stat =>
          Number(
            stat.scoringPeriodId
          ) === Number(weekNumber)
      );

    const candidate =
      weeklyStats.find(
        stat =>
          Number(
            stat.statSourceId
          ) === 1 &&
          Number(
            stat.statSplitTypeId
          ) === 1 &&
          Number(
            stat.scoringPeriodId
          ) === Number(
            weekNumber
          )
      ) ||
      weeklyStats.find(
        stat =>
          Number(
            stat.statTypeId
          ) === 2 &&
          Number(
            stat.scoringPeriodId
          ) === Number(
            weekNumber
          )
      );

    if (!candidate) {
      continue;
    }

    const value =
      candidate.appliedTotal ??
      candidate.appliedStatTotal ??
      candidate.fantasyPoints;
    
    const numericValue =
      Number(value);
    
    if (
      !Number.isFinite(
        numericValue
      )
    ) {
      continue;
    }
    
    const playerId =
      String(player.id);
    
    projectionMap[
      playerId
    ] = numericValue;
    
    /*
     * ESPN represents D/ST using the NFL
     * team's proTeamId rather than an athlete.
     *
     * SportSmack stores our synthetic D/ST
     * players as DST-{teamId}. Add the same
     * projection under that key so the
     * existing database representation
     * continues to work.
     */
    if (
      Number(
        player.defaultPositionId
      ) === 16
    ) {
      const dstTeamId =
        player.proTeamId ??
        player.teamId ??
        player.team?.id ??
        null;
    
      if (
        Number.isFinite(
          Number(dstTeamId)
        )
      ) {
        projectionMap[
          `DST-${dstTeamId}`
        ] = numericValue;
      }
    }
  }

  return projectionMap;
}

async function getWeeklyProjectedPoints(
  weekNumber
) {
  const week =
    Math.min(
      18,
      Math.max(
        1,
        Number(weekNumber) || 1
      )
    );

  return getOrSetJson(
    `fantasy:weekly-projections:v2:${CURRENT_SEASON}:${week}`,
    CACHE_TTL_SECONDS,
    () =>
      loadWeeklyProjections(
        week
      ),
    {
      lockTtlSeconds: 45,
      waitMs: 150,
      maxWaitMs: 5000
    }
  );
}

module.exports = {
  getWeeklyProjectedPoints
};
