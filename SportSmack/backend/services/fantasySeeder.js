const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const CURRENT_SEASON = 2026;
const PREVIOUS_SEASON = 2025;

const VALID_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST'
]);

const POSITION_IDS = {
  QB: 1,
  RB: 2,
  WR: 3,
  TE: 4,
  K: 5,
  DST: 16
};

async function getFantasyPlayers(season) {
  const url =
    `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${season}` +
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

  const response = await axios.get(url, {
    params: {
      view: 'kona_player_info',
      scoringPeriodId: 0
    },
    headers: {
      'X-Fantasy-Filter':
        JSON.stringify(fantasyFilter)
    },
    timeout: 30000
  });

  return response.data?.players || [];
}

function getSeasonFantasyPoints(
  player,
  season,
  preferProjection = false
) {
  const stats =
    player?.stats || [];

  const seasonStats =
    stats.filter(
      stat =>
        Number(stat.seasonId) ===
        Number(season)
    );

  if (!seasonStats.length) {
    return null;
  }

  let candidate;

  if (preferProjection) {
    candidate =
      seasonStats.find(
        stat =>
          Number(stat.statTypeId) === 1
      ) ||
      seasonStats.find(
        stat =>
          Number(stat.statTypeId) === 0
      );
  } else {
    candidate =
      seasonStats.find(
        stat =>
          Number(stat.statTypeId) === 0
      ) ||
      seasonStats.find(
        stat =>
          Number(stat.statTypeId) === 1
      );
  }

  if (!candidate) {
    return null;
  }

  const value =
    candidate.appliedTotal ??
    candidate.appliedStatTotal ??
    candidate.fantasyPoints;

  const numericValue =
    Number(value);

  return Number.isFinite(
    numericValue
  )
    ? numericValue
    : null;
}

function normalizePosition(
  player
) {
  if (
    player?.defaultPositionId
  ) {
    const numericId =
      Number(
        player.defaultPositionId
      );

    const match =
      Object.entries(
        POSITION_IDS
      ).find(
        ([, id]) =>
          id === numericId
      );

    if (match) {
      return match[0];
    }
  }

  const abbreviation =
    player?.position
      ?.abbreviation;

  if (
    abbreviation &&
    VALID_POSITIONS.has(
      abbreviation.toUpperCase()
    )
  ) {
    return abbreviation.toUpperCase();
  }

  return null;
}

async function seedFantasyPlayers() {
  console.log(
    'Starting NFL Fantasy Player Seeding...'
  );

  try {
    /*
     * ---------------------------------------------------------
     * Load ESPN fantasy data for 2026 projections.
     * ---------------------------------------------------------
     */

    let currentFantasyPlayers = [];

    try {
      currentFantasyPlayers =
        await getFantasyPlayers(
          CURRENT_SEASON
        );

      console.log(
        `Loaded ${currentFantasyPlayers.length} 2026 ESPN fantasy players.`
      );
    } catch (error) {
      console.error(
        '2026 ESPN fantasy data error:',
        error.message
      );
    }

    /*
     * ---------------------------------------------------------
     * Load ESPN fantasy data for 2025 actual results.
     * ---------------------------------------------------------
     */

    let previousFantasyPlayers = [];

    try {
      previousFantasyPlayers =
        await getFantasyPlayers(
          PREVIOUS_SEASON
        );

      console.log(
        `Loaded ${previousFantasyPlayers.length} 2025 ESPN fantasy players.`
      );
    } catch (error) {
      console.error(
        '2025 ESPN fantasy data error:',
        error.message
      );
    }

    /*
     * Maps keyed by ESPN player ID.
     */

    const projectionMap =
      new Map();

    const lastYearMap =
      new Map();

    for (
      const entry of currentFantasyPlayers
    ) {
      const player =
        entry?.player;

      if (!player?.id) {
        continue;
      }

      const points =
        getSeasonFantasyPoints(
          player,
          CURRENT_SEASON,
          true
        );

      if (points !== null) {
        projectionMap.set(
          String(player.id),
          points
        );
      }
    }

    for (
      const entry of previousFantasyPlayers
    ) {
      const player =
        entry?.player;

      if (!player?.id) {
        continue;
      }

      const points =
        getSeasonFantasyPoints(
          player,
          PREVIOUS_SEASON,
          false
        );

      if (points !== null) {
        lastYearMap.set(
          String(player.id),
          points
        );
      }
    }

    /*
     * ---------------------------------------------------------
     * Get all NFL teams.
     * ---------------------------------------------------------
     */

    const teamsRes =
      await axios.get(
        'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams',
        {
          timeout: 15000
        }
      );

    const teams =
      teamsRes.data?.sports?.[0]
        ?.leagues?.[0]
        ?.teams || [];

    if (!teams.length) {
      throw new Error(
        'ESPN returned no NFL teams.'
      );
    }

    let totalAdded = 0;

    /*
     * ---------------------------------------------------------
     * Seed real NFL players.
     * ---------------------------------------------------------
     */

    for (
      const teamWrapper of teams
    ) {
      const team =
        teamWrapper?.team;

      if (
        !team?.id ||
        !team?.abbreviation
      ) {
        continue;
      }

      const teamId =
        team.id;

      const teamAbbrev =
        String(
          team.abbreviation
        ).toUpperCase();

      try {
        const rosterRes =
          await axios.get(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${teamId}/roster`,
            {
              timeout: 15000
            }
          );

        const rawAthletes =
          rosterRes.data
            ?.athletes || [];

        const athletes =
          rawAthletes.flatMap(
            group => {
              if (
                Array.isArray(
                  group?.items
                )
              ) {
                return group.items;
              }

              if (
                group?.id ||
                group?.fullName
              ) {
                return [group];
              }

              return [];
            }
          );

        for (
          const item of athletes
        ) {
          const position =
            typeof item.position ===
            'string'
              ? item.position.toUpperCase()
              : item.position
                  ?.abbreviation
                  ?.toUpperCase();

          if (
            !VALID_POSITIONS.has(
              position
            )
          ) {
            continue;
          }

          if (
            !item.id ||
            !item.fullName
          ) {
            continue;
          }

          const espnId =
            String(item.id);

          const projection =
            projectionMap.get(
              espnId
            ) ?? null;

          const lastYear =
            lastYearMap.get(
              espnId
            ) ?? null;

          const jerseyNumber =
            item.jersey !==
              undefined &&
            item.jersey !== null
              ? String(item.jersey)
              : null;

          const imageUrl =
            item.headshot?.href ||
            item.headshot?.url ||
            null;

          const byeWeek =
            Number.isFinite(
              Number(item.byeWeek)
            )
              ? Number(
                  item.byeWeek
                )
              : null;

          await prisma.fantasyPlayer.upsert(
            {
              where: {
                espnId
              },

              update: {
                name:
                  item.fullName,
                position,
                team:
                  teamAbbrev,
                jerseyNumber,
                imageUrl,
                byeWeek,
                projectedPoints:
                  projection,
                lastYearPoints:
                  lastYear
              },

              create: {
                espnId,
                name:
                  item.fullName,
                position,
                team:
                  teamAbbrev,
                jerseyNumber,
                imageUrl,
                byeWeek,
                projectedPoints:
                  projection,
                lastYearPoints:
                  lastYear
              }
            }
          );

          totalAdded++;
        }
      } catch (error) {
        console.error(
          `Error loading ${teamAbbrev}:`,
          error.message
        );
      }

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            250
          )
      );
    }

    /*
     * ---------------------------------------------------------
     * IMPORTANT:
     * ESPN's normal NFL roster endpoint does NOT give us a
     * fantasy D/ST athlete. Therefore create one D/ST entry
     * for every NFL team manually.
     * ---------------------------------------------------------
     */

    for (
      const teamWrapper of teams
    ) {
      const team =
        teamWrapper?.team;

      if (
        !team?.id ||
        !team?.abbreviation
      ) {
        continue;
      }

      const teamAbbrev =
        String(
          team.abbreviation
        ).toUpperCase();

      const displayName =
        team.displayName ||
        team.name ||
        teamAbbrev;

      const imageUrl =
        team.logos?.[0]?.href ||
        null;

      /*
       * Use a stable custom ID so this does not
       * conflict with an actual athlete ID.
       */
      const espnId =
        `DST-${team.id}`;

      /*
       * Try to locate the team's ESPN fantasy
       * D/ST record if ESPN supplies one.
       */
      const currentDST =
        currentFantasyPlayers.find(
          entry => {
            const player =
              entry?.player;

            return (
              player &&
              normalizePosition(
                player
              ) === 'DST' &&
              (
                String(
                  entry.id
                ) ===
                  String(team.id) ||
                Number(
                  player.proTeamId
                ) ===
                  Number(team.id)
              )
            );
          }
        );

      const previousDST =
        previousFantasyPlayers.find(
          entry => {
            const player =
              entry?.player;

            return (
              player &&
              normalizePosition(
                player
              ) === 'DST' &&
              (
                String(
                  entry.id
                ) ===
                  String(team.id) ||
                Number(
                  player.proTeamId
                ) ===
                  Number(team.id)
              )
            );
          }
        );

      const projectedPoints =
        currentDST
          ? getSeasonFantasyPoints(
              currentDST.player,
              CURRENT_SEASON,
              true
            )
          : null;

      const lastYearPoints =
        previousDST
          ? getSeasonFantasyPoints(
              previousDST.player,
              PREVIOUS_SEASON,
              false
            )
          : null;

      await prisma.fantasyPlayer.upsert(
        {
          where: {
            espnId
          },

          update: {
            name:
              `${displayName} D/ST`,
            position: 'DST',
            team:
              teamAbbrev,
            jerseyNumber: null,
            imageUrl,
            projectedPoints,
            lastYearPoints
          },

          create: {
            espnId,
            name:
              `${displayName} D/ST`,
            position: 'DST',
            team:
              teamAbbrev,
            jerseyNumber: null,
            imageUrl,
            projectedPoints,
            lastYearPoints
          }
        }
      );

      totalAdded++;
    }

    console.log(
      `Successfully seeded/updated ${totalAdded} fantasy players.`
    );

    if (
      totalAdded === 0
    ) {
      throw new Error(
        'No fantasy players were seeded.'
      );
    }

    return totalAdded;

  } catch (error) {
    console.error(
      'Fantasy seeding failed:',
      error
    );

    throw error;
  }
}

module.exports = {
  seedFantasyPlayers
};
