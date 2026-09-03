const {
  PrismaClient
} = require('@prisma/client');

const prisma = new PrismaClient();

const MAX_ROSTER_SIZE = 15;

async function processLeagueWaivers(leagueId) {
  const claims =
    await prisma.fantasyWaiverClaim.findMany({
      where: {
        leagueId,
        status: 'PENDING'
      },
      orderBy: [
        {
          playerId: 'asc'
        },
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
          include: {
            players: true
          }
        }
      }
    });

  const processedPlayers = new Set();
  const results = [];

  for (const claim of claims) {
    if (processedPlayers.has(claim.playerId)) {
      continue;
    }

    const stillRostered =
      await prisma.fantasyTeamPlayer.findFirst({
        where: {
          playerId: claim.playerId,
          team: {
            leagueId
          }
        }
      });

    if (stillRostered) {
      await prisma.fantasyWaiverClaim.updateMany({
        where: {
          leagueId,
          playerId: claim.playerId,
          status: 'PENDING'
        },
        data: {
          status: 'REJECTED'
        }
      });

      processedPlayers.add(claim.playerId);
      continue;
    }

    const currentTeam =
      await prisma.fantasyTeam.findUnique({
        where: {
          id: claim.teamId
        },
        include: {
          players: true
        }
      });

    if (!currentTeam) {
      await prisma.fantasyWaiverClaim.update({
        where: {
          id: claim.id
        },
        data: {
          status: 'REJECTED'
        }
      });

      processedPlayers.add(claim.playerId);
      continue;
    }

    if (currentTeam.players.length >= MAX_ROSTER_SIZE) {
      await prisma.fantasyWaiverClaim.update({
        where: {
          id: claim.id
        },
        data: {
          status: 'REJECTED'
        }
      });

      processedPlayers.add(claim.playerId);
      continue;
    }

    if (claim.bidAmount > currentTeam.faab) {
      await prisma.fantasyWaiverClaim.update({
        where: {
          id: claim.id
        },
        data: {
          status: 'REJECTED'
        }
      });

      processedPlayers.add(claim.playerId);
      continue;
    }

    await prisma.$transaction(async tx => {
      await tx.fantasyTeamPlayer.create({
        data: {
          teamId: claim.teamId,
          playerId: claim.playerId,
          status: 'BENCH'
        }
      });

      await tx.fantasyTeam.update({
        where: {
          id: claim.teamId
        },
        data: {
          faab: {
            decrement: claim.bidAmount
          }
        }
      });

      await tx.fantasyTransaction.create({
        data: {
          leagueId,
          teamId: claim.teamId,
          playerId: claim.playerId,
          type: 'WAIVER_ADD'
        }
      });

      await tx.fantasyWaiverClaim.update({
        where: {
          id: claim.id
        },
        data: {
          status: 'APPROVED'
        }
      });

      await tx.fantasyWaiverClaim.updateMany({
        where: {
          leagueId,
          playerId: claim.playerId,
          status: 'PENDING',
          id: {
            not: claim.id
          }
        },
        data: {
          status: 'REJECTED'
        }
      });
    });

    processedPlayers.add(claim.playerId);

    results.push({
      playerId: claim.playerId,
      playerName: claim.player.name,
      teamId: claim.teamId,
      teamName: currentTeam.name,
      bidAmount: claim.bidAmount,
      status: 'APPROVED'
    });
  }

  return results;
}

async function processAllDueWaivers() {
  const leagues =
    await prisma.fantasyLeague.findMany({
      where: {
        status: 'SEASON'
      }
    });

  const results = [];

  for (const league of leagues) {
    try {
      const processed =
        await processLeagueWaivers(league.id);

      results.push({
        leagueId: league.id,
        processed
      });
    } catch (err) {
      console.error(
        `Waiver processing failed for league ${league.id}:`,
        err.message
      );
    }
  }

  return results;
}

module.exports = {
  processLeagueWaivers,
  processAllDueWaivers
};
