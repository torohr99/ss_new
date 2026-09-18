const axios = require('axios');
const {
  getOrSetJson
} = require('./cache');

const CURRENT_SEASON = 2026;
const CACHE_TTL_SECONDS = 6 * 60 * 60;

async function loadWeeklyProjections(
  weekNumber
) {
  const url =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${CURRENT_SEASON}` +
    `/segments/0/leaguedefaults/3`;

  const fantasyFilter = {
    players: {
      limit: 3000,
  
      filterStatsForSourceIds: {
        value: [1]
      },
  
      filterStatsForSplitTypeIds: {
        value: [1]
      },
  
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
          Number(stat.statSourceId) === 1 &&
          (
            stat.statSplitTypeId == null ||
            Number(
              stat.statSplitTypeId
            ) === 1
          )
      ) ||
      weeklyStats.find(
        stat =>
          Number(stat.statTypeId) === 2
      ) ||
      weeklyStats.find(
        stat =>
          Number(stat.statTypeId) === 1
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
      Number.isFinite(
        numericValue
      )
    ) {
      projectionMap[
        String(player.id)
      ] = numericValue;
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
    `fantasy:weekly-projections:${CURRENT_SEASON}:${week}`,
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
