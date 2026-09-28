const NFL_REGULAR_SEASON_START_MONTH = 8;
// September = 8 in JavaScript UTC month indexing.

function getFantasySeasonForDate(date) {
  const value =
    date instanceof Date
      ? date
      : new Date(date);

  if (
    Number.isNaN(
      value.getTime()
    )
  ) {
    throw new Error(
      `Invalid date: ${date}`
    );
  }

  const month =
    value.getUTCMonth();

  if (
    month >=
    NFL_REGULAR_SEASON_START_MONTH
  ) {
    return value.getUTCFullYear();
  }

  return (
    value.getUTCFullYear() - 1
  );
}

function getCurrentFantasySeason() {
  return getFantasySeasonForDate(
    new Date()
  );
}

function getPreviousFantasySeason(
  season = getCurrentFantasySeason()
) {
  return Number(season) - 1;
}

function validateFantasySeason(
  season
) {
  const value =
    Number(season);

  if (
    !Number.isInteger(value) ||
    value < 2000 ||
    value > 2100
  ) {
    throw new Error(
      `Invalid fantasy season: ${season}`
    );
  }

  return value;
}

module.exports = {
  getCurrentFantasySeason,
  getFantasySeasonForDate,
  getPreviousFantasySeason,
  validateFantasySeason
};