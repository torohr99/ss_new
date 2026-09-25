const axios = require('axios');
const prisma = require('../lib/prisma');

const {
  getCurrentFantasySeason,
  getPreviousFantasySeason,
  validateFantasySeason
} = require('./fantasySeason');

const VALID_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST'
]);

const POSITION_IDS = {
  QB: 0,
  RB: 2,
  WR: 4,
  TE: 6,
  K: 17,
  DST: 16
};

async function getFantasyPlayers(season) {
  const primaryUrl =
    `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leaguedefaults/3`;

  const primaryFilter = {
    players: {
      limit: 2000,
      sortPercOwned: {
        sortPriority: 4,
        sortAsc: false
      }
    }
  };

  const requestConfig = {
    params: {
      view: 'kona_player_info',
      scoringPeriodId: 0
    },
    headers: {
      'X-Fantasy-Filter':
        JSON.stringify(primaryFilter),

      /*
       * ESPN's kona endpoint is more reliable when
       * explicitly identifying the source and client.
       */
      'X-Fantasy-Source': 'kona',
      'User-Agent': 'SportSmack/1.0',
      'Accept': 'application/json'
    },
    timeout: 30000
  };

  try {
    /*
     * ---------------------------------------------------------
     * PRIMARY:
     * ESPN league-default fantasy player endpoint.
     * ---------------------------------------------------------
     */
    const response =
      await axios.get(
        primaryUrl,
        requestConfig
      );

    let players =
      Array.isArray(
        response.data?.players
      )
        ? response.data.players
        : Array.isArray(
            response.data
          )
          ? response.data
          : [];

    console.log(
      `ESPN fantasy primary endpoint returned ${players.length} players for ${season}.`
    );

    if (players.length > 0) {
      const first =
        players[0]?.player;

      console.log(
        `ESPN fantasy sample ${season}:`,
        JSON.stringify({
          id:
            first?.id,
          name:
            first?.fullName,
          position:
            first?.defaultPositionId,
          stats:
            Array.isArray(
              first?.stats
            )
              ? first.stats.length
              : 0
        })
      );

      return players;
    }

    /*
     * ---------------------------------------------------------
     * FALLBACK:
     * ESPN's public season player endpoint.
     *
     * This is intentionally used if the league-default
     * endpoint returns an empty player pool.
     * ---------------------------------------------------------
     */
    console.log(
      `Primary ESPN fantasy endpoint returned 0 players for ${season}; trying fallback endpoint.`
    );

    const fallbackUrl =
      `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/players`;

    const fallbackFilter = {
      filterActive: {
        value: true
      },
      players: {
        limit: 2000,
        sortPercOwned: {
          sortPriority: 4,
          sortAsc: false
        }
      }
    };

    const fallbackResponse =
      await axios.get(
        fallbackUrl,
        {
          params: {
            view: 'kona_player_info',
            scoringPeriodId: 0
          },
          headers: {
            'X-Fantasy-Filter':
              JSON.stringify(
                fallbackFilter
              ),
            'X-Fantasy-Source':
              'kona',
            'User-Agent':
              'SportSmack/1.0',
            'Accept':
              'application/json'
          },
          timeout: 30000
        }
      );

    players =
      Array.isArray(
        fallbackResponse.data?.players
      )
        ? fallbackResponse.data.players
        : Array.isArray(
            fallbackResponse.data
          )
          ? fallbackResponse.data
          : [];

    console.log(
      `ESPN fantasy fallback endpoint returned ${players.length} players for ${season}.`
    );

    if (players.length > 0) {
      const first =
        players[0]?.player;

      console.log(
        `ESPN fantasy fallback sample ${season}:`,
        JSON.stringify({
          id:
            first?.id,
          name:
            first?.fullName,
          position:
            first?.defaultPositionId,
          stats:
            Array.isArray(
              first?.stats
            )
              ? first.stats.length
              : 0
        })
      );
    }

    return players;

  } catch (error) {
    console.error(
      `ESPN fantasy player endpoint failed for ${season}:`,
      error.response?.status ||
        error.message
    );

    if (error.response?.data) {
      console.error(
        'ESPN response:',
        JSON.stringify(
          error.response.data
        ).slice(0, 2000)
      );
    }

    return [];
  }
}

function getSeasonFantasyPoints(
  player,
  season,
  preferProjection = false
) {
  const stats = [
    ...(Array.isArray(player?.stats)
      ? player.stats
      : []),

    ...(Array.isArray(
      player?.playerPoolEntry?.stats
    )
      ? player.playerPoolEntry.stats
      : [])
  ];

  const seasonStats =
    stats.filter(stat => {
      return (
        Number(stat.seasonId) ===
          Number(season) &&
        (
          stat.statSplitTypeId == null ||
          Number(stat.statSplitTypeId) === 0
        )
      );
    });

  if (!seasonStats.length) {
    return null;
  }

  /*
   * ESPN:
   * statSourceId 0 = actual
   * statSourceId 1 = projected
   */
  const desiredSource =
    preferProjection ? 1 : 0;

  let candidate =
    seasonStats.find(
      stat =>
        Number(stat.statSourceId) ===
        desiredSource
    );

  /*
   * Some ESPN responses expose the
   * source through statTypeId instead.
   */
  if (!candidate) {
    candidate =
      seasonStats.find(
        stat =>
          Number(stat.statTypeId) ===
          desiredSource
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
  const currentSeason =
    getCurrentFantasySeason();

  const previousSeason =
    getPreviousFantasySeason(
      currentSeason
    );

  console.log(
    `Synchronizing fantasy player pool for ${currentSeason}.`
  );
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
          currentSeason
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
          previousSeason
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
          currentSeason,
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
          previousSeason,
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
          const rawPosition =
            typeof item.position === 'string'
              ? item.position.toUpperCase()
              : item.position
                  ?.abbreviation
                  ?.toUpperCase();
        
          const positionMap = {
            QUARTERBACK: 'QB',
            QB: 'QB',
        
            RUNNINGBACK: 'RB',
            'RUNNING BACK': 'RB',
            RB: 'RB',
        
            WIDE_RECEIVER: 'WR',
            'WIDE RECEIVER': 'WR',
            WR: 'WR',
        
            TIGHT_END: 'TE',
            'TIGHT END': 'TE',
            TE: 'TE',
        
            KICKER: 'K',
            K: 'K',
            PK: 'K',
        
            DEFENSIVE_TACKLE: null,
            DEFENSIVE_END: null,
            LINEBACKER: null,
            CORNERBACK: null,
            SAFETY: null
          };
        
          const position =
            positionMap[rawPosition] || null;
        
          if (
            !position ||
            !VALID_POSITIONS.has(position)
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
                season_espnId: {
                  season: currentSeason,
                  espnId
                }
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
                season:
                  currentSeason,
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
              currentSeason,
              true
            )
          : null;

      const lastYearPoints =
        previousDST
          ? getSeasonFantasyPoints(
              previousDST.player,
              previousSeason,
              false
            )
          : null;

      await prisma.fantasyPlayer.upsert(
        {
          where: {
            season_espnId: {
              season:
                currentSeason,
              espnId
            }
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
            season:
              currentSeason,
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
