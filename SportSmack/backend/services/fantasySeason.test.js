const assert = require('assert');

const {
  getFantasySeasonForDate,
  getPreviousFantasySeason,
  validateFantasySeason
} = require('./fantasySeason');

assert.strictEqual(
  getFantasySeasonForDate(
    '2026-08-31T23:59:59Z'
  ),
  2025
);

assert.strictEqual(
  getFantasySeasonForDate(
    '2026-09-01T00:00:00Z'
  ),
  2026
);

assert.strictEqual(
  getFantasySeasonForDate(
    '2027-08-31T23:59:59Z'
  ),
  2026
);

assert.strictEqual(
  getFantasySeasonForDate(
    '2027-09-01T00:00:00Z'
  ),
  2027
);

assert.strictEqual(
  getPreviousFantasySeason(2026),
  2025
);

assert.strictEqual(
  getPreviousFantasySeason(2027),
  2026
);

assert.strictEqual(
  validateFantasySeason(2026),
  2026
);

assert.strictEqual(
  validateFantasySeason('2027'),
  2027
);

assert.throws(
  () => validateFantasySeason(1999),
  /Invalid fantasy season/
);

assert.throws(
  () => validateFantasySeason(2101),
  /Invalid fantasy season/
);

assert.throws(
  () => validateFantasySeason('not-a-season'),
  /Invalid fantasy season/
);

console.log(
  'fantasySeason tests passed.'
);
