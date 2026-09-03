const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const {
  generateWeeklyMatchups
} = require('../services/fantasyMatchups');
const {
  validateStarterRoster
} = require('../services/fantasyRoster');
const {
  processLeagueWaivers
} = require('../services/fantasyWaivers');

const { seedFantasyPlayers } = require('../services/fantasySeeder');

const fantasyStats = require('../services/fantasyStats');
const {
  createTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade
} = require('../services/fantasyTrades');

const authenticateToken = require('../middleware/auth');

const VALID_POSITIONS = new Set([
  'QB',
  'RB',
  'WR',
  'TE',
  'K',
  'DST'
]);

const STARTER_LIMITS = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DST: 1
};

const FLEX_LIMIT = 1;
const MAX_ROSTER_SIZE = 15;

function normalizePosition(position) {
  return String(position || '').toUpperCase();
}

function isFlexEligible(position) {
  return ['RB', 'WR', 'TE'].includes(position);
}

  const counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  for (const player of starters) {
    const position =
      normalizePosition(
        player.player.position
      );

    if (counts[position] !== undefined) {
      counts[position]++;
    }
  }

  if (counts.QB > 1) {
    return 'You can only start 1 QB.';
  }

  if (counts.RB > 3) {
    return 'You can only start 3 RBs including FLEX.';
  }

  if (counts.WR > 3) {
    return 'You can only start 3 WRs including FLEX.';
  }

  if (counts.TE > 2) {
    return 'You can only start 2 TEs including FLEX.';
  }

  if (counts.K > 1) {
    return 'You can only start 1 K.';
  }

  if (counts.DST > 1) {
    return 'You can only start 1 DST.';
  }

  const basePlayers =
    Math.min(counts.QB, 1) +
    Math.min(counts.RB, 2) +
    Math.min(counts.WR, 2) +
    Math.min(counts.TE, 1) +
    Math.min(counts.K, 1) +
    Math.min(counts.DST, 1);

  const flexUsed =
    Math.max(0, counts.RB - 2) +
    Math.max(0, counts.WR - 2) +
    Math.max(0, counts.TE - 1);

  if (flexUsed > 1) {
    return 'You can only use 1 FLEX position.';
  }

  return null;
}

/* =========================================================
   PLAYERS
========================================================= */

router.post('/seed', authenticateToken, async (req, res) => {
  try {
    const total = await seedFantasyPlayers();
    res.json({
      message: 'Seeding complete',
      total
    });
  } catch (err) {
    console.error('Fantasy seed error:', err);
    res.status(500).json({
      error: 'Failed to seed players'
    });
  }
});

router.get('/players', authenticateToken, async (req, res) => {
  try {
    const players = await prisma.fantasyPlayer.findMany({
      orderBy: {
        name: 'asc'
      }
    });

    res.json(players);
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: 'Failed to fetch players'
    });
  }
});

router.get('/players/search', authenticateToken, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    const position = normalizePosition(req.query.position);
    const team = String(req.query.team || '').trim().toUpperCase();

    const where = {};

    if (q) {
      where.name = {
        contains: q
      };
    }

    if (position && VALID_POSITIONS.has(position)) {
      where.position = position;
    }

    if (team) {
      where.team = team;
    }

    const players = await prisma.fantasyPlayer.findMany({
      where,
      orderBy: {
        name: 'asc'
      },
      take: 100
    });

    res.json(players);
  } catch (err) {
    console.error('Player search error:', err);
    res.status(500).json({
      error: 'Failed to search players'
    });
  }
});

/* =========================================================
   LEAGUES
========================================================= */

router.post('/league', authenticateToken, async (req, res) => {
  const { name } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      error: 'League name is required'
    });
  }

  try {
    const league = await prisma.fantasyLeague.create({
      data: {
        name: name.trim(),
        ownerId: req.user.id
      }
    });

    await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: `${req.user.username}'s Team`
      }
    });

    res.json(league);
  } catch (err) {
    console.error('Create league error:', err);
    res.status(500).json({
      error: 'Failed to create league'
    });
  }
});

router.post('/league/test-bots', authenticateToken, async (req, res) => {
  try {
    const league = await prisma.fantasyLeague.create({
      data: {
        name: 'Test League with Bots',
        ownerId: req.user.id,
        status: 'DRAFTING'
      }
    });

    const userTeam = await prisma.fantasyTeam.create({
      data: {
        leagueId: league.id,
        userId: req.user.id,
        name: `${req.user.username}'s Team`
      }
    });

    const botTeams = [];

    for (let i = 1; i <= 9; i++) {
      const botUsername = `Bot_${i}`;

      let bot = await prisma.user.findUnique({
        where: {
          username: botUsername
        }
      });

      if (!bot) {
        const bcrypt = require('bcrypt');

        bot = await prisma.user.create({
          data: {
            username: botUsername,
            email: `bot${i}@sportsmack.test`,
            password_hash: await bcrypt.hash(
              'bot_password_123',
              10
            ),
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

    const allTeams = [userTeam, ...botTeams];

    for (let i = allTeams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));

      [allTeams[i], allTeams[j]] =
        [allTeams[j], allTeams[i]];
    }

    for (let i = 0; i < allTeams.length; i++) {
      await prisma.fantasyTeam.update({
        where: {
          id: allTeams[i].id
        },
        data: {
          draftOrder: i + 1
        }
      });
    }

    res.json(league);
  } catch (err) {
    console.error('test-bots error:', err);

    res.status(500).json({
      error: 'Failed to create test league'
    });
  }
});

router.get('/leagues', authenticateToken, async (req, res) => {
  try {
    const teams = await prisma.fantasyTeam.findMany({
      where: {
        userId: req.user.id
      },
      include: {
        league: true
      }
    });

    res.json(
      teams.map(team => team.league)
    );
  } catch (err) {
    res.status(500).json({
      error: 'Failed to fetch leagues'
    });
  }
});

router.post(
  '/league/:id/join',
  authenticateToken,
  async (req, res) => {
    const { teamName } = req.body;

    try {
      const leagueId = Number(req.params.id);

      const league =
        await prisma.fantasyLeague.findUnique({
          where: {
            id: leagueId
          }
        });

      if (!league) {
        return res.status(404).json({
          error: 'League not found'
        });
      }

      if (league.status !== 'PREDRAFT') {
        return res.status(400).json({
          error: 'League is no longer accepting teams'
        });
      }

      const existingTeam =
        await prisma.fantasyTeam.findFirst({
          where: {
            leagueId,
            userId: req.user.id
          }
        });

      if (existingTeam) {
        return res.status(400).json({
          error: 'Already in this league'
        });
      }

      const team =
        await prisma.fantasyTeam.create({
          data: {
            leagueId,
            userId: req.user.id,
            name:
              teamName ||
              `${req.user.username}'s Team`
          }
        });

      res.json(team);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error: 'Failed to join league'
      });
    }
  }
);

/* =========================================================
   LEAGUE DETAILS
========================================================= */

router.get(
  '/league/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);

      const league =
        await prisma.fantasyLeague.findUnique({
          where: {
            id: leagueId
          },
          include: {
            teams: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true
                  }
                },
                players: {
                  include: {
                    player: true
                  }
                },
                weeklyScores: {
                  orderBy: {
                    weekNumber: 'asc'
                  }
                },
                homeMatchups: true,
                awayMatchups: true
              }
            },
            matchups: {
              orderBy: [
                {
                  weekNumber: 'asc'
                },
                {
                  id: 'asc'
                }
              ]
            }
          }
        });

      if (!league) {
        return res.status(404).json({
          error: 'League not found'
        });
      }

      res.json(league);
    } catch (err) {
      console.error('League details error:', err);

      res.status(500).json({
        error: 'Failed to fetch league'
      });
    }
  }
);

function getCurrentFantasyWeek() {
  const seasonStart = new Date('2026-09-09T00:00:00Z');
  const now = new Date();

  return Math.min(
    18,
    Math.max(
      1,
      Math.floor(
        (now - seasonStart) /
          (7 * 24 * 60 * 60 * 1000)
      ) + 1
    )
  );
}

function isLineupLocked(weekNumber) {
  const seasonStart = new Date('2026-09-09T00:00:00Z');

  const weekStart = new Date(
    seasonStart.getTime() +
      (weekNumber - 1) *
      7 *
      24 *
      60 *
      60 *
      1000
  );

  return new Date() >= weekStart;
}

/* =========================================================
   ROSTER
========================================================= */

router.get(
  '/team/:id',
  authenticateToken,
  async (req, res) => {
    try {
      const team =
        await prisma.fantasyTeam.findUnique({
          where: {
            id: Number(req.params.id)
          },
          include: {
            user: {
              select: {
                id: true,
                username: true
              }
            },
            players: {
              include: {
                player: true
              }
            },
            weeklyScores: {
              orderBy: {
                weekNumber: 'asc'
              }
            }
          }
        });

      if (!team) {
        return res.status(404).json({
          error: 'Team not found'
        });
      }

      res.json(team);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to fetch roster'
      });
    }
  }
);

router.post(
  '/team/:id/roster',
  authenticateToken,
  async (req, res) => {
    try {
      const teamId = Number(req.params.id);
      const teamPlayerId =
        Number(req.body.teamPlayerId);
      const status =
        String(req.body.status || '').toUpperCase();

      const currentWeek = getCurrentFantasyWeek();

      if (isLineupLocked(currentWeek)) {
        return res.status(409).json({
          error: `Week ${currentWeek} lineup is locked.`
        });
      }

      if (!['STARTER', 'BENCH'].includes(status)) {
        return res.status(400).json({
          error: 'Invalid roster status'
        });
      }

      const team =
        await prisma.fantasyTeam.findUnique({
          where: {
            id: teamId
          },
          include: {
            players: {
              include: {
                player: true
              }
            }
          }
        });

      if (!team) {
        return res.status(404).json({
          error: 'Team not found'
        });
      }

      if (team.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Not your team'
        });
      }

      const target =
        team.players.find(
          player =>
            player.id === teamPlayerId
        );

      if (!target) {
        return res.status(404).json({
          error: 'Player not found on roster'
        });
      }

      const updatedPlayers =
        team.players.map(player =>
          player.id === teamPlayerId
            ? {
                ...player,
                status
              }
            : player
        );

      const validationError =
        validateStarterRoster(
          updatedPlayers
        );

      if (validationError) {
        return res.status(400).json({
          error: validationError
        });
      }

      const updated =
        await prisma.fantasyTeamPlayer.update({
          where: {
            id: teamPlayerId
          },
          data: {
            status
          },
          include: {
            player: true
          }
        });

      res.json(updated);
    } catch (err) {
      console.error('Roster update error:', err);

      res.status(500).json({
        error: 'Failed to update roster'
      });
    }
  }
);

/* =========================================================
   FREE AGENTS
========================================================= */

router.get(
  '/league/:id/free-agents',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);

      const rostered =
        await prisma.fantasyTeamPlayer.findMany({
          where: {
            team: {
              leagueId
            }
          },
          select: {
            playerId: true
          }
        });

      const rosteredIds =
        rostered.map(p => p.playerId);

      const players =
        await prisma.fantasyPlayer.findMany({
          where: {
            id: {
              notIn: rosteredIds
            }
          },
          orderBy: [
            {
              position: 'asc'
            },
            {
              name: 'asc'
            }
          ]
        });

      res.json(players);
    } catch (err) {
      console.error('Free agent error:', err);

      res.status(500).json({
        error: 'Failed to fetch free agents'
      });
    }
  }
);

/* =========================================================
   WEEKLY MATCHUP API
========================================================= */

router.get(
  '/league/:id/week/:week',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const weekNumber = Number(req.params.week);

      if (
        !Number.isInteger(leagueId) ||
        !Number.isInteger(weekNumber) ||
        weekNumber < 1 ||
        weekNumber > 18
      ) {
        return res.status(400).json({
          error: 'Invalid league or week'
        });
      }

      const matchups =
        await prisma.fantasyMatchup.findMany({
          where: {
            leagueId,
            weekNumber
          },
          include: {
            homeTeam: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true
                  }
                },
                weeklyScores: {
                  where: {
                    weekNumber
                  }
                }
              }
            },
            awayTeam: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true
                  }
                },
                weeklyScores: {
                  where: {
                    weekNumber
                  }
                }
              }
            }
          },
          orderBy: {
            id: 'asc'
          }
        });

      res.json({
        leagueId,
        weekNumber,
        matchups
      });
    } catch (err) {
      console.error(
        'Fantasy week error:',
        err
      );

      res.status(500).json({
        error: 'Failed to fetch weekly matchups'
      });
    }
  }
);

/* =========================================================
   DROP PLAYER TRANSACTION
========================================================= */

router.post(
  '/team/:id/drop',
  authenticateToken,
  async (req, res) => {
    try {
      const teamId = Number(req.params.id);
      const teamPlayerId =
        Number(req.body.teamPlayerId);

      const team =
        await prisma.fantasyTeam.findUnique({
          where: { id: teamId },
          include: {
            league: true
          }
        });

      if (!team) {
        return res.status(404).json({
          error: 'Team not found'
        });
      }

      if (team.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Not your team'
        });
      }

      if (team.league.status !== 'SEASON') {
        return res.status(400).json({
          error: 'League is not in season'
        });
      }

      const dropped =
        await prisma.fantasyTeamPlayer.findUnique({
          where: {
            id: teamPlayerId
          }
        });

      if (!dropped || dropped.teamId !== teamId) {
        return res.status(404).json({
          error: 'Player not found on your roster'
        });
      }

      await prisma.$transaction([
        prisma.fantasyTeamPlayer.delete({
          where: {
            id: teamPlayerId
          }
        }),

        prisma.fantasyTransaction.create({
          data: {
            leagueId: team.leagueId,
            teamId,
            playerId: dropped.playerId,
            type: 'DROP'
          }
        })
      ]);

      res.json({
        success: true,
        playerId: dropped.playerId
      });
    } catch (err) {
      console.error(
        'Fantasy drop error:',
        err
      );

      res.status(500).json({
        error: 'Failed to drop player'
      });
    }
  }
);

/* =========================================================
   WAIVERS
========================================================= */

router.post(
  '/league/:id/waivers/claim',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);
      const playerId = Number(req.body.playerId);
      const bidAmount = Number(req.body.bidAmount);

      if (!Number.isInteger(leagueId) || !Number.isInteger(playerId)) {
        return res.status(400).json({
          error: 'Invalid league or player ID'
        });
      }

      if (!Number.isInteger(bidAmount) || bidAmount < 0) {
        return res.status(400).json({
          error: 'FAAB bid must be a non-negative whole number.'
        });
      }

      const team = await prisma.fantasyTeam.findFirst({
        where: {
          leagueId,
          userId: req.user.id
        },
        include: {
          league: true,
          players: true
        }
      });

      if (!team) {
        return res.status(404).json({
          error: 'Your fantasy team was not found'
        });
      }

      if (team.league.status !== 'SEASON') {
        return res.status(400).json({
          error: 'League is not in season'
        });
      }

      if (team.players.length >= MAX_ROSTER_SIZE) {
        return res.status(400).json({
          error: 'Roster is full. Drop a player before submitting a claim.'
        });
      }

      if (bidAmount > team.faab) {
        return res.status(400).json({
          error: `Bid exceeds your remaining FAAB (${team.faab}).`
        });
      }

      const player = await prisma.fantasyPlayer.findUnique({
        where: {
          id: playerId
        }
      });

      if (!player) {
        return res.status(404).json({
          error: 'Player not found'
        });
      }

      const alreadyRostered =
        await prisma.fantasyTeamPlayer.findFirst({
          where: {
            playerId,
            team: {
              leagueId
            }
          }
        });

      if (alreadyRostered) {
        return res.status(400).json({
          error: 'Player is already rostered in this league'
        });
      }

      const existingClaim =
        await prisma.fantasyWaiverClaim.findFirst({
          where: {
            leagueId,
            teamId: team.id,
            playerId,
            status: 'PENDING'
          }
        });

      if (existingClaim) {
        return res.status(400).json({
          error: 'You already have a pending claim for this player'
        });
      }

      const claim =
        await prisma.fantasyWaiverClaim.create({
          data: {
            leagueId,
            teamId: team.id,
            playerId,
            bidAmount,
            status: 'PENDING'
          },
          include: {
            player: true
          }
        });

      res.json({
        success: true,
        claim,
        remainingFaab: team.faab - bidAmount
      });
    } catch (err) {
      console.error('Waiver claim error:', err);

      res.status(500).json({
        error: 'Failed to submit waiver claim'
      });
    }
  }
);

router.get(
  '/league/:id/waivers',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);

      const team =
        await prisma.fantasyTeam.findFirst({
          where: {
            leagueId,
            userId: req.user.id
          }
        });

      if (!team) {
        return res.status(403).json({
          error: 'You are not a member of this league'
        });
      }

      const claims =
        await prisma.fantasyWaiverClaim.findMany({
          where: {
            leagueId,
            status: 'PENDING'
          },
          orderBy: [
            {
              bidAmount: 'desc'
            },
            {
              createdAt: 'asc'
            }
          ],
          include: {
            player: true,
            team: {
              select: {
                id: true,
                name: true,
                userId: true
              }
            }
          }
        });

      res.json(claims);
    } catch (err) {
      console.error(
        'Fetch waivers error:',
        err
      );

      res.status(500).json({
        error: 'Failed to fetch waiver claims'
      });
    }
  }
);

router.post(
  '/league/:id/waivers/process',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);

      const league =
        await prisma.fantasyLeague.findUnique({
          where: {
            id: leagueId
          }
        });

      if (!league) {
        return res.status(404).json({
          error: 'League not found'
        });
      }

      if (league.ownerId !== req.user.id) {
        return res.status(403).json({
          error: 'Only the league owner can process waivers'
        });
      }

      if (league.status !== 'SEASON') {
        return res.status(400).json({
          error: 'League is not in season'
        });
      }

      const processed =
        await processLeagueWaivers(leagueId);

      res.json({
        success: true,
        processed
      });
    } catch (err) {
      console.error(
        'Process waivers error:',
        err
      );

      res.status(500).json({
        error: 'Failed to process waivers'
      });
    }
  }
);
/* =========================================================
   ADD PLAYER
========================================================= */

router.post(
  '/team/:id/add-player',
  authenticateToken,
  async (req, res) => {
    try {
      const teamId = Number(req.params.id);
      const playerId =
        Number(req.body.playerId);

      const team =
        await prisma.fantasyTeam.findUnique({
          where: {
            id: teamId
          },
          include: {
            league: true,
            players: true
          }
        });

      if (!team) {
        return res.status(404).json({
          error: 'Team not found'
        });
      }

      if (team.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Not your team'
        });
      }

      if (team.league.status !== 'SEASON') {
        return res.status(400).json({
          error: 'League is not in season'
        });
      }

      if (team.players.length >= MAX_ROSTER_SIZE) {
        return res.status(400).json({
          error: 'Roster is full'
        });
      }

      const player =
        await prisma.fantasyPlayer.findUnique({
          where: {
            id: playerId
          }
        });

      if (!player) {
        return res.status(404).json({
          error: 'Player not found'
        });
      }

      const alreadyRostered =
        await prisma.fantasyTeamPlayer.findFirst({
          where: {
            team: {
              leagueId: team.leagueId
            },
            playerId
          }
        });

      if (alreadyRostered) {
        return res.status(400).json({
          error: 'Player is already rostered'
        });
      }

      const rosterPlayer =
        await prisma.fantasyTeamPlayer.create({
          data: {
            teamId,
            playerId,
            status: 'BENCH'
          },
          include: {
            player: true
          }
        });

      await prisma.fantasyTransaction.create({
        data: {
          leagueId: team.leagueId,
          teamId,
          playerId,
          type: 'ADD'
        }
      });

      res.json(rosterPlayer);
    } catch (err) {
      console.error('Add player error:', err);

      res.status(500).json({
        error: 'Failed to add player'
      });
    }
  }
);

/* =========================================================
   DROP PLAYER
========================================================= */

router.post(
  '/team/:id/drop-player',
  authenticateToken,
  async (req, res) => {
    try {
      const teamId = Number(req.params.id);
      const playerId =
        Number(req.body.playerId);

      const team =
        await prisma.fantasyTeam.findUnique({
          where: {
            id: teamId
          }
        });

      if (!team) {
        return res.status(404).json({
          error: 'Team not found'
        });
      }

      if (team.userId !== req.user.id) {
        return res.status(403).json({
          error: 'Not your team'
        });
      }

      const rosterPlayer =
        await prisma.fantasyTeamPlayer.findFirst({
          where: {
            teamId,
            playerId
          }
        });

      if (!rosterPlayer) {
        return res.status(404).json({
          error: 'Player is not on your roster'
        });
      }

      await prisma.fantasyTeamPlayer.delete({
        where: {
          id: rosterPlayer.id
        }
      });

      await prisma.fantasyTransaction.create({
        data: {
          leagueId: team.leagueId,
          teamId,
          playerId,
          type: 'DROP'
        }
      });

      res.json({
        success: true
      });
    } catch (err) {
      console.error('Drop player error:', err);

      res.status(500).json({
        error: 'Failed to drop player'
      });
    }
  }
);

/* =========================================================
   STANDINGS
========================================================= */

router.get(
  '/league/:id/standings',
  authenticateToken,
  async (req, res) => {
    try {
      const teams =
        await prisma.fantasyTeam.findMany({
          where: {
            leagueId: Number(req.params.id)
          },
          include: {
            weeklyScores: true,
            homeMatchups: true,
            awayMatchups: true
          }
        });

      const standings = teams.map(team => {
        const matchups = [
          ...team.homeMatchups,
          ...team.awayMatchups
        ];

        let wins = 0;
        let losses = 0;
        let ties = 0;

        for (const matchup of matchups) {
          if (matchup.status !== 'FINAL') {
            continue;
          }

          const isHome =
            matchup.homeTeamId === team.id;

          const teamScore = isHome
            ? matchup.homeScore
            : matchup.awayScore;

          const opponentScore = isHome
            ? matchup.awayScore
            : matchup.homeScore;

          if (teamScore > opponentScore) {
            wins++;
          } else if (teamScore < opponentScore) {
            losses++;
          } else {
            ties++;
          }
        }

        const totalPoints =
          team.weeklyScores.reduce(
            (sum, score) =>
              sum + Number(score.points || 0),
            0
          );

        return {
          teamId: team.id,
          teamName: team.name,
          wins,
          losses,
          ties,
          totalPoints
        };
      });

      standings.sort((a, b) => {
        if (b.wins !== a.wins) {
          return b.wins - a.wins;
        }

        if (b.ties !== a.ties) {
          return b.ties - a.ties;
        }

        return b.totalPoints - a.totalPoints;
      });

      res.json(standings);
    } catch (err) {
      console.error(
        'Fantasy standings error:',
        err
      );

      res.status(500).json({
        error: 'Failed to fetch standings'
      });
    }
  }
);

/* =========================================================
   MATCHUPS
========================================================= */

router.get(
  '/league/:id/matchups/:week',
  authenticateToken,
  async (req, res) => {
    try {
      const matchups =
        await prisma.fantasyMatchup.findMany({
          where: {
            leagueId:
              Number(req.params.id),
            weekNumber:
              Number(req.params.week)
          },
          include: {
            homeTeam: {
              select: {
                id: true,
                name: true
              }
            },
            awayTeam: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

      res.json(matchups);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to fetch matchups'
      });
    }
  }
);

/* =========================================================
   TRANSACTIONS
========================================================= */

router.get(
  '/league/:id/transactions',
  authenticateToken,
  async (req, res) => {
    try {
      const transactions =
        await prisma.fantasyTransaction.findMany({
          where: {
            leagueId:
              Number(req.params.id)
          },
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            team: {
              select: {
                id: true,
                name: true
              }
            },
            player: true
          },
          take: 100
        });

      res.json(transactions);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to fetch transactions'
      });
    }
  }
);

/* =========================================================
   SCORE WEEK
========================================================= */

router.post(
  '/league/:id/score-week',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId =
        Number(req.params.id);

      const weekNumber =
        Number(req.body.weekNumber);

      if (!weekNumber) {
        return res.status(400).json({
          error: 'weekNumber is required'
        });
      }

      const results =
        await fantasyStats.scoreLeagueWeek(
          leagueId,
          weekNumber
        );

      res.json(results);
    } catch (err) {
      console.error(
        'Score week error:',
        err
      );

      res.status(500).json({
        error: 'Failed to score week'
      });
    }
  }
);

router.post(
  '/league/:id/generate-matchups',
  authenticateToken,
  async (req, res) => {
    try {
      const matchups =
        await generateWeeklyMatchups(
          Number(req.params.id),
          Number(req.body.weekNumber || 1)
        );

      res.json(matchups);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          'Failed to generate matchups'
      });
    }
  }
);

/* =========================================================
   VALIDATE NUMBER OF STARTERS USED
========================================================= */

function validateCompleteStartingLineup(players) {
  const starters =
    players.filter(
      p => p.status === 'STARTER'
    );

  const counts = {
    QB: 0,
    RB: 0,
    WR: 0,
    TE: 0,
    K: 0,
    DST: 0
  };

  for (const player of starters) {
    const position =
      normalizePosition(
        player.player.position
      );

    if (counts[position] !== undefined) {
      counts[position]++;
    }
  }

  const flexUsed =
    Math.max(0, counts.RB - 2) +
    Math.max(0, counts.WR - 2) +
    Math.max(0, counts.TE - 1);

  if (counts.QB !== 1) {
    return 'You must start exactly 1 QB.';
  }

  if (counts.RB < 2) {
    return 'You must start at least 2 RBs.';
  }

  if (counts.WR < 2) {
    return 'You must start at least 2 WRs.';
  }

  if (counts.TE < 1) {
    return 'You must start at least 1 TE.';
  }

  if (counts.K !== 1) {
    return 'You must start exactly 1 K.';
  }

  if (counts.DST !== 1) {
    return 'You must start exactly 1 DST.';
  }

  if (flexUsed !== 1) {
    return 'You must use exactly 1 FLEX.';
  }

  if (starters.length !== 9) {
    return 'You must have exactly 9 starters.';
  }

  return null;
}

router.post(
  '/league/:id/trades',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);

      const {
        recipientTeamId,
        offeredPlayerIds,
        requestedPlayerIds
      } = req.body;

      const proposerTeam =
        await prisma.fantasyTeam.findFirst({
          where: {
            leagueId,
            userId: req.user.id
          }
        });

      if (!proposerTeam) {
        return res.status(404).json({
          error: 'Your fantasy team was not found.'
        });
      }

      const trade = await createTrade({
        leagueId,
        proposerTeamId: proposerTeam.id,
        recipientTeamId,
        offeredPlayerIds,
        requestedPlayerIds
      });

      res.status(201).json({
        success: true,
        trade
      });
    } catch (err) {
      console.error('Create trade error:', err);

      res.status(400).json({
        error: err.message || 'Failed to create trade.'
      });
    }
  }
);

router.get(
  '/league/:id/trades',
  authenticateToken,
  async (req, res) => {
    try {
      const leagueId = Number(req.params.id);

      const team =
        await prisma.fantasyTeam.findFirst({
          where: {
            leagueId,
            userId: req.user.id
          }
        });

      if (!team) {
        return res.status(404).json({
          error: 'Your fantasy team was not found.'
        });
      }

      const trades =
        await prisma.fantasyTrade.findMany({
          where: {
            leagueId,
            OR: [
              {
                proposerTeamId: team.id
              },
              {
                recipientTeamId: team.id
              }
            ]
          },
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            proposerTeam: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true
                  }
                }
              }
            },
            recipientTeam: {
              include: {
                user: {
                  select: {
                    id: true,
                    username: true
                  }
                }
              }
            },
            items: {
              include: {
                player: true
              }
            }
          }
        });

      res.json(trades);
    } catch (err) {
      console.error('Get trades error:', err);

      res.status(500).json({
        error: 'Failed to fetch trades.'
      });
    }
  }
);

router.post(
  '/trades/:id/accept',
  authenticateToken,
  async (req, res) => {
    try {
      const trade =
        await acceptTrade(
          Number(req.params.id),
          req.user.id
        );

      res.json({
        success: true,
        trade
      });
    } catch (err) {
      console.error('Accept trade error:', err);

      res.status(400).json({
        error: err.message || 'Failed to accept trade.'
      });
    }
  }
);

router.post(
  '/trades/:id/reject',
  authenticateToken,
  async (req, res) => {
    try {
      const trade =
        await rejectTrade(
          Number(req.params.id),
          req.user.id
        );

      res.json({
        success: true,
        trade
      });
    } catch (err) {
      console.error('Reject trade error:', err);

      res.status(400).json({
        error: err.message || 'Failed to reject trade.'
      });
    }
  }
);

router.post(
  '/trades/:id/cancel',
  authenticateToken,
  async (req, res) => {
    try {
      const trade =
        await cancelTrade(
          Number(req.params.id),
          req.user.id
        );

      res.json({
        success: true,
        trade
      });
    } catch (err) {
      console.error('Cancel trade error:', err);

      res.status(400).json({
        error: err.message || 'Failed to cancel trade.'
      });
    }
  }
);
  
module.exports = router;
