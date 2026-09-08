const express = require('express');

const router =
  express.Router();

const authMiddleware =
  require('../middleware/auth');

const adminMiddleware =
  require('../middleware/admin');

const prisma =
  require('../lib/prisma');

router.use(authMiddleware);
router.use(adminMiddleware);

/*
 * GET /api/admin/moderation/reports
 */
router.get(
  '/reports',
  async (req, res) => {
    try {
      const reports =
        await prisma.report.findMany({
          where: {
            status: 'PENDING'
          },
          orderBy: {
            createdAt: 'asc'
          },
          take: 100,
          include: {
            reporter: {
              select: {
                id: true,
                username: true
              }
            }
          }
        });

      return res.json(
        reports
      );
    } catch (error) {
      console.error(
        'Moderation reports error:',
        error
      );

      return res.status(500).json({
        message:
          'Server error fetching reports.'
      });
    }
  }
);

/*
 * PUT /api/admin/moderation/reports/:id
 */
router.put(
  '/reports/:id',
  async (req, res) => {
    try {
      const reportId =
        parseInt(
          req.params.id,
          10
        );

      const {
        status
      } = req.body;

      const allowedStatuses = [
        'REVIEWED',
        'DISMISSED'
      ];

      if (
        Number.isNaN(reportId) ||
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          message:
            'Invalid moderation action.'
        });
      }

      const report =
        await prisma.report.update({
          where: {
            id: reportId
          },
          data: {
            status,
            resolvedAt:
              new Date(),
            resolvedBy:
              req.user.id
          }
        });

      return res.json(
        report
      );
    } catch (error) {
      console.error(
        'Resolve report error:',
        error
      );

      return res.status(500).json({
        message:
          'Server error resolving report.'
      });
    }
  }
);

module.exports =
  router;
