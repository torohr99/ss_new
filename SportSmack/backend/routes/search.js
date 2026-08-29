const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const prisma = new PrismaClient();

// @route GET /api/search?q=...
// @desc Global search across users and teams
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json([]);
    }

    const searchQuery = q.trim();

    // 1. Query Users
    const users = await prisma.user.findMany({
      where: { username: { contains: searchQuery, mode: 'insensitive' } },
      select: { id: true, username: true },
      take: 5
    });

    // 2. Query Teams (Using Postgres native 'insensitive' search instead of heavy in-memory filtering)
    const teams = await prisma.team.findMany({
      where: {
        OR: [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { abbreviation: { contains: searchQuery, mode: 'insensitive' } },
          { sport: { contains: searchQuery, mode: 'insensitive' } }
        ]
      },
      select: { id: true, name: true, logoUrl: true, sport: true },
      take: 5
    });

    // 3. Format and combine results
    const formattedUsers = users.map(u => ({
      id: u.id,
      type: 'user',
      displayName: u.username,
      avatar: u.username[0].toUpperCase()
    }));

    const formattedTeams = teams.map(t => ({
      id: t.id,
      type: 'team',
      displayName: t.name, // Uses the full ESPN name (e.g. "Los Angeles Lakers")
      avatar: t.logoUrl,    // Fixed from logo_url to camelCase logoUrl
      sport: t.sport
    }));

    const combinedResults = [...formattedUsers, ...formattedTeams];
    res.json(combinedResults);
  } catch (error) {
    console.error("Global search crash:", error);
    res.status(500).json({ message: 'Server error during global search' });
  }
});

module.exports = router;

