const axios = require('axios');

const cache = require('./cache');

const ESPN_NFL_SCOREBOARD_URL =
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';

const CACHE_TTL_SECONDS =
  24 * 60 * 60;

const LOCK_TTL_SECONDS = 30;
const WAIT_MS = 100;
const MAX_WAIT_MS = 3000;

/**
 * Return the NFL season year associated with a fantasy week.
 *
 * NFL seasons begin in the calendar year in which the
 * regular season starts. The current date is sufficient
 * for determining the active season because the NFL
 * regular season spans only September through January.
 *
 * During January, the current calendar year still belongs
 * to the NFL season that began the previous year, so we
 * determine the season from ESPN rather than assuming
 * January belongs to the new season.
 */
function getCurrentNFLSeason() {
  const now = new Date();

  /*
   * September through December:
   * the NFL season began this calendar year.
   */
  if (now.getUTCMonth() >= 8) {
    return now.getUTCFullYear();
  }

  /*
   * January through August:
   * the active NFL season began the previous
   * calendar year.
   */
  return now.getUTCFullYear() - 1;
}

/**
 * Fetch the schedule for one NFL regular-season week.
 *
 * ESPN supports:
 *   seasontype=2 -> regular season
 *   week=N       -> specific NFL week
 *   season=YYYY  -> specific NFL season
 *
 * The schedule returned by ESPN contains the actual
 * kickoff timestamps, so we do not need to hardcode
 * Thursday/Sunday/etc. dates.
 */
async function loadWeekSchedule(
  season,
  weekNumber
) {
  try {
    const response =
      await axios.get(
        ESPN_NFL_SCOREBOARD_URL,
        {
          params: {
            season,
            seasontype: 2,
            week: weekNumber
          },
          timeout: 15000
        }
      );

    const events =
      Array.isArray(
        response.data?.events
      )
        ? response.data.events
        : [];

    return events
      .map(event => ({
        id: event?.id || null,
        date: event?.date || null
      }))
      .filter(event => {
        if (!event.date) {
          return false;
        }

        const timestamp =
          new Date(event.date).getTime();

        return Number.isFinite(timestamp);
      });
  } catch (error) {
    console.error(
      `ESPN NFL schedule error for ` +
      `${season} Week ${weekNumber}:`,
      error.message
    );

    return [];
  }
}

/**
 * Return the timestamp of the first NFL game
 * of the specified fantasy week.
 *
 * The result is cached in Redis for 24 hours.
 *
 * This means roster requests do NOT repeatedly
 * hit ESPN, even with many users or multiple
 * backend replicas.
 */
async function getFantasyWeekLockTime(
  weekNumber
) {
  const week =
    Number(weekNumber);

  if (
    !Number.isInteger(week) ||
    week < 1 ||
    week > 18
  ) {
    return null;
  }

  const season =
    getCurrentNFLSeason();

  const cacheKey =
    `fantasy:nfl:week-lock:${season}:${week}`;

  return cache.getOrSetJson(
    cacheKey,
    CACHE_TTL_SECONDS,
    async () => {
      const events =
        await loadWeekSchedule(
          season,
          week
        );

      if (!events.length) {
        return null;
      }

      const kickoffTimes =
        events
          .map(
            event =>
              new Date(
                event.date
              ).getTime()
          )
          .filter(
            timestamp =>
              Number.isFinite(
                timestamp
              )
          );

      if (!kickoffTimes.length) {
        return null;
      }

      return Math.min(
        ...kickoffTimes
      );
    },
    {
      lockTtlSeconds:
        LOCK_TTL_SECONDS,

      waitMs:
        WAIT_MS,

      maxWaitMs:
        MAX_WAIT_MS
    }
  );
}

module.exports = {
  getFantasyWeekLockTime
};
