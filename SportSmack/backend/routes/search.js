const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');

const prisma = new PrismaClient();

// @route   GET /api/search?q=...
// @desc    Global search across users and teams
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchQuery = q.trim();

    // Query Users
    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: searchQuery
        }
      },
      select: {
        id: true,
        username: true
      },
      take: 5
    });

    // Query Teams (In-memory filter to bypass SQLite case-sensitivity)
    const allTeams = await prisma.team.findMany({
      select: {
        id: true,
        city: true,
        name: true,
        logo_url: true
      }
    });

    const lowerQuery = searchQuery.toLowerCase();
    const teams = allTeams.filter(t => 
      t.name.toLowerCase().includes(lowerQuery) || 
      t.city.toLowerCase().includes(lowerQuery)
    ).slice(0, 5);

    // Format and combine results
    const formattedUsers = users.map(u => ({
      ...u,
      type: 'user',
      displayName: u.username,
      avatar: u.username[0].toUpperCase()
    }));

    const formattedTeams = teams.map(t => ({
      ...t,
      type: 'team',
      displayName: `${t.city} ${t.name}`,
      avatar: t.logo_url
    }));

    const combinedResults = [...formattedUsers, ...formattedTeams];

    res.json(combinedResults);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during global search' });
  }
});

module.exports = router;
