const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// PPR Scoring Settings
const SCORING = {
  passingYards: 0.04, // 1 pt per 25 yds
  passingTD: 4,
  interception: -2,
  rushingYards: 0.1, // 1 pt per 10 yds
  rushingTD: 6,
  receptions: 1, // Full PPR
  receivingYards: 0.1, // 1 pt per 10 yds
  receivingTD: 6,
  fieldGoal: 3, // simplified Kicker scoring
  extraPoint: 1
};

async function fetchLiveScores(weekNumber) {
  try {
    console.log(`Fetching NFL Scoreboard for live scoring...`);
    // Ideally we pass week limits, but the scoreboard gives current week games
    const scoreboardRes = await axios.get('http://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');
    const events = scoreboardRes.data.events || [];

    const playerScores = {}; // espnId -> points

    for (const event of events) {
      if (event.status.type.state === 'pre') continue; // Game hasn't started
      
      const summaryRes = await axios.get(`http://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${event.id}`);
      const boxscore = summaryRes.data.boxscore;
      if (!boxscore || !boxscore.players) continue;

      // Parse boxscore
      for (const teamBox of boxscore.players) {
        for (const statCategory of teamBox.statistics) {
          const categoryName = statCategory.name;
          const labels = statCategory.labels || [];
          
          if (!['passing', 'rushing', 'receiving', 'kicking'].includes(categoryName)) continue;

          for (const athleteData of statCategory.athletes) {
            const espnId = String(athleteData.athlete.id);
            const stats = athleteData.stats;
            
            if (!playerScores[espnId]) playerScores[espnId] = 0;
            let pts = 0;

            if (categoryName === 'passing') {
              const ydsIdx = labels.indexOf('YDS');
              const tdIdx = labels.indexOf('TD');
              const intIdx = labels.indexOf('INT');
              
              if (ydsIdx !== -1) pts += parseFloat(stats[ydsIdx] || 0) * SCORING.passingYards;
              if (tdIdx !== -1) pts += parseFloat(stats[tdIdx] || 0) * SCORING.passingTD;
              if (intIdx !== -1) pts += parseFloat(stats[intIdx] || 0) * SCORING.interception;
            } else if (categoryName === 'rushing') {
              const ydsIdx = labels.indexOf('YDS');
              const tdIdx = labels.indexOf('TD');
              
              if (ydsIdx !== -1) pts += parseFloat(stats[ydsIdx] || 0) * SCORING.rushingYards;
              if (tdIdx !== -1) pts += parseFloat(stats[tdIdx] || 0) * SCORING.rushingTD;
            } else if (categoryName === 'receiving') {
              const recIdx = labels.indexOf('REC');
              const ydsIdx = labels.indexOf('YDS');
              const tdIdx = labels.indexOf('TD');
              
              if (recIdx !== -1) pts += parseFloat(stats[recIdx] || 0) * SCORING.receptions;
              if (ydsIdx !== -1) pts += parseFloat(stats[ydsIdx] || 0) * SCORING.receivingYards;
              if (tdIdx !== -1) pts += parseFloat(stats[tdIdx] || 0) * SCORING.receivingTD;
            } else if (categoryName === 'kicking') {
               const fgIdx = labels.indexOf('FG');
               const xpIdx = labels.indexOf('XP');
               
               if (fgIdx !== -1) {
                  const fgStr = stats[fgIdx]; // "2/3"
                  if (fgStr && fgStr.includes('/')) {
                     const made = parseInt(fgStr.split('/')[0]);
                     if (!isNaN(made)) pts += made * SCORING.fieldGoal;
                  }
               }
               if (xpIdx !== -1) {
                  const xpStr = stats[xpIdx]; // "1/1"
                  if (xpStr && xpStr.includes('/')) {
                     const made = parseInt(xpStr.split('/')[0]);
                     if (!isNaN(made)) pts += made * SCORING.extraPoint;
                  }
               }
            }
            
            playerScores[espnId] += pts;
          }
        }
      }
    }

    // Now update FantasyWeeklyScore for all active teams
    // For each team, sum the score of all STARTER players
    const allTeams = await prisma.fantasyTeam.findMany({
      include: {
        players: {
          where: { status: 'STARTER' }
        }
      }
    });

    for (const team of allTeams) {
      let teamTotal = 0;
      for (const tp of team.players) {
        // Find player to get espnId
        const player = await prisma.fantasyPlayer.findUnique({ where: { id: tp.playerId } });
        if (player && playerScores[player.espnId]) {
          teamTotal += playerScores[player.espnId];
        }
      }
      
      // Upsert the weekly score
      const existingScore = await prisma.fantasyWeeklyScore.findFirst({
        where: { teamId: team.id, weekNumber: weekNumber }
      });

      if (existingScore) {
        await prisma.fantasyWeeklyScore.update({
          where: { id: existingScore.id },
          data: { points: teamTotal }
        });
      } else {
        await prisma.fantasyWeeklyScore.create({
          data: {
            teamId: team.id,
            weekNumber: weekNumber,
            points: teamTotal
          }
        });
      }
    }

    console.log('Successfully updated live fantasy scores.');
  } catch (error) {
    console.error('Error fetching live scores:', error);
  }
}

module.exports = {
  fetchLiveScores
};
