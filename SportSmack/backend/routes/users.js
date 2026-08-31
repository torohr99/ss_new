const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const authMiddleware = require('../middleware/auth');
const sportsApi = require('../services/sportsApi');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// Protect all user routes
router.use(authMiddleware);

// @route   GET /api/users/search?q=...
// @desc    Search for users
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json([]);

    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: q
        },
        id: {
          not: req.user.id // Exclude self from search
        }
      },
      select: {
        id: true,
        username: true,
        created_at: true
      },
      take: 10
    });

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error during search' });
  }
});

// @route   GET /api/users/requests
// @desc    Get pending friend requests for current user
router.get('/requests', async (req, res) => {
  try {
    const requests = await prisma.friendship.findMany({
      where: {
        friend_id: req.user.id,
        status: 'PENDING'
      },
      include: {
        user: {
          select: { id: true, username: true }
        }
      }
    });
    res.json(requests);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching requests' });
  }
});

// @route   GET /api/users/:id
// @desc    Get user profile and relationship status
router.get('/:id', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid ID' });

    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { 
        id: true, 
        username: true, 
        created_at: true,
        predictions_total: true,
        predictions_won: true,
        badges: true,
        teams: {
          include: { team: true }
        }
      }
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // Determine relationship status if not self
    let relationship = 'NONE';
    if (targetUserId !== req.user.id) {
      const friendship = await prisma.friendship.findFirst({
        where: {
          OR: [
            { user_id: req.user.id, friend_id: targetUserId },
            { user_id: targetUserId, friend_id: req.user.id }
          ]
        }
      });

      if (friendship) {
        if (friendship.status === 'ACCEPTED') {
          relationship = 'ACCEPTED';
        } else {
          // It's pending. But who sent it?
          relationship = friendship.user_id === req.user.id ? 'PENDING_SENT' : 'PENDING_RECEIVED';
        }
      }
    } else {
      relationship = 'SELF';
    }

    res.json({ ...user, relationship });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching user' });
  }
});

// @route   GET /api/users/:id/friends
// @desc    Get user's accepted friends
router.get('/:id/friends', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid ID' });

    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user_id: targetUserId },
          { friend_id: targetUserId }
        ]
      },
      include: {
        user: { select: { id: true, username: true } },
        friend: { select: { id: true, username: true } }
      }
    });

    const friendsList = friendships.map(f => 
      f.user_id === targetUserId ? f.friend : f.user
    );

    res.json(friendsList);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching friends' });
  }
});

// @route   POST /api/users/:id/friend
// @desc    Send a friend request
router.post('/:id/friend', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId) || targetUserId === req.user.id) {
      return res.status(400).json({ message: 'Invalid operation' });
    }

    // Check if relationship already exists
    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user_id: req.user.id, friend_id: targetUserId },
          { user_id: targetUserId, friend_id: req.user.id }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ message: 'Relationship already exists' });
    }

    const friendship = await prisma.friendship.create({
      data: {
        user_id: req.user.id,
        friend_id: targetUserId,
        status: 'PENDING'
      }
    });

    res.status(201).json(friendship);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error sending request' });
  }
});

// @route   PUT /api/users/:id/friend
// @desc    Accept a friend request
router.put('/:id/friend', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid ID' });

    // Find the pending request sent TO the current user BY the target user
    const request = await prisma.friendship.findFirst({
      where: {
        user_id: targetUserId,
        friend_id: req.user.id,
        status: 'PENDING'
      }
    });

    if (!request) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    const updated = await prisma.friendship.update({
      where: { id: request.id },
      data: { status: 'ACCEPTED' }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error accepting request' });
  }
});

// @route   DELETE /api/users/:id/friend
// @desc    Remove a friend or cancel/decline a request
router.delete('/:id/friend', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid ID' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user_id: req.user.id, friend_id: targetUserId },
          { user_id: targetUserId, friend_id: req.user.id }
        ]
      }
    });

    if (!existing) {
      return res.status(404).json({ message: 'Relationship not found' });
    }

    await prisma.friendship.delete({
      where: { id: existing.id }
    });

    res.json({ message: 'Relationship deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error deleting relationship' });
  }
});

// @route   POST /api/users/me/teams
// @desc    Save favorite teams for the authenticated user
router.post('/me/teams', async (req, res) => {
  try {
    const { teamIds } = req.body;
    
    if (!Array.isArray(teamIds)) {
      return res.status(400).json({ message: 'teamIds must be an array' });
    }

    // Since we use composite primary keys, Prisma will enforce uniqueness.
    // However, to do a bulk insert or replace, we first clear existing, or just insert new ones.
    // Usually, onboarding is a one-time setup, so we can just create them.
    // Or, for safety, clear existing user's teams and insert the new ones.
    
    await prisma.userTeam.deleteMany({
      where: { user_id: req.user.id }
    });

    const data = teamIds.map(team_id => ({
      user_id: req.user.id,
      team_id: parseInt(team_id)
    }));

    await prisma.userTeam.createMany({
      data,
      skipDuplicates: true // Just in case the frontend sends duplicates in the array
    });

    // Award Badge: "Team Superfan"
    const hasBadge = await prisma.userBadge.findFirst({
      where: { user_id: req.user.id, badge_name: 'Team Superfan' }
    });
    if (!hasBadge) {
      await prisma.userBadge.create({
        data: {
          user_id: req.user.id,
          badge_name: 'Team Superfan',
          icon: '⭐',
          description: 'Followed your first set of favorite teams!'
        }
      });
      await prisma.notification.create({
        data: {
          user_id: req.user.id,
          type: 'BADGE',
          message: 'You earned a new badge: Team Superfan!'
        }
      });
    }

    res.status(200).json({ message: 'Teams saved successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error saving teams' });
  }
});

// @route   GET /api/users/feed/news
// @desc    Get news for all followed teams
router.get('/feed/news', async (req, res) => {
  try {
    const userTeams = await prisma.userTeam.findMany({
      where: { user_id: req.user.id },
      include: { team: true }
    });

    if (!userTeams || userTeams.length === 0) {
      return res.json([]);
    }

    let allNews = [];

    for (const ut of userTeams) {
      try {
        const team = ut.team;
        const sportKey = (team.sport || '').toLowerCase();

        let mapping = null;
        let leagueKey = '';
        let espnDetails = null;

        if (sportsApi.LEAGUE_MAP[sportKey]) {
          mapping = sportsApi.LEAGUE_MAP[sportKey];
          leagueKey = sportKey;

          espnDetails = await sportsApi.getTeamDetails(
            mapping.sport,
            mapping.league,
            team.name,
            team.city
          );
        }

        if (!espnDetails) {
          for (const key of Object.keys(sportsApi.LEAGUE_MAP)) {
            const m = sportsApi.LEAGUE_MAP[key];

            const matches =
              (sportKey === 'nba' && key === 'nba') ||
              (sportKey === 'mlb' && key === 'mlb') ||
              (sportKey === 'nfl' && key === 'nfl') ||
              (sportKey === 'wnba' && key === 'wnba') ||
              (sportKey === 'premier league' &&
                (key === 'eng.1' ||
                 key === 'epl' ||
                 key === 'premierleague')) ||
              m.sport === sportKey;

            if (matches) {
              const details = await sportsApi.getTeamDetails(
                m.sport,
                m.league,
                team.name,
                team.city
              );

              if (details) {
                espnDetails = details;
                mapping = m;
                leagueKey = key;
                break;
              }
            }
          }
        }

        if (!espnDetails || !mapping) {
          console.log(
            `Could not resolve ESPN mapping for ${team.city} ${team.name} (${team.sport})`
          );
          continue;
        }

        const teamNewsRaw = await sportsApi.getTeamNews(
          mapping.sport,
          mapping.league,
          espnDetails.espnId
        );

        const mappedNews = (teamNewsRaw || []).map(a => ({
          id: `news_${a.id || Math.random().toString(36).slice(2)}`,
          type: 'news',
          teamId: team.id,
          teamName: team.name,
          teamCity: team.city,
          headline: a.headline || '',
          description: a.description || '',
          published: a.published || new Date().toISOString(),
          image: a.images?.[0]?.url || null,
          link: a.links?.web?.href || '#'
        }));

        allNews.push(...mappedNews);

        try {
          const socialFeeds = await sportsApi.getTeamSocialFeeds(team.name);

          if (Array.isArray(socialFeeds)) {
            allNews.push(
              ...socialFeeds.map(item => ({
                ...item,
                teamId: team.id,
                teamName: team.name,
                teamCity: team.city
              }))
            );
          }
        } catch (socialError) {
          console.error(
            `Social feed failed for ${team.name}:`,
            socialError.message
          );
        }
      } catch (teamError) {
        console.error(
          `Failed to load news for ${ut.team.name}:`,
          teamError.message
        );
      }
    }

    const uniqueNews = [];
    const seen = new Set();

    for (const item of allNews) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        uniqueNews.push(item);
      }
    }

    uniqueNews.sort((a, b) => {
      const dateA = new Date(a.published || 0).getTime();
      const dateB = new Date(b.published || 0).getTime();
      return dateB - dateA;
    });

    return res.json(uniqueNews.slice(0, 30));
  } catch (error) {
    console.error('Server error fetching news feed:', error);
    return res.status(500).json({
      message: 'Server error fetching news feed'
    });
  }
});

// @route   PUT /api/users/me
// @desc    Update user profile (profile picture, password)
router.put('/me', async (req, res) => {
  try {
    const { profile_pic, password } = req.body;
    let updateData = {};

    if (profile_pic !== undefined) {
      updateData.profile_pic = profile_pic;
    }

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password_hash = await bcrypt.hash(password, salt);
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: { id: true, username: true, email: true, profile_pic: true }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating profile' });
  }
});

// @route   GET /api/users/me/badges
// @desc    Get current user's badges
router.get('/me/badges', async (req, res) => {
  try {
    const badges = await prisma.userBadge.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' }
    });
    res.json(badges);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching badges' });
  }
});

// @route   GET /api/users/:id/badges
// @desc    Get any user's badges
router.get('/:id/badges', async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.id);
    if (isNaN(targetUserId)) return res.status(400).json({ message: 'Invalid ID' });

    const badges = await prisma.userBadge.findMany({
      where: { user_id: targetUserId },
      orderBy: { created_at: 'desc' }
    });
    res.json(badges);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching badges' });
  }
});

// @route   GET /api/users/me/notifications
// @desc    Get notifications
router.get('/me/notifications', async (req, res) => {
  try {
    const notifs = await prisma.notification.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_at: 'desc' },
      take: 20
    });
    res.json(notifs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching notifications' });
  }
});

// @route   PUT /api/users/me/notifications/read
// @desc    Mark notifications as read
router.put('/me/notifications/read', async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.user.id, read: false },
      data: { read: true }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error updating notifications' });
  }
});

// @route   GET /api/users/me/teams/details
// @desc    Get detailed schedule and stats for all followed teams (for the sidebar)
router.get('/me/teams/details', authMiddleware, async (req, res) => {
  try {
    const userTeams = await prisma.userTeam.findMany({
      where: { user_id: req.user.id },
      include: { team: true }
    });

    const teamDetailsList = [];

    for (const ut of userTeams) {
      let leagueKey = '';
      let mapping = null;
      let espnDetails = null;

      let sportKey = ut.team.sport.toLowerCase();
      
      // If the team's sport is a direct league key (e.g. 'ncaam', 'ncaaf'), use it directly
      if (sportsApi.LEAGUE_MAP[sportKey]) {
        const m = sportsApi.LEAGUE_MAP[sportKey];
        const details = await sportsApi.getTeamDetails(m.sport, m.league, ut.team.name, ut.team.city);
        if (details) {
          espnDetails = details;
          mapping = m;
          leagueKey = sportKey;
        }
      } else if (sportKey === 'college') {
        // Just default to fetching Men's Basketball (ncaam) for the sidebar preview
        const m = sportsApi.LEAGUE_MAP['ncaam'];
        const details = await sportsApi.getTeamDetails(m.sport, m.league, ut.team.name, ut.team.city);
        if (details) {
          espnDetails = details;
          mapping = m;
          leagueKey = 'ncaam';
        }
      } else {
        // Fallback for generic or others where sport matches mapping.sport
        for (const key of Object.keys(sportsApi.LEAGUE_MAP)) {
          const m = sportsApi.LEAGUE_MAP[key];
          if (m.sport === sportKey) {
            const details = await sportsApi.getTeamDetails(m.sport, m.league, ut.team.name, ut.team.city);
            if (details) {
              espnDetails = details;
              mapping = m;
              leagueKey = key;
              break;
            }
          }
        }
      }

      if (espnDetails && mapping) {
        const schedule = await sportsApi.getTeamSchedule(mapping.sport, mapping.league, espnDetails.espnId);
        
        // Fetch scoreboard to overlay live scores if the game is currently being played
        const scoreboard = await sportsApi.getScoreboard(leagueKey);
        if (schedule && schedule.todayGame) {
          const liveGame = scoreboard.find(g => g.id === schedule.todayGame.id);
          if (liveGame) {
            schedule.todayGame.homeTeam.score = liveGame.homeTeam.score;
            schedule.todayGame.awayTeam.score = liveGame.awayTeam.score;
            schedule.todayGame.status = liveGame.status;
          }
        }

        teamDetailsList.push({
          id: ut.team.id,
          name: ut.team.name,
          city: ut.team.city,
          logo_url: ut.team.logo_url,
          color: espnDetails.color,
          leagueKey: leagueKey,
          schedule: {
            todayGame: schedule?.todayGame || null,
            nextGame: schedule?.nextGame || null
          }
        });
      }
    }

    res.json(teamDetailsList);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching team details' });
  }
});

module.exports = router;
