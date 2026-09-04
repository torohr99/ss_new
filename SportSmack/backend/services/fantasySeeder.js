const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const VALID_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST'
]);

const CURRENT_SEASON = 2026;
const PREVIOUS_SEASON = 2025;

// ESPN fantasy football position IDs.
const ESPN_POSITION_IDS = {
  QB: 1,
  RB: 2,
  WR: 4,
  TE: 6,
  K: 5,
  DST: 16
};

async function fetchFantasyPool(season) {
  const url =
    `https://fantasy.espn.com/apis/v3/games/ffl/` +
    `seasons/${season}/segments/0/leaguedefaults/3`;

  const filter = {
    players: {
      limit: 3000,
      sortPercOwned: {
        sortPriority: 4,
        sortAsc: false
      }
    }
  };

  const response = await axios.get(url, {
    params: {
      scoringPeriodId: 0,
      view: 'kona_player_info'
    },
    headers: {
      'X-Fantasy-Filter': JSON.stringify(filter)
    },
    timeout: 30000
  });

  return Array.isArray(response.data?.players)
    ? response.data.players
    : [];
}

function getFantasyPoints(playerEntry, season) {
  const player = playerEntry?.player;

  if (!player) return null;

  const stats = Array.isArray(player.stats)
    ? player.stats
    : [];

  // Prefer the season-level stat entry for the requested season.
  const matchingSeasonStats = stats
    .filter(stat =>
      String(stat.seasonId) === String(season)
    )
    .sort((a, b) => {
      // Actual stats first.
      if (
        Number(a.statTypeId) === 0 &&
        Number(b.statTypeId) !== 0
      ) {
        return -1;
      }

      if (
        Number(b.statTypeId) === 0 &&
        Number(a.statTypeId) !== 0
      ) {
        return 1;
      }

      return 0;
    });

  const actual = matchingSeasonStats.find(
    stat => Number(stat.statTypeId) === 0
  );

  const projected = matchingSeasonStats.find(
    stat => Number(stat.statTypeId) === 1
  );

  const candidate =
    season === CURRENT_SEASON
      ? projected || actual
      : actual || projected;

  if (!candidate) return null;

  const value =
    candidate.appliedTotal ??
    candidate.appliedStatTotal ??
    candidate.fantasyPoints;

  const numericValue = Number(value);

  return Number.isFinite(numericValue)
    ? numericValue
    : null;
}

function getPlayerPosition(player) {
  const position =
    player?.defaultPositionId ??
    player?.position?.abbreviation ??
    player?.position;

  if (typeof position === 'string') {
    const normalized = position.toUpperCase();

    if (VALID_POSITIONS.has(normalized)) {
      return normalized;
    }
  }

  const numericId = Number(position);

  const match = Object.entries(
    ESPN_POSITION_IDS
  ).find(([, id]) => id === numericId);

  return match ? match[0] : null;
}

async function seedFantasyPlayers() {
  console.log(
    'Starting NFL Fantasy Player Seeding...'
  );

  let totalAdded = 0;

  try {
    /*
     * ---------------------------------------------------------
     * 1. Get ESPN fantasy projections/current player data.
     * ---------------------------------------------------------
     */

    let currentFantasyPlayers = [];

    try {
      currentFantasyPlayers =
        await fetchFantasyPool(
          CURRENT_SEASON
        );

      console.log(
        `Loaded ${currentFantasyPlayers.length} current ESPN fantasy players.`
      );
    } catch (error) {
      console.error(
        'Could not load ESPN fantasy projection pool:',
        error.message
      );
    }

    /*
     * ---------------------------------------------------------
     * 2. Get previous-season actual fantasy points.
     * ---------------------------------------------------------
     */

    let previousFantasyPlayers = [];

    try {
      previousFantasyPlayers =
        await fetchFantasyPool(
          PREVIOUS_SEASON
        );

      console.log(
        `Loaded ${previousFantasyPlayers.length} previous-season ESPN fantasy players.`
      );
    } catch (error) {
      console.error(
        'Could not load previous-season fantasy data:',
        error.message
      );
    }

    const projectionMap = new Map();

    for (const entry of currentFantasyPlayers) {
      if (!entry?.id) continue;

      const projection =
        getFantasyPoints(
          entry,
          CURRENT_SEASON
        );

      if (projection !== null) {
        projectionMap.set(
          String(entry.id),
          projection
        );
      }
    }

    const previousSeasonMap = new Map();

    for (const entry of previousFantasyPlayers) {
      if (!entry?.id) continue;

      const points =
        getFantasyPoints(
          entry,
          PREVIOUS_SEASON
        );

      if (points !== null) {
        previousSeasonMap.set(
          String(entry.id),
          points
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * 3. Get NFL teams.
     * ---------------------------------------------------------
     */

    const teamsRes = await axios.get(
      'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
      {
        timeout: 15000
      }
    );

    const teams =
      teamsRes.data?.sports?.[0]?.leagues?.[0]?.teams ||
      [];

    if (!teams.length) {
      throw new Error(
        'ESPN returned no NFL teams.'
      );
    }

    console.log(
      `Found ${teams.length} NFL teams.`
    );

    /*
     * ---------------------------------------------------------
     * 4. Seed actual NFL players.
     * ---------------------------------------------------------
     */

    for (const teamWrapper of teams) {
      const team = teamWrapper?.team;

      if (!team?.id || !team?.abbreviation) {
        continue;
      }

      const teamId = team.id;
      const teamAbbrev =
        String(team.abbreviation).toUpperCase();

      try {
        const rosterRes = await axios.get(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`,
          {
            timeout: 15000
          }
        );

        const rawAthletes =
          rosterRes.data?.athletes || [];

        const athletes =
          rawAthletes.flatMap(group => {
            if (Array.isArray(group?.items)) {
              return group.items;
            }

            if (
              group?.id ||
              group?.fullName
            ) {
              return [group];
            }

            return [];
          });

        for (const item of athletes) {
          const position =
            typeof item.position === 'string'
              ? item.position.toUpperCase()
              : item.position?.abbreviation?.toUpperCase();

          if (!VALID_POSITIONS.has(position)) {
            continue;
          }

          if (!item.id || !item.fullName) {
            continue;
          }

          const espnId =
            String(item.id);

          const jerseyNumber =
            item.jersey !== undefined &&
            item.jersey !== null &&
            String(item.jersey).trim() !== ''
              ? String(item.jersey)
              : null;

          const imageUrl =
            item.headshot?.href ||
            item.headshot?.url ||
            null;

          const byeWeek =
            item.byeWeek !== undefined &&
            item.byeWeek !== null
              ? Number(item.byeWeek)
              : null;

          const projectedPoints =
            projectionMap.get(
              espnId
            ) ?? null;

          const lastYearPoints =
            previousSeasonMap.get(
              espnId
            ) ?? null;

          await prisma.fantasyPlayer.upsert({
            where: {
              espnId
            },

            update: {
              name: item.fullName,
              position,
              team: teamAbbrev,
              jerseyNumber,
              imageUrl,
              byeWeek:
                Number.isFinite(byeWeek)
                  ? byeWeek
                  : null,
              projectedPoints,
              lastYearPoints
            },

            create: {
              espnId,
              name: item.fullName,
              position,
              team: teamAbbrev,
              jerseyNumber,
              imageUrl,
              byeWeek:
                Number.isFinite(byeWeek)
                  ? byeWeek
                  : null,
              projectedPoints,
              lastYearPoints
            }
          });

          totalAdded++;
        }
      } catch (teamError) {
        console.error(
          `Error fetching roster for ${teamAbbrev}:`,
          teamError.message
        );
      }

      await new Promise(resolve =>
        setTimeout(resolve, 200)
      );
    }

    /*
     * ---------------------------------------------------------
     * 5. Explicitly seed D/ST.
     *
     * ESPN NFL rosters do not provide fantasy D/ST
     * as an athlete, so we create one fantasy entry
     * for every NFL team.
     * ---------------------------------------------------------
     */

    for (const teamWrapper of teams) {
      const team = teamWrapper?.team;

      if (!team?.id || !team?.abbreviation) {
        continue;
      }

      const teamAbbrev =
        String(team.abbreviation).toUpperCase();

      const teamName =
        team.displayName ||
        team.name ||
        teamAbbrev;

      const logoUrl =
        team.logos?.[0]?.href ||
        null;

      const espnId =
        `dst-${team.id}`;

      /*
       * D/ST fantasy data from ESPN can be represented in
       * the fantasy player pool. Try to use it when available.
       */
      const dstEntry =
        currentFantasyPlayers.find(
          entry =>
            String(entry.id) ===
              String(team.id) &&
            getPlayerPosition(entry?.player) ===
              'DST'
        );

      const previousDstEntry =
        previousFantasyPlayers.find(
          entry =>
            String(entry.id) ===
              String(team.id) &&
            getPlayerPosition(entry?.player) ===
              'DST'
        );

      const projectedPoints =
        dstEntry
          ? getFantasyPoints(
              dstEntry,
              CURRENT_SEASON
            )
          : null;

      const lastYearPoints =
        previousDstEntry
          ? getFantasyPoints(
              previousDstEntry,
              PREVIOUS_SEASON
            )
          : null;

      await prisma.fantasyPlayer.upsert({
        where: {
          espnId
        },

        update: {
          name: `${teamName} D/ST`,
          position: 'DST',
          team: teamAbbrev,
          jerseyNumber: null,
          imageUrl: logoUrl,
          projectedPoints,
          lastYearPoints
        },

        create: {
          espnId,
          name: `${teamName} D/ST`,
          position: 'DST',
          team: teamAbbrev,
          jerseyNumber: null,
          imageUrl: logoUrl,
          projectedPoints,
          lastYearPoints
        }
      });

      totalAdded++;
    }

    console.log(
      `Successfully seeded/updated ${totalAdded} fantasy players.`
    );

    if (totalAdded === 0) {
      throw new Error(
        'ESPN returned no usable fantasy players.'
      );
    }

    return totalAdded;

  } catch (error) {
    console.error(
      'Error seeding fantasy players:',
      error.message
    );

    throw error;
  }
}

module.exports = {
  seedFantasyPlayers
};
