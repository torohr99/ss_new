const prisma =
  require('../lib/prisma');

async function adminMiddleware(
  req,
  res,
  next
) {
  try {
    if (!req.user?.id) {
      return res.status(401).json({
        message:
          'Authentication required.'
      });
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: req.user.id
        },
        select: {
          role: true
        }
      });

    if (
      !user ||
      user.role !== 'ADMIN'
    ) {
      return res.status(403).json({
        message:
          'Administrator access required.'
      });
    }

    next();
  } catch (error) {
    console.error(
      'Admin middleware error:',
      error
    );

    return res.status(500).json({
      message:
        'Unable to verify administrator access.'
    });
  }
}

module.exports =
  adminMiddleware;
