const prisma = require('../lib/prisma');

const POST_PRIVACY_VALUES = Object.freeze([
  'FRIENDS_ONLY',
  'PUBLIC'
]);

async function canViewPost(viewerId, post, client = prisma) {
  if (
    !Number.isSafeInteger(viewerId) ||
    viewerId < 1 ||
    !post ||
    !Number.isSafeInteger(post.user_id) ||
    post.user_id < 1
  ) {
    return false;
  }

  if (viewerId === post.user_id) {
    return true;
  }

  const [author, block, friendship] = await Promise.all([
    client.user.findUnique({
      where: { id: post.user_id },
      select: { id: true, postPrivacy: true }
    }),
    client.block.findFirst({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: post.user_id },
          { blockerId: post.user_id, blockedId: viewerId }
        ]
      },
      select: { id: true }
    }),
    client.friendship.findFirst({
      where: {
        status: 'ACCEPTED',
        OR: [
          { user_id: viewerId, friend_id: post.user_id },
          { user_id: post.user_id, friend_id: viewerId }
        ]
      },
      select: { id: true }
    })
  ]);

  if (!author || block) {
    return false;
  }

  return Boolean(friendship) || author.postPrivacy === 'PUBLIC';
}

module.exports = {
  POST_PRIVACY_VALUES,
  canViewPost
};
