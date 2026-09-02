const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

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
  DEFENSIVE_TD: 6
};

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
      SCORING.DEFENSIVE_TD
  );
}

async function getWeeklyStats(weekNumber) {
  const url =
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=2026&seasontype=2&week=${weekNumber}`;

  const response = await axios.get(url, {
    timeout: 15000
  });

  const events = response.data?.events || [];
  const stats = new Map();

  for (const event of events) {
    const eventId = event.id;

    try {
      const summaryResponse = await axios.get(
        `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${eventId}`,
        { timeout: 15000 }
      );

      const summary = summaryResponse.data;

      const players =
        summary?.boxscore?.players || [];

      for (const teamData of players) {
        const statistics =
          teamData.statistics || [];

        for (const group of statistics) {
          const labels = group.labels || [];
          const athletes = group.athletes || [];

          for (const athlete of athletes) {
            const id = athlete?.athlete?.id;

            if (!id) continue;

            const values = athlete.stats || [];

            const getStat = (...names) => {
              for (const name of names) {
                const index = labels.indexOf(name);

                if (index !== -1) {
                  return number(values[index]);
                }
              }

              return 0;
            };

            const current =
              stats.get(String(id)) || {
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
                defensiveTD: 0
              };

            if (group.name === 'passing') {
              current.passingYards =
                getStat('YDS', 'Yards');

              current.passingTD =
                getStat('TD');

              current.interceptions =
                getStat('INT');
            }

            if (group.name === 'rushing') {
              current.rushingYards =
                getStat('YDS', 'Yards');

              current.rushingTD =
                getStat('TD');
            }

            if (group.name === 'receiving') {
              current.receptions =
                getStat('REC');

              current.receivingYards =
                getStat('YDS', 'Yards');

              current.receivingTD =
                getStat('TD');
            }

            if (group.name === 'fumbles') {
              current.fumbles =
                getStat('FUM');
            }

            if (group.name === 'kicking') {
              current.extraPoints =
                getStat('XPA', 'XPM');

              current.fieldGoals =
                getStat('FGM');
            }

            if (
              group.name === 'defensive'
            ) {
              current.sacks =
                getStat('SACK');

              current.defensiveInterceptions =
                getStat('INT');

              current.fumbleRecoveries =
                getStat('FR');

              current.defensiveTD =
                getStat('TD');
            }

            stats.set(
              String(id),
              current
            );
          }
        }
      }
    } catch (error) {
      console.error(
        `Fantasy stats error for event ${eventId}:`,
        error.message
      );
    }
  }

  return stats;
}

async function scoreLeagueWeek(
  leagueId,
  weekNumber,
  isLive = true
) {
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
      weekNumber
    );

  const results = [];

  for (const team of teams) {
    let total = 0;

    for (const rosterPlayer of team.players) {
      if (rosterPlayer.status !== 'STARTER') {
        continue;
      }

      const playerStats =
        stats.get(
          String(
            rosterPlayer.player.espnId
          )
        );

      if (!playerStats) {
        continue;
      }

      const playerPoints =
        calculatePlayerPoints(playerStats);
      
      await prisma.fantasyPlayerWeeklyScore.upsert({
        where: {
          playerId_weekNumber: {
            playerId: rosterPlayer.playerId,
            weekNumber
          }
        },
        update: {
          points: playerPoints,
          isLive,
          statsJson: JSON.stringify(playerStats)
        },
        create: {
          playerId: rosterPlayer.playerId,
          weekNumber,
          points: playerPoints,
          isLive,
          statsJson: JSON.stringify(playerStats)
        }
      });
      
      total += playerPoints;
      const playerPoints =
        calculatePlayerPoints(playerStats);
      
      await prisma.fantasyPlayerWeeklyScore.upsert({
        where: {
          playerId_weekNumber: {
            playerId: rosterPlayer.playerId,
            weekNumber
          }
        },
        update: {
          points: playerPoints,
          isLive
        },
        create: {
          playerId: rosterPlayer.playerId,
          weekNumber,
          points: playerPoints,
          isLive,
          statsJson: JSON.stringify(playerStats)
        }
      });
    }

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

  for (const matchup of matchups) {
    const home =
      await prisma.fantasyWeeklyScore.findUnique({
        where: {
          teamId_weekNumber: {
            teamId: matchup.homeTeamId,
            weekNumber
          }
        }
      });

    const away =
      await prisma.fantasyWeeklyScore.findUnique({
        where: {
          teamId_weekNumber: {
            teamId: matchup.awayTeamId,
            weekNumber
          }
        }
      });

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
          home && away
            ? (
                home.points > away.points
                  ? 'FINAL_HOME'
                  : away.points > home.points
                    ? 'FINAL_AWAY'
                    : 'FINAL_TIE'
              )
            : 'LIVE'
      }
    });
  }
}

async function isWeekComplete(weekNumber) {
  try {
    const url =
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=2026&seasontype=2&week=${weekNumber}`;

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
  calculatePlayerPoints,
  getWeeklyStats,
  scoreLeagueWeek,
  updateMatchups,
  isWeekComplete
};
