const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const sportsApi = require('../services/sportsApi');

const prisma = new PrismaClient();

// @route   GET /api/teams
// @desc    Get all teams ordered alphabetically by city
router.get('/', authMiddleware, async (req, res) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: {
        city: 'asc'
      }
    });
    res.json(teams);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching teams' });
  }
});

// @route   GET /api/teams/:id
// @desc    Get a specific team by ID
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    if (isNaN(teamId)) return res.status(400).json({ message: 'Invalid ID' });

    const team = await prisma.team.findUnique({
      where: { id: teamId }
    });

    if (!team) return res.status(404).json({ message: 'Team not found' });

    let actualTeamIdToCheck = teamId;

    if (team.sport.toLowerCase() === 'college' && req.query.collegeSport) {
      // Find the specific program team if it exists
      const programTeam = await prisma.team.findFirst({
        where: { name: team.name, city: team.city, sport: req.query.collegeSport }
      });
      if (programTeam) {
        actualTeamIdToCheck = programTeam.id;
      } else {
        actualTeamIdToCheck = -1; // Doesn't exist, so they can't be following it
      }
    }

    // Check if following
    let followRecord = null;
    if (actualTeamIdToCheck !== -1) {
      followRecord = await prisma.userTeam.findUnique({
        where: {
          user_id_team_id: { user_id: req.user.id, team_id: actualTeamIdToCheck }
        }
      });
    }

    // Dynamically determine the correct ESPN league
    let leagueKey = '';
    let espnDetails = null;
    let mapping = null;

    if (team.sport.toLowerCase() === 'college') {
      leagueKey = req.query.collegeSport || 'ncaam';
      mapping = sportsApi.LEAGUE_MAP[leagueKey];
      if (mapping) {
        espnDetails = await sportsApi.getTeamDetails(mapping.sport, mapping.league, team.name, team.city);
      }
    } else if (sportsApi.LEAGUE_MAP[team.sport.toLowerCase()]) {
      // The sport is already a league key (e.g., 'ncaam', 'nfl')
      leagueKey = team.sport.toLowerCase();
      mapping = sportsApi.LEAGUE_MAP[leagueKey];
      espnDetails = await sportsApi.getTeamDetails(mapping.sport, mapping.league, team.name, team.city);
    } else {
      for (const key of Object.keys(sportsApi.LEAGUE_MAP)) {
        const m = sportsApi.LEAGUE_MAP[key];
        // Compare the sport (e.g., 'basketball' === 'basketball')
        if (m.sport === team.sport.toLowerCase()) {
          const details = await sportsApi.getTeamDetails(m.sport, m.league, team.name, team.city);
          if (details) {
            espnDetails = details;
            mapping = m;
            leagueKey = key;
            break; // Found the team in this league!
          }
        }
      }
    }

    let stats = null;
    let schedule = null;
    let news = [];

    if (espnDetails && mapping) {
        // Find their specific record from the standings
        const allStandings = await sportsApi.getStandings(leagueKey);
        const myStanding = allStandings.find(s => s.id === espnDetails.espnId) || {};
        
        stats = {
          color: espnDetails.color,
          alternateColor: espnDetails.alternateColor,
          wins: myStanding.wins || '0',
          losses: myStanding.losses || '0',
          streak: myStanding.streak || '-',
          homeRecord: myStanding.homeRecord || '-',
          awayRecord: myStanding.awayRecord || '-'
        };

        schedule = await sportsApi.getTeamSchedule(mapping.sport, mapping.league, espnDetails.espnId);


        // Fetch team-specific news
        const teamNewsRaw = await sportsApi.getTeamNews(mapping.sport, mapping.league, espnDetails.espnId);
        news = teamNewsRaw.map(a => ({
          id: a.id || Math.random().toString(),
          type: 'news',
          headline: a.headline,
          description: a.description,
          published: a.published,
          image: a.images?.[0]?.url || null,
          link: a.links?.web?.href || '#'
        })).slice(0, 10); // top 10 team articles
      }

    res.json({
      ...team,
      isFollowing: !!followRecord,
      leagueKey,
      stats,
      schedule,
      news
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching team' });
  }
});

// @route   POST /api/teams/:id/follow
// @desc    Follow a team
router.post('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    if (isNaN(teamId)) return res.status(400).json({ message: 'Invalid ID' });

    const baseTeam = await prisma.team.findUnique({ where: { id: teamId } });
    if (!baseTeam) return res.status(404).json({ message: 'Team not found' });

    let targetTeamId = teamId;

    // By default, just follow the teamId requested (no duplicate creation for college teams)
    await prisma.userTeam.upsert({
      where: {
        user_id_team_id: { user_id: req.user.id, team_id: targetTeamId }
      },
      update: {},
      create: {
        user_id: req.user.id,
        team_id: targetTeamId
      }
    });

    res.json({ message: 'Followed team' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error following team' });
  }
});

// @route   DELETE /api/teams/:id/follow
// @desc    Unfollow a team
router.delete('/:id/follow', authMiddleware, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);
    if (isNaN(teamId)) return res.status(400).json({ message: 'Invalid ID' });

    const baseTeam = await prisma.team.findUnique({ where: { id: teamId } });
    if (!baseTeam) return res.status(404).json({ message: 'Team not found' });

    let targetTeamId = teamId;

    await prisma.userTeam.delete({
      where: {
        user_id_team_id: { user_id: req.user.id, team_id: targetTeamId }
      }
    }).catch(() => {}); // Ignore if it doesn't exist

    res.json({ message: 'Unfollowed team' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error unfollowing team' });
  }
});

module.exports = router;
