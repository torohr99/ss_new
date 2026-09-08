const express = require('express');
const router = express.Router();

const authMiddleware =
  require('../middleware/auth');

const prisma =
  require('../lib/prisma');

const {
  socialLimiter,
  reportLimiter
} = require('../middleware/rateLimits');

router.use(authMiddleware);

/*
 * BLOCK USER
 * POST /api/moderation/block/:userId
 */
router.post(
  '/block/:userId',
  socialLimiter,
  async (req, res) => {
    try {
      const blockedId =
        parseInt(
          req.params.userId,
          10
        );

      if (
        Number.isNaN(blockedId) ||
        blockedId === req.user.id
      ) {
        return res.status(400).json({
          message:
            'Invalid user.'
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id: blockedId
          },
          select: {
            id: true
          }
        });

      if (!user) {
        return res.status(404).json({
          message:
            'User not found.'
        });
      }

      await prisma.block.upsert({
        where: {
          blockerId_blockedId: {
            blockerId:
              req.user.id,
            blockedId
          }
        },
        update: {},
        create: {
          blockerId:
            req.user.id,
          blockedId
        }
      });

      await prisma.friendship.deleteMany({
        where: {
          OR: [
            {
              user_id:
                req.user.id,
              friend_id:
                blockedId
            },
            {
              user_id:
                blockedId,
              friend_id:
                req.user.id
            }
          ]
        }
      });

      return res.json({
        success: true,
        message:
          'User blocked.'
      });
    } catch (error) {
      console.error(
        'Block user error:',
        error
      );

      return res.status(500).json({
        message:
          'Server error blocking user.'
      });
    }
  }
);

/*
 * UNBLOCK USER
 * DELETE /api/moderation/block/:userId
 */
router.delete(
  '/block/:userId',
  socialLimiter,
  async (req, res) => {
    try {
      const blockedId =
        parseInt(
          req.params.userId,
          10
        );

      if (Number.isNaN(blockedId)) {
        return res.status(400).json({
          message:
            'Invalid user.'
        });
      }

      await prisma.block.deleteMany({
        where: {
          blockerId:
            req.user.id,
          blockedId
        }
      });

      return res.json({
        success: true,
        message:
          'User unblocked.'
      });
    } catch (error) {
      console.error(
        'Unblock user error:',
        error
      );

      return res.status(500).json({
        message:
          'Server error unblocking user.'
      });
    }
  }
);

/*
 * GET BLOCKED USERS
 * GET /api/moderation/blocks
 */
router.get(
  '/blocks',
  async (req, res) => {
    try {
      const blocks =
        await prisma.block.findMany({
          where: {
            blockerId:
              req.user.id
          },
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            blocked: {
              select: {
                id: true,
                username: true,
                profile_pic: true
              }
            }
          }
        });

      return res.json(blocks);
    } catch (error) {
      console.error(
        'Get blocks error:',
        error
      );

      return res.status(500).json({
        message:
          'Server error fetching blocked users.'
      });
    }
  }
);

/*
 * REPORT CONTENT OR USER
 * POST /api/moderation/report
 */
router.post(
  '/report',
  reportLimiter,
  async (req, res) => {
    try {
      const {
        targetType,
        targetId,
        reason,
        details
      } = req.body;

      const allowedTypes = [
        'USER',
        'POST',
        'COMMENT',
        'GAME_MESSAGE'
      ];

      const allowedReasons = [
        'SPAM',
        'HARASSMENT',
        'HATE',
        'THREATS',
        'SEXUAL_CONTENT',
        'VIOLENCE',
        'MISINFORMATION',
        'OTHER'
      ];

      if (
        !allowedTypes.includes(
          targetType
        )
      ) {
        return res.status(400).json({
          message:
            'Invalid report target.'
        });
      }

      if (
        !allowedReasons.includes(
          reason
        )
      ) {
        return res.status(400).json({
          message:
            'Invalid report reason.'
        });
      }

      if (
        !targetId ||
        String(targetId).length > 100
      ) {
        return res.status(400).json({
          message:
            'Invalid report target ID.'
        });
      }

      const existing =
        await prisma.report.findFirst({
          where: {
            reporterId:
              req.user.id,
            targetType,
            targetId: String(targetId),
            status: 'PENDING'
          }
        });

      if (existing) {
        return res.status(409).json({
          message:
            'You have already reported this.'
        });
      }

      const report =
        await prisma.report.create({
          data: {
            reporterId:
              req.user.id,
            targetType,
            targetId:
              String(targetId),
            reason,
            details:
              details
                ? String(details)
                    .trim()
                    .slice(0, 1000)
                : null
          }
        });

      return res.status(201).json({
        success: true,
        reportId:
          report.id
      });
    } catch (error) {
      console.error(
        'Report error:',
        error
      );

      return res.status(500).json({
        message:
          'Server error submitting report.'
      });
    }
  }
);

module.exports = router;
