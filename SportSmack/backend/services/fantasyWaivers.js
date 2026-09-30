const prisma = require('../lib/prisma');

const MAX_ROSTER_SIZE = 15;

async function processLeagueWaivers(
  leagueId
) {
  const league =
    await prisma.fantasyLeague.findUnique({
      where: {
        id: leagueId
      },
      select: {
        season: true
      }
    });

  if (!league) {
    throw new Error(
      `Fantasy league ${leagueId} not found.`
    );
  }

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

        /*
         * Reject claims for players who are no longer
         * active or who belong to another fantasy season.
         */
        if (
          !claim.player ||
          claim.player.season !==
            league.season ||
          !claim.player.isActive
        ) {
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
    
          processedPlayers.add(
            claim.playerId
          );
    
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
  const pendingClaims =
    await prisma.fantasyWaiverClaim.findMany({
      where: {
        status: 'PENDING'
      },
      select: {
        leagueId: true
      },
      distinct: ['leagueId']
    });

  const results = [];

  for (
    const { leagueId } of pendingClaims
  ) {
    try {
      const processed =
        await processLeagueWaivers(
          leagueId
        );

      results.push({
        leagueId,
        processed
      });
    } catch (err) {
      console.error(
        `Waiver processing failed for league ${leagueId}:`,
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
