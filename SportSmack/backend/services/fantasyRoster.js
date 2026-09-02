const STARTER_LIMITS = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DST: 1
};

function normalizePosition(position) {
  return String(position || '').toUpperCase();
}

function validateStarterRoster(players) {
  const starters = players.filter(
    p => p.status === 'STARTER'
  );

  const counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  for (const player of starters) {
    const position =
      normalizePosition(player.player.position);

    if (counts[position] !== undefined) {
      counts[position]++;
    }
  }

  if (counts.QB > 1)
    return 'You can only start 1 QB.';

  if (counts.RB > 3)
    return 'You can only start 3 RBs including FLEX.';

  if (counts.WR > 3)
    return 'You can only start 3 WRs including FLEX.';

  if (counts.TE > 2)
    return 'You can only start 2 TEs including FLEX.';

  if (counts.K > 1)
    return 'You can only start 1 K.';

  if (counts.DST > 1)
    return 'You can only start 1 DST.';

  const flexUsed =
    Math.max(0, counts.RB - 2) +
    Math.max(0, counts.WR - 2) +
    Math.max(0, counts.TE - 1);

  if (flexUsed > 1)
    return 'You can only use 1 FLEX position.';

  return null;
}

module.exports = {
  normalizePosition,
  validateStarterRoster
};
