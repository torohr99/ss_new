const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { seedFantasyPlayers } = require('../services/fantasySeeder');

// Middleware to authenticate user from JWT
const authenticateToken = require('../middleware/auth');

// Seed players (Admin route)
router.post('/seed', async (req, res) => {
  try {
    const total = await seedFantasyPlayers();
    res.json({ message: 'Seeding complete', total });
  } catch (err) {
    res.status(500).json({ error: 'Failed to seed players' });
  }
});

// Get all players available for draft
router.get('/players', authenticateToken, async (req, res) => {
  try {
    const players = await prisma.fantasyPlayer.findMany({
      orderBy: { name: 'asc' }
    });
    res.json(players);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

// Create a new league
router.post('/league', authenticateToken, async (req, res) => {
  const { name } = req.body;
  try {
    const league = await prisma.fantasyLeague.create({
      data: {
        name,
        ownerId: req.user.id
      }
    });

    // Auto-create a team for the owner
    await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: `${req.user.username}'s Team`
      }
    });

    res.json(league);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create league' });
  }
});

// Create a test league with bots
router.post('/league/test-bots', authenticateToken, async (req, res) => {
  const name = "Test League with Bots";
  try {
    const league = await prisma.fantasyLeague.create({
      data: {
        name,
        ownerId: req.user.id,
        status: 'DRAFTING'
      }
    });

    // Auto-create a team for the owner
    const userTeam = await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: `${req.user.username}'s Team`
      }
    });

    // Create or find 9 bot users
    const botTeams = [];
    for (let i = 1; i <= 9; i++) {
      const botUsername = `Bot_${i}`;
      let bot = await prisma.user.findUnique({ where: { username: botUsername } });
      if (!bot) {
        bot = await prisma.user.create({
          data: {
            username: botUsername,
            email: `bot${i}@sportsmack.test`,
            password_hash: 'bot_pass',
            isVerified: true
          }
        });
      }
      const botTeam = await prisma.fantasyTeam.create({
        data: {
          leagueId: league.id,
          userId: bot.id,
          name: `Team ${botUsername}`
        }
      });
      botTeams.push(botTeam);
    }

    // Set Draft Order
    const allTeams = [userTeam, ...botTeams];
    // Shuffle
    for (let i = allTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allTeams[i], allTeams[j]] = [allTeams[j], allTeams[i]];
    }

    const draftOrderIds = allTeams.map(t => t.id).join(',');
    await prisma.fantasyLeague.update({
      where: { id: league.id },
      data: { currentDraftPick: 1, draftOrder: draftOrderIds }
    });

    res.json(league);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create test league' });
  }
});

// Get user's leagues
router.get('/leagues', authenticateToken, async (req, res) => {
  try {
    const teams = await prisma.fantasyTeam.findMany({
      where: { userId: req.user.id },
      include: { league: true }
    });
    res.json(teams.map(t => t.league));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leagues' });
  }
});

// Get league details
router.get('/league/:id', authenticateToken, async (req, res) => {
  try {
    const league = await prisma.fantasyLeague.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        teams: {
          include: {
            user: { select: { id: true, username: true } },
            players: { include: { player: true } },
            weeklyScores: true
          }
        }
      }
    });
    if (!league) return res.status(404).json({ error: 'League not found' });
    res.json(league);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch league' });
  }
});

// Join a league
router.post('/league/:id/join', authenticateToken, async (req, res) => {
  const { teamName } = req.body;
  try {
    const league = await prisma.fantasyLeague.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!league) return res.status(404).json({ error: 'League not found' });
    if (league.status !== 'PREDRAFT') return res.status(400).json({ error: 'League already drafted' });

    const existingTeam = await prisma.fantasyTeam.findFirst({
      where: { leagueId: league.id, userId: req.user.id }
    });
    if (existingTeam) return res.status(400).json({ error: 'Already in this league' });

    const team = await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: teamName || `${req.user.username}'s Team`
      }
    });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: 'Failed to join league' });
  }
});

// Manage Roster (Set Starter/Bench)
router.post('/team/:id/roster', authenticateToken, async (req, res) => {
  const { teamPlayerId, status } = req.body; // status: 'STARTER' or 'BENCH'
  try {
    // Verify ownership
    const team = await prisma.fantasyTeam.findUnique({ where: { id: parseInt(req.params.id) } });
    if (team.userId !== req.user.id) return res.status(403).json({ error: 'Not your team' });

    const updated = await prisma.fantasyTeamPlayer.update({
      where: { id: parseInt(teamPlayerId) },
      data: { status }
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update roster' });
  }
});

module.exports = router;
