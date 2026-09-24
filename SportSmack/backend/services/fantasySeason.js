const NFL_REGULAR_SEASON_START_MONTH = 8;
// September = 8 in JavaScript UTC month indexing.

function getCurrentFantasySeason() {
  const now = new Date();
  const month = now.getUTCMonth();

  /*
   * NFL seasons are named for the year in which
   * the regular season begins.
   *
   * September through December:
   *   current calendar year
   *
   * January through August:
   *   previous calendar year
   */
  if (
    month >=
    NFL_REGULAR_SEASON_START_MONTH
  ) {
    return now.getUTCFullYear();
  }

  return now.getUTCFullYear() - 1;
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
  getPreviousFantasySeason,
  validateFantasySeason
};
