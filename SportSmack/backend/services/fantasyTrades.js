const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Verify that a player is currently owned by a specific fantasy team.
 */
async function playerBelongsToTeam(playerId, teamId) {
  const rosterPlayer = await prisma.fantasyTeamPlayer.findFirst({
    where: {
      playerId: Number(playerId),
      teamId: Number(teamId)
    }
  });

  return !!rosterPlayer;
}

/**
 * Create a pending trade.
 */
async function createTrade({
  leagueId,
  proposerTeamId,
  recipientTeamId,
  offeredPlayerIds,
  requestedPlayerIds
}) {
  leagueId = Number(leagueId);
  proposerTeamId = Number(proposerTeamId);
  recipientTeamId = Number(recipientTeamId);

  if (proposerTeamId === recipientTeamId) {
    throw new Error('You cannot trade with yourself.');
  }

  if (
    !Array.isArray(offeredPlayerIds) ||
    !Array.isArray(requestedPlayerIds)
  ) {
    throw new Error('Invalid trade players.');
  }

  if (
    offeredPlayerIds.length === 0 &&
    requestedPlayerIds.length === 0
  ) {
    throw new Error('A trade must contain at least one player.');
  }

  const league = await prisma.fantasyLeague.findUnique({
    where: { id: leagueId }
  });

  if (!league) {
    throw new Error('League not found.');
  }

  if (league.status !== 'SEASON') {
    throw new Error('Trades are only available during the season.');
  }

  const proposerTeam = await prisma.fantasyTeam.findUnique({
    where: { id: proposerTeamId }
  });

  const recipientTeam = await prisma.fantasyTeam.findUnique({
    where: { id: recipientTeamId }
  });

  if (!proposerTeam || !recipientTeam) {
    throw new Error('Fantasy team not found.');
  }

  if (
    proposerTeam.leagueId !== leagueId ||
    recipientTeam.leagueId !== leagueId
  ) {
    throw new Error('Both teams must belong to this league.');
  }

  // Verify every player being offered belongs to proposer.
  for (const playerId of offeredPlayerIds) {
    if (!(await playerBelongsToTeam(playerId, proposerTeamId))) {
      throw new Error(
        `Player ${playerId} is not on your roster.`
      );
    }
  }

  // Verify every requested player belongs to recipient.
  for (const playerId of requestedPlayerIds) {
    if (!(await playerBelongsToTeam(playerId, recipientTeamId))) {
      throw new Error(
        `Player ${playerId} is not on the other team's roster.`
      );
    }
  }

  const trade = await prisma.$transaction(async tx => {
    const createdTrade = await tx.fantasyTrade.create({
      data: {
        leagueId,
        proposerTeamId,
        recipientTeamId,
        status: 'PENDING'
      }
    });

    for (const playerId of offeredPlayerIds) {
      await tx.fantasyTradeItem.create({
        data: {
          tradeId: createdTrade.id,
          playerId: Number(playerId),
          fromTeamId: proposerTeamId,
          toTeamId: recipientTeamId
        }
      });
    }

    for (const playerId of requestedPlayerIds) {
      await tx.fantasyTradeItem.create({
        data: {
          tradeId: createdTrade.id,
          playerId: Number(playerId),
          fromTeamId: recipientTeamId,
          toTeamId: proposerTeamId
        }
      });
    }

    return createdTrade;
  });

  return trade;
}

/**
 * Accept and execute a trade atomically.
 */
async function acceptTrade(tradeId, userId) {
  tradeId = Number(tradeId);
  userId = Number(userId);

  return prisma.$transaction(async tx => {
    const trade = await tx.fantasyTrade.findUnique({
      where: { id: tradeId },
      include: {
        league: true,
        proposerTeam: true,
        recipientTeam: true,
        items: true
      }
    });

    if (!trade) {
      throw new Error('Trade not found.');
    }

    if (trade.status !== 'PENDING') {
      throw new Error('This trade is no longer pending.');
    }

    if (trade.league.status !== 'SEASON') {
      throw new Error('Trades are only available during the season.');
    }

    if (trade.recipientTeam.userId !== userId) {
      throw new Error(
        'Only the receiving team can accept this trade.'
      );
    }

    // Verify every player is STILL owned by the expected team.
    for (const item of trade.items) {
      const rosterPlayer = await tx.fantasyTeamPlayer.findFirst({
        where: {
          playerId: item.playerId,
          teamId: item.fromTeamId
        }
      });

      if (!rosterPlayer) {
        throw new Error(
          'One or more players are no longer available for this trade.'
        );
      }
    }

    // Move every player.
    for (const item of trade.items) {
      await tx.fantasyTeamPlayer.updateMany({
        where: {
          playerId: item.playerId,
          teamId: item.fromTeamId
        },
        data: {
          teamId: item.toTeamId
        }
      });

      await tx.fantasyTransaction.create({
        data: {
          leagueId: trade.leagueId,
          teamId: item.toTeamId,
          playerId: item.playerId,
          type: 'TRADE'
        }
      });
    }

    // Mark trade accepted.
    const updatedTrade = await tx.fantasyTrade.update({
      where: { id: trade.id },
      data: {
        status: 'ACCEPTED',
        respondedAt: new Date()
      },
      include: {
        items: {
          include: {
            player: true
          }
        },
        proposerTeam: true,
        recipientTeam: true
      }
    });

    return updatedTrade;
  });
}

/**
 * Reject a pending trade.
 */
async function rejectTrade(tradeId, userId) {
  const trade = await prisma.fantasyTrade.findUnique({
    where: { id: Number(tradeId) },
    include: {
      recipientTeam: true
    }
  });

  if (!trade) {
    throw new Error('Trade not found.');
  }

  if (trade.status !== 'PENDING') {
    throw new Error('Trade is no longer pending.');
  }

  if (trade.recipientTeam.userId !== Number(userId)) {
    throw new Error(
      'Only the receiving team can reject this trade.'
    );
  }

  return prisma.fantasyTrade.update({
    where: { id: trade.id },
    data: {
      status: 'REJECTED',
      respondedAt: new Date()
    }
  });
}

/**
 * Cancel a trade created by the current user.
 */
async function cancelTrade(tradeId, userId) {
  const trade = await prisma.fantasyTrade.findUnique({
    where: { id: Number(tradeId) },
    include: {
      proposerTeam: true
    }
  });

  if (!trade) {
    throw new Error('Trade not found.');
  }

  if (trade.status !== 'PENDING') {
    throw new Error('Trade is no longer pending.');
  }

  if (trade.proposerTeam.userId !== Number(userId)) {
    throw new Error(
      'Only the team that proposed the trade can cancel it.'
    );
  }

  return prisma.fantasyTrade.update({
    where: { id: trade.id },
    data: {
      status: 'CANCELLED',
      respondedAt: new Date()
    }
  });
}

module.exports = {
  createTrade,
  acceptTrade,
  rejectTrade,
  cancelTrade
};
