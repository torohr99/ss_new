const assert = require('assert');

const {
  calculatePointsAllowedPoints,
  calculateDSTPoints,
  calculatePlayerPoints
} = require('./fantasyStats');

/*
 * Kicker:
 * 2 field goals + 2 extra points =
 * 2 * 3 + 2 * 1 = 8 points.
 */
assert.strictEqual(
  calculatePlayerPoints({
    passingYards: 0,
    passingTD: 0,
    interceptions: 0,
    rushingYards: 0,
    rushingTD: 0,
    receptions: 0,
    receivingYards: 0,
    receivingTD: 0,
    fumbles: 0,
    twoPointConversions: 0,
    extraPoints: 2,
    fieldGoals: 2,
    sacks: 0,
    defensiveInterceptions: 0,
    fumbleRecoveries: 0,
    defensiveTD: 0,
    safeties: 0,
    blockedKicks: 0,
    specialTeamsTD: 0
  }),
  8
);

/*
 * Points-allowed tiers.
 */
assert.strictEqual(
  calculatePointsAllowedPoints(0),
  10
);

assert.strictEqual(
  calculatePointsAllowedPoints(6),
  7
);

assert.strictEqual(
  calculatePointsAllowedPoints(13),
  4
);

assert.strictEqual(
  calculatePointsAllowedPoints(20),
  1
);

assert.strictEqual(
  calculatePointsAllowedPoints(27),
  0
);

assert.strictEqual(
  calculatePointsAllowedPoints(34),
  -1
);

assert.strictEqual(
  calculatePointsAllowedPoints(35),
  -4
);

assert.strictEqual(
  calculatePointsAllowedPoints(50),
  -4
);

/*
 * Example D/ST:
 * 35+ points allowed = -4
 * 3 sacks = +3
 * 1 interception = +2
 * 1 fumble recovery = +2
 * Total = +3
 */
assert.strictEqual(
  calculateDSTPoints(
    {
      sacks: 3,
      defensiveInterceptions: 1,
      fumbleRecoveries: 1,
      defensiveTD: 0,
      safeties: 0,
      blockedKicks: 0,
      specialTeamsTD: 0
    },
    35
  ),
  3
);

/*
 * A terrible defensive performance can
 * legitimately produce a negative score.
 */
assert.ok(
  calculateDSTPoints(
    {
      sacks: 0,
      defensiveInterceptions: 0,
      fumbleRecoveries: 0,
      defensiveTD: 0,
      safeties: 0,
      blockedKicks: 0,
      specialTeamsTD: 0
    },
    35
  ) < 0
);

console.log(
  'fantasyStats tests passed.'
);
