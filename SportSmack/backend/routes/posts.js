const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const prisma = require('../lib/prisma');
const {
  writeLimiter,
  postCreationLimiter,
  socialLimiter
} = require('../middleware/rateLimits');

const {
  MAX_POST_LENGTH,
  validateContent,
  hasRecentDuplicatePost,
  isBlocked
} = require('../middleware/moderation');
// Protect all post routes
router.use(authMiddleware);

// @route   GET /api/posts
// @desc    Get posts (global feed) ordered by newest, with cursor pagination
router.get('/', async (req, res) => {
  try {
    const cursor = req.query.cursor;
    const take = 15; // smaller chunk size for better performance
    const forum = req.query.forum;
    let whereClause = {};
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

    const posts = await prisma.post.findMany(queryParams);

    const formattedPosts = posts.map(post => ({
      ...post,
      hasLiked: post.likes.length > 0,
      likes: undefined
    }));

    // Determine the next cursor
    const nextCursor = posts.length === take ? posts[posts.length - 1].id : null;

    res.json({
      posts: formattedPosts,
      nextCursor
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error fetching posts' });
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

    const nextCursor =
      comments.length === take
        ? comments[comments.length - 1].id
        : null;

    res.json({
      comments,
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
    console.error(error);
    res.status(500).json({ message: 'Server error creating comment' });
  }
});

module.exports = router;
