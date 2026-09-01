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
    `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?limit=100&dates=2026`;

  const response =
    await axios.get(url, {
      timeout: 15000
    });

  const events =
    response.data?.events || [];

  const stats = new Map();

  for (const event of events) {
    const competitions =
      event.competitions || [];

    for (const competition of competitions) {
      const competitors =
        competition.competitors || [];

      for (const competitor of competitors) {
        const athletes =
          competitor.roster?.athletes ||
          [];

        for (const athlete of athletes) {
          if (!athlete.id) continue;

          stats.set(
            String(athlete.id),
            {
              passingYards:
                number(
                  athlete.stats?.passingYards
                ),
              passingTD:
                number(
                  athlete.stats?.passingTD
                ),
              interceptions:
                number(
                  athlete.stats?.interceptions
                ),
              rushingYards:
                number(
                  athlete.stats?.rushingYards
                ),
              rushingTD:
                number(
                  athlete.stats?.rushingTD
                ),
              receptions:
                number(
                  athlete.stats?.receptions
                ),
              receivingYards:
                number(
                  athlete.stats?.receivingYards
                ),
              receivingTD:
                number(
                  athlete.stats?.receivingTD
                )
            }
          );
        }
      }
    }
  }

  return stats;
}

async function scoreLeagueWeek(
  leagueId,
  weekNumber
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

      total +=
        calculatePlayerPoints(
          playerStats
        );
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
          isLive: false
        },
        create: {
          teamId: team.id,
          weekNumber,
          points: total,
          isLive: false
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
        status: 'FINAL'
      }
    });
  }
}

module.exports = {
  SCORING,
  calculatePlayerPoints,
  getWeeklyStats,
  scoreLeagueWeek,
  updateMatchups
};
