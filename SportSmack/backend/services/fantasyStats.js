const axios = require('axios');
const prisma = require('../lib/prisma');

const {
  getCurrentFantasySeason
} = require('./fantasySeason');

const SCORING = {
  PASSING_YARD: 0.04,
  PASSING_TD: 4,
  INTERCEPTION: -2,

  RUSHING_YARD: 0.1,
  RUSHING_TD: 6,

  RECEPTION: 1,
  RECEIVING_YARD: 0.1,
  RECEIVING_TD: 6,

  FUMBLE: -2,

  TWO_POINT_CONVERSION: 2,

  KICK_EXTRA_POINT: 1,
  KICK_FIELD_GOAL: 3,

  DEFENSIVE_SACK: 1,
  DEFENSIVE_INTERCEPTION: 2,
  DEFENSIVE_FUMBLE_RECOVERY: 2,
  DEFENSIVE_TD: 6,
  DEFENSIVE_SAFETY: 2,
  DEFENSIVE_BLOCKED_KICK: 2,
  SPECIAL_TEAMS_TD: 6
};

const DST_POINTS_ALLOWED = {
  SHUTOUT: 10,
  ONE_TO_SIX: 7,
  SEVEN_TO_THIRTEEN: 4,
  FOURTEEN_TO_TWENTY: 1,
  TWENTY_ONE_TO_TWENTY_SEVEN: 0,
  TWENTY_EIGHT_TO_THIRTY_FOUR: -1,
  THIRTY_FIVE_PLUS: -4
};

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function calculatePointsAllowedPoints(
  pointsAllowed
) {
  const points =
    number(pointsAllowed);

  if (points <= 0) {
    return DST_POINTS_ALLOWED.SHUTOUT;
  }

  if (points <= 6) {
    return DST_POINTS_ALLOWED.ONE_TO_SIX;
  }

  if (points <= 13) {
    return DST_POINTS_ALLOWED.SEVEN_TO_THIRTEEN;
  }

  if (points <= 20) {
    return DST_POINTS_ALLOWED.FOURTEEN_TO_TWENTY;
  }

  if (points <= 27) {
    return DST_POINTS_ALLOWED.TWENTY_ONE_TO_TWENTY_SEVEN;
  }

  if (points <= 34) {
    return DST_POINTS_ALLOWED.TWENTY_EIGHT_TO_THIRTY_FOUR;
  }

  return DST_POINTS_ALLOWED.THIRTY_FIVE_PLUS;
}

function calculateDSTPoints(
  stats,
  pointsAllowed
) {
  return (
    calculatePointsAllowedPoints(
      pointsAllowed
    ) +

    number(stats.sacks) *
      SCORING.DEFENSIVE_SACK +

    number(
      stats.defensiveInterceptions
    ) *
      SCORING.DEFENSIVE_INTERCEPTION +

    number(
      stats.fumbleRecoveries
    ) *
      SCORING.DEFENSIVE_FUMBLE_RECOVERY +

    number(stats.defensiveTD) *
      SCORING.DEFENSIVE_TD +

    number(stats.safeties) *
      SCORING.DEFENSIVE_SAFETY +

    number(stats.blockedKicks) *
      SCORING.DEFENSIVE_BLOCKED_KICK +

    number(stats.specialTeamsTD) *
      SCORING.SPECIAL_TEAMS_TD
  );
}

function calculatePlayerPoints(stats) {
  return (
    number(stats.passingYards) *
      SCORING.PASSING_YARD +

    number(stats.passingTD) *
      SCORING.PASSING_TD +

    number(stats.interceptions) *
      SCORING.INTERCEPTION +

    number(stats.rushingYards) *
      SCORING.RUSHING_YARD +

    number(stats.rushingTD) *
      SCORING.RUSHING_TD +

    number(stats.receptions) *
      SCORING.RECEPTION +

    number(stats.receivingYards) *
      SCORING.RECEIVING_YARD +

    number(stats.receivingTD) *
      SCORING.RECEIVING_TD +

    number(stats.fumbles) *
      SCORING.FUMBLE +

    number(stats.twoPointConversions) *
      SCORING.TWO_POINT_CONVERSION +

    number(stats.extraPoints) *
      SCORING.KICK_EXTRA_POINT +

    number(stats.fieldGoals) *
      SCORING.KICK_FIELD_GOAL +

    number(stats.sacks) *
      SCORING.DEFENSIVE_SACK +

    number(stats.defensiveInterceptions) *
      SCORING.DEFENSIVE_INTERCEPTION +

    number(stats.fumbleRecoveries) *
      SCORING.DEFENSIVE_FUMBLE_RECOVERY +

    number(stats.defensiveTD) *
      SCORING.DEFENSIVE_TD +

    number(stats.safeties) *
      SCORING.DEFENSIVE_SAFETY +

    number(stats.blockedKicks) *
      SCORING.DEFENSIVE_BLOCKED_KICK +

    number(stats.specialTeamsTD) *
      SCORING.SPECIAL_TEAMS_TD
  );
}

async function getWeeklyStats(
  season,
  weekNumber
) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=${season}&seasontype=2&week=${weekNumber}`;

  const response = await axios.get(url, {
    timeout: 15000
  });

  const events =
    response.data?.events || [];

  const stats = new Map();

  for (const event of events) {
    const eventId = event.id;

    const eventState =
      event?.status?.type?.state;

    /*
     * Do not attempt to score games that
     * have not started.
     */
    if (eventState === 'pre') {
      continue;
    }

    try {
      const summaryResponse =
        await axios.get(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`,
          {
            timeout: 15000
          }
        );

      const summary =
        summaryResponse.data;

      const players =
        summary?.boxscore?.players || [];

      /*
       * D/ST statistics are team-level fantasy
       * statistics, so accumulate them separately
       * from individual player statistics.
       */
      const defensiveStatsByTeamId =
        new Map();

      for (const teamData of players) {
        const teamId =
          String(
            teamData?.team?.id ??
            teamData?.id ??
            ''
          );

        const statistics =
          teamData.statistics || [];

        for (const group of statistics) {
          const labels =
            group.labels || [];

          const athletes =
            group.athletes || [];

          const normalizedGroupName =
            String(
              group.name || ''
            )
              .toLowerCase()
              .replace(
                /[^a-z]/g,
                ''
              );

          for (const athlete of athletes) {
            const id =
              athlete?.athlete?.id;

            if (!id) {
              continue;
            }

            const values =
              athlete.stats || [];

            const getStat = (
              ...names
            ) => {
              for (const name of names) {
                const index =
                  labels.indexOf(
                    name
                  );

                if (index !== -1) {
                  return number(
                    values[index]
                  );
                }
              }

              return 0;
            };

            const current =
              stats.get(
                String(id)
              ) || {
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
                extraPoints: 0,
                fieldGoals: 0,
                sacks: 0,
                defensiveInterceptions: 0,
                fumbleRecoveries: 0,
                defensiveTD: 0,
                safeties: 0,
                blockedKicks: 0,
                specialTeamsTD: 0
              };

            if (
              normalizedGroupName ===
              'passing'
            ) {
              current.passingYards =
                getStat(
                  'YDS',
                  'Yards'
                );

              current.passingTD =
                getStat('TD');

              current.interceptions =
                getStat('INT');
            }

            if (
              normalizedGroupName ===
              'rushing'
            ) {
              current.rushingYards =
                getStat(
                  'YDS',
                  'Yards'
                );

              current.rushingTD =
                getStat('TD');
            }

            if (
              normalizedGroupName ===
              'receiving'
            ) {
              current.receptions =
                getStat('REC');

              current.receivingYards =
                getStat(
                  'YDS',
                  'Yards'
                );

              current.receivingTD =
                getStat('TD');
            }

            if (
              normalizedGroupName ===
              'fumbles'
            ) {
              current.fumbles =
                getStat('FUM');

              current.fumbleRecoveries =
                getStat('FR');
            }

            /*
             * IMPORTANT:
             * XPM = extra points MADE.
             * The previous implementation used
             * XPA, which is attempts.
             */
            if (
              normalizedGroupName ===
              'kicking'
            ) {
              current.extraPoints =
                getStat(
                  'XPM'
                );

              current.fieldGoals =
                getStat(
                  'FGM'
                );
            }

            if (
              normalizedGroupName ===
              'defensive'
            ) {
              current.sacks =
                getStat(
                  'SACK'
                );

              current.defensiveInterceptions =
                getStat(
                  'INT'
                );

              current.fumbleRecoveries =
                getStat(
                  'FR'
                );

              current.defensiveTD =
                getStat(
                  'TD'
                );

              current.safeties =
                getStat(
                  'SFTY',
                  'SAF'
                );

              current.blockedKicks =
                getStat(
                  'BK',
                  'BLK',
                  'KB'
                );

              if (teamId) {
                const dstStats =
                  defensiveStatsByTeamId.get(
                    teamId
                  ) || {
                    sacks: 0,
                    defensiveInterceptions: 0,
                    fumbleRecoveries: 0,
                    defensiveTD: 0,
                    safeties: 0,
                    blockedKicks: 0,
                    specialTeamsTD: 0
                  };

                dstStats.sacks +=
                  getStat('SACK');

                dstStats.defensiveInterceptions +=
                  getStat('INT');

                dstStats.fumbleRecoveries +=
                  getStat('FR');

                dstStats.defensiveTD +=
                  getStat('TD');

                dstStats.safeties +=
                  getStat(
                    'SFTY',
                    'SAF'
                  );

                dstStats.blockedKicks +=
                  getStat(
                    'BK',
                    'BLK',
                    'KB'
                  );

                defensiveStatsByTeamId.set(
                  teamId,
                  dstStats
                );
              }
            }

            /*
             * ESPN uses kickReturns and puntReturns
             * for special-teams return statistics.
             */
            if (
              normalizedGroupName ===
                'kickreturns' ||
              normalizedGroupName ===
                'puntreturns'
            ) {
              const returnTD =
                getStat('TD');

              current.specialTeamsTD +=
                returnTD;

              if (teamId) {
                const dstStats =
                  defensiveStatsByTeamId.get(
                    teamId
                  ) || {
                    sacks: 0,
                    defensiveInterceptions: 0,
                    fumbleRecoveries: 0,
                    defensiveTD: 0,
                    safeties: 0,
                    blockedKicks: 0,
                    specialTeamsTD: 0
                  };

                dstStats.specialTeamsTD +=
                  returnTD;

                defensiveStatsByTeamId.set(
                  teamId,
                  dstStats
                );
              }
            }

            stats.set(
              String(id),
              current
            );
          }
        }
      }

      /*
       * ---------------------------------------------------------
       * D/ST TEAM SCORING
       * ---------------------------------------------------------
       *
       * ESPN's summary identifies each boxscore
       * team by its ESPN team ID. SportSmack's
       * synthetic D/ST players use:
       *
       *     DST-{teamId}
       *
       * so the calculated team score maps directly
       * onto the FantasyPlayer records already in
       * the database.
       */
      const competitors =
        summary?.header
          ?.competitions?.[0]
          ?.competitors || [];

      if (
        competitors.length >= 2
      ) {
        for (
          const competitor of
          competitors
        ) {
          const teamId =
            String(
              competitor?.team?.id ||
              ''
            );

          if (!teamId) {
            continue;
          }

          const opponent =
            competitors.find(
              other =>
                String(
                  other?.team?.id ||
                  ''
                ) !== teamId
            );

          if (!opponent) {
            continue;
          }

          const pointsAllowed =
            number(
              opponent.score
            );

          const dstStats =
            defensiveStatsByTeamId.get(
              teamId
            ) || {
              sacks: 0,
              defensiveInterceptions: 0,
              fumbleRecoveries: 0,
              defensiveTD: 0,
              safeties: 0,
              blockedKicks: 0,
              specialTeamsTD: 0
            };

          const dstPoints =
            calculateDSTPoints(
              dstStats,
              pointsAllowed
            );

          const dstKey =
            `DST-${teamId}`;

          const existingDSTPoints =
            number(
              stats.get(
                dstKey
              )?.dstPoints
            );

          stats.set(
            dstKey,
            {
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
              extraPoints: 0,
              fieldGoals: 0,
              sacks:
                dstStats.sacks,
              defensiveInterceptions:
                dstStats.defensiveInterceptions,
              fumbleRecoveries:
                dstStats.fumbleRecoveries,
              defensiveTD:
                dstStats.defensiveTD,
              safeties:
                dstStats.safeties,
              blockedKicks:
                dstStats.blockedKicks,
              specialTeamsTD:
                dstStats.specialTeamsTD,
              dstPoints:
                existingDSTPoints +
                dstPoints,
              pointsAllowed
            }
          );
        }
      }
    } catch (error) {
      console.error(
        `Fantasy stats error for event ${eventId}:`,
        error.message
      );
    }
  }

  /*
   * Convert the accumulated D/ST values into
   * the same point calculation used by the rest
   * of the fantasy scoring system.
   */
  for (
    const [key, value] of stats
  ) {
    if (
      !key.startsWith('DST-') ||
      value.dstPoints === undefined
    ) {
      continue;
    }

    value.dstPoints =
      number(
        value.dstPoints
      );

    stats.set(
      key,
      value
    );
  }

  return stats;
}

async function scoreLeagueWeek(
  leagueId,
  weekNumber,
  isLive = true
) {
    const league =
      await prisma.fantasyLeague.findUnique({
        where: {
          id: leagueId
        },
        select: {
          season: true
        }
      });
  
    if (!league) {
      throw new Error(
        `Fantasy league ${leagueId} not found.`
      );
    }
  const teams =
    await prisma.fantasyTeam.findMany({
      where: {
        leagueId
      },
      include: {
        players: {
          include: {
            player: true
          }
        }
      }
    });

  const stats =
    await getWeeklyStats(
      league.season,
      weekNumber
    );

  const results = [];

  for (const team of teams) {
    let total = 0;

    for (const rosterPlayer of team.players) {
      const playerStats =
        stats.get(
          String(
            rosterPlayer.player.espnId
          )
        ) || {
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
          extraPoints: 0,
          fieldGoals: 0,
          sacks: 0,
          defensiveInterceptions: 0,
          fumbleRecoveries: 0,
          defensiveTD: 0,
          safeties: 0,
          blockedKicks: 0,
          specialTeamsTD: 0,
          dstPoints: 0
        };

      const playerPoints =
        calculatePlayerPoints(
          playerStats
        );

      /*
       * Store the player's weekly NFL fantasy
       * score regardless of whether the player
       * is currently a starter or bench player.
       *
       * FantasyPlayerWeeklyScore is global player/week
       * data and is therefore reusable across leagues.
       */
      await prisma.fantasyPlayerWeeklyScore.upsert({
        where: {
          playerId_weekNumber: {
            playerId:
              rosterPlayer.playerId,
            weekNumber
          }
        },
        update: {
          points: playerPoints,
          isLive,
          statsJson:
            JSON.stringify(playerStats)
        },
        create: {
          playerId:
            rosterPlayer.playerId,
          weekNumber,
          points: playerPoints,
          isLive,
          statsJson:
            JSON.stringify(playerStats)
        }
      });

      /*
       * Only starters contribute to the team's
       * weekly fantasy score.
       */
      if (
        rosterPlayer.status ===
        'STARTER'
      ) {
        total += playerPoints;
      }
    }

    /*
     * IMPORTANT:
     * Save the team's weekly score exactly once,
     * after every rostered player has been processed.
     */
    const score =
      await prisma.fantasyWeeklyScore.upsert({
        where: {
          teamId_weekNumber: {
            teamId: team.id,
            weekNumber
          }
        },
        update: {
          points: total,
          isLive
        },
        create: {
          teamId: team.id,
          weekNumber,
          points: total,
          isLive
        }
      });

    results.push({
      teamId: team.id,
      teamName: team.name,
      points: total,
      scoreId: score.id
    });
  }

  /*
   * Once all teams have their weekly scores,
   * update the corresponding fantasy matchups.
   */
  await updateMatchups(
    leagueId,
    weekNumber
  );

  return results;
}

async function updateMatchups(
  leagueId,
  weekNumber
) {
  const matchups =
    await prisma.fantasyMatchup.findMany({
      where: {
        leagueId,
        weekNumber
      }
    });

  if (matchups.length === 0) {
    return;
  }

  const teamIds = [
    ...new Set(
      matchups.flatMap(matchup => [
        matchup.homeTeamId,
        matchup.awayTeamId
      ])
    )
  ];

  const scores =
    await prisma.fantasyWeeklyScore.findMany({
      where: {
        weekNumber,
        teamId: {
          in: teamIds
        }
      },
      select: {
        teamId: true,
        points: true,
        isLive: true
      }
    });

  const scoreByTeamId =
    new Map(
      scores.map(score => [
        score.teamId,
        score
      ])
    );

  for (const matchup of matchups) {
    const home =
      scoreByTeamId.get(
        matchup.homeTeamId
      );

    const away =
      scoreByTeamId.get(
        matchup.awayTeamId
      );

    const hasBothScores =
      Boolean(home && away);

    const isLive =
      home?.isLive !== false ||
      away?.isLive !== false;

    await prisma.fantasyMatchup.update({
      where: {
        id: matchup.id
      },
      data: {
        homeScore:
          home?.points || 0,
        awayScore:
          away?.points || 0,
        status:
          hasBothScores && !isLive
            ? 'FINAL'
            : 'LIVE'
      }
    });
  }
}

async function isWeekComplete(
  season,
  weekNumber
) {
  try {
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=${season}&seasontype=2&week=${weekNumber}`;

    const response = await axios.get(url, {
      timeout: 15000
    });

    const events = response.data?.events || [];

    if (events.length === 0) {
      return false;
    }

    return events.every(event => {
      const state =
        event.competitions?.[0]?.status?.type?.state;

      return state === 'post';
    });
  } catch (error) {
    console.error(
      `Could not determine completion of week ${weekNumber}:`,
      error.message
    );

    return false;
  }
}

module.exports = {
  SCORING,
  DST_POINTS_ALLOWED,
  calculatePointsAllowedPoints,
  calculateDSTPoints,
  calculatePlayerPoints,
  getWeeklyStats,
  scoreLeagueWeek,
  updateMatchups,
  isWeekComplete
};
