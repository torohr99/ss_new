const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const logger = require('../lib/logger');

const prisma = require('../lib/prisma');
const {
  writeLimiter,
  postCreationLimiter,
  socialLimiter
} = require('../middleware/rateLimits');

const {
  MAX_POST_LENGTH,
  MAX_COMMENT_LENGTH,
  validateContent,
  hasRecentDuplicatePost,
  hasRecentDuplicateComment,
  isBlocked
} = require('../middleware/moderation');
// Protect all post routes
router.use(authMiddleware);

// @route   GET /api/posts
// @desc    Get posts (global feed) ordered by newest, with cursor pagination
router.get('/', async (req, res) => {
  const feedRequestStartedAt = process.hrtime.bigint();
  try {
    const cursor = req.query.cursor;
    const take = 15; // smaller chunk size for better performance
    const forum = req.query.forum;

    const blockedUsersStartedAt =
      process.hrtime.bigint();
    
    const blockedUsers =
      await prisma.block.findMany({
        where: {
          blockerId: req.user.id
        },
        select: {
          blockedId: true
        }
      });
    
    const blockedUsersDurationMs =
      Number(
        process.hrtime.bigint() -
          blockedUsersStartedAt
      ) / 1e6;
    
    const blockedUserIds =
      blockedUsers.map(
        block => block.blockedId
      );
    
    let whereClause = {
      user_id: {
        notIn: blockedUserIds
      }
    };
    if (forum) {
      // Fetch posts specific to this forum category
      whereClause.content = { startsWith: `[FORUM:${forum}]` };
    } else {
      // Global feed hides forum posts
      whereClause.content = { not: { startsWith: '[FORUM:' } };
    }

    const queryParams = {
      where: whereClause,
      take,
      orderBy: { id: 'desc' }, // sort by id desc is safer for cursor pagination than created_at
      include: {
        user: { select: { id: true, username: true } },
        _count: {
          select: { likes: true, comments: true }
        },
        likes: {
          where: { user_id: req.user.id },
          select: { id: true }
        }
      }
    };

    if (cursor) {
      queryParams.cursor = { id: parseInt(cursor) };
      queryParams.skip = 1; // skip the cursor itself
    }

    const postsQueryStartedAt =
      process.hrtime.bigint();
    
    const posts =
      await prisma.post.findMany(queryParams);
    
    const postsQueryDurationMs =
      Number(
        process.hrtime.bigint() -
          postsQueryStartedAt
      ) / 1e6;

    const formattedPosts = posts.map(post => ({
      ...post,
      hasLiked: post.likes.length > 0,
      canDelete: post.user_id === req.user.id,
      likes: undefined
    }));
    
    // Determine the next cursor
    const nextCursor =
      posts.length === take
        ? posts[posts.length - 1].id
        : null;
    
    const feedRequestDurationMs =
      Number(
        process.hrtime.bigint() -
          feedRequestStartedAt
      ) / 1e6;
    
    if (feedRequestDurationMs >= 500) {
      console.warn(
        {
          route: '/api/posts',
          userId: req.user.id,
          feedRequestDurationMs:
            Math.round(feedRequestDurationMs),
          blockedUsersDurationMs:
            Math.round(blockedUsersDurationMs),
          postsQueryDurationMs:
            Math.round(postsQueryDurationMs),
          postCount: posts.length
        },
        'Slow feed request'
      );
    }
    
    res.json({
      posts: formattedPosts,
      nextCursor
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching posts' });
  }
});

// @route   GET /api/posts/social
// @desc    Get posts from the authenticated user and accepted friends
router.get('/social', async (req, res) => {
  const feedRequestStartedAt = process.hrtime.bigint();

  try {
    const cursor = req.query.cursor;
    const take = 15;

    // Find all accepted friendships involving the current user.
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [
          {
            user_id: req.user.id
          },
          {
            friend_id: req.user.id
          }
        ]
      },
      select: {
        user_id: true,
        friend_id: true
      }
    });

    // Build the list of users whose posts belong in the Social feed.
    const socialUserIds = new Set([req.user.id]);

    for (const friendship of friendships) {
      if (friendship.user_id === req.user.id) {
        socialUserIds.add(friendship.friend_id);
      } else {
        socialUserIds.add(friendship.user_id);
      }
    }

    // Respect the existing two-way block system.
    const blockedUsers = await prisma.block.findMany({
      where: {
        OR: [
          {
            blockerId: req.user.id
          },
          {
            blockedId: req.user.id
          }
        ]
      },
      select: {
        blockerId: true,
        blockedId: true
      }
    });

    for (const block of blockedUsers) {
      if (block.blockerId === req.user.id) {
        socialUserIds.delete(block.blockedId);
      }

      if (block.blockedId === req.user.id) {
        socialUserIds.delete(block.blockerId);
      }
    }

    const queryParams = {
      where: {
        user_id: {
          in: Array.from(socialUserIds)
        },
        content: {
          not: {
            startsWith: '[FORUM:'
          }
        }
      },
      take,
      orderBy: {
        id: 'desc'
      },
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        },
        _count: {
          select: {
            likes: true,
            comments: true
          }
        },
        likes: {
          where: {
            user_id: req.user.id
          },
          select: {
            id: true
          }
        }
      }
    };

    if (cursor) {
      const parsedCursor = parseInt(cursor, 10);

      if (Number.isNaN(parsedCursor)) {
        return res.status(400).json({
          message: 'Invalid cursor'
        });
      }

      queryParams.cursor = {
        id: parsedCursor
      };

      queryParams.skip = 1;
    }

    const posts = await prisma.post.findMany(queryParams);

    const formattedPosts = posts.map(post => ({
      ...post,
      hasLiked: post.likes.length > 0,
      canDelete: post.user_id === req.user.id,
      likes: undefined
    }));

    const nextCursor =
      posts.length === take
        ? posts[posts.length - 1].id
        : null;

    const feedRequestDurationMs =
      Number(
        process.hrtime.bigint() -
          feedRequestStartedAt
      ) / 1e6;

    if (feedRequestDurationMs >= 500) {
      console.warn(
        {
          route: '/api/posts/social',
          userId: req.user.id,
          feedRequestDurationMs:
            Math.round(feedRequestDurationMs),
          postCount: posts.length,
          socialUserCount: socialUserIds.size
        },
        'Slow social feed request'
      );
    }

    return res.json({
      posts: formattedPosts,
      nextCursor
    });
  } catch (error) {
    console.error(
      'SOCIAL FEED ERROR:',
      error
    );

    return res.status(500).json({
      message:
        'Server error fetching social feed'
    });
  }
});

// @route   POST /api/posts
// @desc    Create a new post
router.post(
  '/',
  writeLimiter,
  postCreationLimiter,
  async (req, res) => {
  try {
    const {
      content,
      image_url
    } = req.body;
    
    const validation =
      validateContent(
        content,
        MAX_POST_LENGTH,
        'Post content'
      );
    
    if (!validation.valid) {
      return res.status(400).json({
        message: validation.message
      });
    }
    
    const normalizedContent =
      validation.content;
    
    if (
      await hasRecentDuplicatePost(
        req.user.id,
        normalizedContent
      )
    ) {
      return res.status(409).json({
        message:
          'You already posted this content recently.'
      });
    }

    const newPost = await prisma.post.create({
      data: {
        content: normalizedContent,
        image_url: image_url || null,
        user_id: req.user.id
      },
      include: {
        user: { select: { id: true, username: true } },
        _count: { select: { likes: true, comments: true } }
      }
    });

    res.status(201).json({ ...newPost, hasLiked: false });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error creating post' });
  }
});

// @route   DELETE /api/posts/:id
// @desc    Delete a post owned by the authenticated user
router.delete(
  '/:id',
  writeLimiter,
  async (req, res) => {
    try {
      const postId = parseInt(req.params.id, 10);

      if (Number.isNaN(postId)) {
        return res.status(400).json({
          message: 'Invalid ID'
        });
      }

      const post = await prisma.post.findUnique({
        where: {
          id: postId
        },
        select: {
          id: true,
          user_id: true
        }
      });

      if (!post) {
        return res.status(404).json({
          message: 'Post not found'
        });
      }

      if (post.user_id !== req.user.id) {
        return res.status(403).json({
          message:
            'You can only delete your own posts.'
        });
      }

      await prisma.$transaction(async (tx) => {
        await tx.like.deleteMany({
          where: {
            post_id: postId
          }
        });
      
        await tx.comment.deleteMany({
          where: {
            post_id: postId
          }
        });
      
        await tx.post.delete({
          where: {
            id: postId
          }
        });
      });

      return res.json({
        message: 'Post deleted successfully.'
      });
    } catch (error) {
      console.error(
        'DELETE POST ERROR:',
        error
      );

      return res.status(500).json({
        message: 'Server error deleting post'
      });
    }
  }
);

// @route   POST /api/posts/:id/like
// @desc    Toggle like on a post
router.post(
  '/:id/like',
  writeLimiter,
  async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ message: 'Invalid ID' });

    // Check if post exists
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ message: 'Post not found' });

    if (
      await isBlocked(
        req.user.id,
        post.user_id
      )
    ) {
      return res.status(403).json({
        message:
          'You cannot interact with this post.'
      });
    }

    // Check if already liked
    const existingLike = await prisma.like.findUnique({
      where: {
        user_id_post_id: {
          user_id: req.user.id,
          post_id: postId
        }
      }
    });

    if (existingLike) {
      // Unlike
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      res.json({ liked: false });
    } else {
      // Like
      await prisma.like.create({
        data: {
          user_id: req.user.id,
          post_id: postId
        }
      });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error toggling like' });
  }
});

// @route   GET /api/posts/:id/comments
// @desc    Get comments for a post
router.get('/:id/comments', async (req, res) => {
  try {
    const postId = parseInt(req.params.id, 10);

    if (Number.isNaN(postId)) {
      return res.status(400).json({
        message: 'Invalid ID'
      });
    }

    const cursor = req.query.cursor
      ? parseInt(req.query.cursor, 10)
      : null;

    const take = Math.min(
      Math.max(
        parseInt(req.query.limit, 10) || 20,
        1
      ),
      50
    );

    const query = {
      where: {
        post_id: postId
      },
      orderBy: {
        id: 'asc'
      },
      take,
      include: {
        user: {
          select: {
            id: true,
            username: true
          }
        }
      }
    };

    if (cursor && !Number.isNaN(cursor)) {
      query.cursor = {
        id: cursor
      };
      query.skip = 1;
    }

    const comments =
      await prisma.comment.findMany(query);
    
    const formattedComments =
      comments.map(comment => ({
        ...comment,
        canDelete:
          comment.user_id === req.user.id
      }));

    const nextCursor =
      comments.length === take
        ? comments[comments.length - 1].id
        : null;

    res.json({
      comments: formattedComments,
      nextCursor
    });

  } catch (error) {
    console.error(
      'Error fetching comments:',
      error
    );

    res.status(500).json({
      message: 'Server error fetching comments'
    });
  }
});

// @route   DELETE /api/posts/:postId/comment/:commentId
// @desc    Delete a comment owned by the authenticated user
router.delete(
  '/:postId/comment/:commentId',
  socialLimiter,
  async (req, res) => {
    try {
      const postId =
        parseInt(req.params.postId, 10);

      const commentId =
        parseInt(req.params.commentId, 10);

      if (
        Number.isNaN(postId) ||
        Number.isNaN(commentId)
      ) {
        return res.status(400).json({
          message: 'Invalid ID'
        });
      }

      const comment =
        await prisma.comment.findUnique({
          where: {
            id: commentId
          },
          select: {
            id: true,
            post_id: true,
            user_id: true
          }
        });

      if (!comment) {
        return res.status(404).json({
          message: 'Comment not found'
        });
      }

      if (comment.post_id !== postId) {
        return res.status(400).json({
          message:
            'Comment does not belong to this post.'
        });
      }

      if (comment.user_id !== req.user.id) {
        return res.status(403).json({
          message:
            'You can only delete your own comments.'
        });
      }

      await prisma.comment.delete({
        where: {
          id: commentId
        }
      });

      return res.json({
        message:
          'Comment deleted successfully.'
      });
    } catch (error) {
      console.error(
        'DELETE COMMENT ERROR:',
        error
      );

      return res.status(500).json({
        message:
          'Server error deleting comment'
      });
    }
  }
);

// @route   POST /api/posts/:id/comment
// @desc    Add a comment to a post
router.post(
  '/:id/comment',
  socialLimiter,
  async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    if (isNaN(postId)) return res.status(400).json({ message: 'Invalid ID' });

    const validation =
      validateContent(
        req.body.content,
        MAX_COMMENT_LENGTH,
        'Comment content'
      );
    
    if (!validation.valid) {
      return res.status(400).json({
        message: validation.message
      });
    }
    
    const normalizedContent =
      validation.content;
    
    if (
      await hasRecentDuplicateComment(
        req.user.id,
        normalizedContent
      )
    ) {
      return res.status(409).json({
        message:
          'You already posted this comment recently.'
      });
    }
    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ message: 'Post not found' });
    
    if (
      await isBlocked(
        req.user.id,
        post.user_id
      )
    ) {
      return res.status(403).json({
        message:
          'You cannot comment on this post.'
      });
    }
    
    const newComment = await prisma.comment.create({
      data: {
        content: normalizedContent,
        user_id: req.user.id,
        post_id: postId
      },
      include: {
        user: { select: { id: true, username: true } }
      }
    });

    res.status(201).json(newComment);
  } catch (error) {
    console.error(
      'CREATE COMMENT ERROR:',
      {
        name: error?.name,
        message: error?.message,
        code: error?.code,
        meta: error?.meta,
        stack: error?.stack
      }
    );

    res.status(500).json({
      message: 'Server error creating comment'
    });
  }
});

module.exports = router;
