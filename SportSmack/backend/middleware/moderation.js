const prisma = require('../lib/prisma');

const MAX_POST_LENGTH = 5000;
const MAX_COMMENT_LENGTH = 2000;

function normalizeText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateContent(
  value,
  maxLength,
  fieldName
) {
  const content = normalizeText(value);

  if (!content) {
    return {
      valid: false,
      message: `${fieldName} is required.`
    };
  }

  if (content.length > maxLength) {
    return {
      valid: false,
      message:
        `${fieldName} must be ${maxLength} characters or fewer.`
    };
  }

  return {
    valid: true,
    content
  };
}

async function isBlocked(
  userA,
  userB
) {
  if (
    !Number.isInteger(userA) ||
    !Number.isInteger(userB)
  ) {
    return false;
  }

  if (userA === userB) {
    return false;
  }

  const block = await prisma.block.findFirst({
    where: {
      OR: [
        {
          blockerId: userA,
          blockedId: userB
        },
        {
          blockerId: userB,
          blockedId: userA
        }
      ]
    },
    select: {
      id: true
    }
  });

  return Boolean(block);
}

async function hasRecentDuplicatePost(
  userId,
  content
) {
  const cutoff = new Date(
    Date.now() - 60 * 1000
  );

  const recent = await prisma.post.findFirst({
    where: {
      user_id: userId,
      created_at: {
        gte: cutoff
      },
      content
    },
    select: {
      id: true
    }
  });

  return Boolean(recent);
}

async function hasRecentDuplicateComment(
  userId,
  content
) {
  const cutoff = new Date(
    Date.now() - 60 * 1000
  );

  const recent =
    await prisma.comment.findFirst({
      where: {
        user_id: userId,
        created_at: {
          gte: cutoff
        },
        content
      },
      select: {
        id: true
      }
    });

  return Boolean(recent);
}

module.exports = {
  MAX_POST_LENGTH,
  MAX_COMMENT_LENGTH,
  normalizeText,
  validateContent,
  isBlocked,
  hasRecentDuplicatePost,
  hasRecentDuplicateComment
};
