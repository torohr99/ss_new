const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimits');
const prisma = require('../lib/prisma');

router.use(authMiddleware);

const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function signPayload(payload, secret) {
  const encoded = base64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', secret)
    .update(encoded)
    .digest('base64url');

  return encoded + '.' + signature;
}

// @route POST /api/media/upload-token
// Issues a short-lived, single-object upload authorization for the Cloudflare Worker.
router.post('/upload-token', writeLimiter, async (req, res) => {
  try {
    const { purpose, contentType } = req.body || {};

    if (!['profile', 'post'].includes(purpose)) {
      return res.status(400).json({ message: 'Purpose must be profile or post.' });
    }

    if (!Object.prototype.hasOwnProperty.call(ALLOWED_TYPES, contentType)) {
      return res.status(415).json({ message: 'Only JPEG, PNG, and WebP images are supported.' });
    }

    const workerUrl = (process.env.MEDIA_WORKER_URL || '').replace(/\/+$/, '');
    const secret = process.env.MEDIA_UPLOAD_SECRET;

    if (!workerUrl || !secret || secret.length < 32) {
      return res.status(503).json({ message: 'Media uploads are not configured.' });
    }

    const key = [
      String(req.user.id),
      crypto.randomUUID() + '.' + ALLOWED_TYPES[contentType]
    ].join('/');

    const payload = {
      userId: Number(req.user.id),
      key,
      purpose,
      contentType,
      expiresAt: Date.now() + 5 * 60 * 1000
    };

    const token = signPayload(payload, secret);

    return res.json({
      uploadUrl: workerUrl + '/upload/' + key,
      imageUrl: workerUrl + '/' + key,
      token,
      expiresIn: 300
    });
  } catch (error) {
    console.error('Media upload authorization failed:', error);
    return res.status(500).json({ message: 'Unable to authorize image upload.' });
  }
});

// @route GET /api/media/post/:postId
// Streams a post image only after checking the viewer's current access.
router.get('/post/:postId', async (req, res) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const postId = Number.parseInt(req.params.postId, 10);
    if (!Number.isSafeInteger(postId) || postId < 1) {
      return res.status(400).json({ message: 'Invalid post ID.' });
    }

    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, user_id: true, image_url: true }
    });

    if (!post || !post.image_url) {
      return res.status(404).json({ message: 'Image not found.' });
    }

    const { canViewPost } = require('../services/postPrivacy');
    if (!(await canViewPost(req.user.id, post))) {
      return res.status(404).json({ message: 'Image not found.' });
    }

    const workerUrl = (process.env.MEDIA_WORKER_URL || '').replace(/[/]+$/, '');
    const secret = process.env.MEDIA_UPLOAD_SECRET;
    if (!workerUrl || !secret || secret.length < 32) {
      return res.status(503).json({ message: 'Media delivery is not configured.' });
    }

    let storedUrl;
    try {
      storedUrl = new URL(post.image_url);
    } catch {
      return res.status(404).json({ message: 'Image not found.' });
    }

    if (storedUrl.origin !== new URL(workerUrl).origin) {
      return res.status(404).json({ message: 'Image not found.' });
    }

    const match = /^[/]([1-9][0-9]*)[/]([0-9a-f-]{36}[.](?:jpg|png|webp))$/.exec(storedUrl.pathname);
    if (!match || Number(match[1]) !== Number(post.user_id)) {
      return res.status(404).json({ message: 'Image not found.' });
    }

    const key = match[1] + '/' + match[2];
    const token = signPayload({
      userId: Number(post.user_id),
      key,
      purpose: 'post',
      action: 'read',
      expiresAt: Date.now() + 30 * 1000
    }, secret);

    const imageResponse = await fetch(
      workerUrl + '/' + key + '?variant=post',
      {
        method: 'GET',
        headers: { Authorization: 'Bearer ' + token },
        signal: AbortSignal.timeout(10000)
      }
    );


    if (!imageResponse.ok) {
      return res.status(imageResponse.status === 404 ? 404 : 502).end();
    }

    const contentType = imageResponse.headers.get('content-type');
    if (contentType !== 'image/webp') {
      return res.status(502).end();
    }

    res.setHeader('Content-Type', 'image/webp');
    const bytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
      return res.status(502).end();
    }

    return res.status(200).send(bytes);
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      return res.status(504).end();
    }
    console.error('Protected post image delivery failed:', {
      name: error?.name,
      message: error?.message
    });
    return res.status(500).end();
  }
});

// @route DELETE /api/media/image
// Deletes only an image owned by the authenticated user.
router.delete('/image', writeLimiter, async (req, res) => {
  try {
    const { imageUrl } = req.body || {};
    const workerUrl = (process.env.MEDIA_WORKER_URL || '').replace(/\/+$/, '');
    const secret = process.env.MEDIA_UPLOAD_SECRET;

    if (!workerUrl || !secret || secret.length < 32) {
      return res.status(503).json({ message: 'Media deletion is not configured.' });
    }

    let parsed;
    try {
      parsed = new URL(imageUrl);
    } catch {
      return res.status(400).json({ message: 'Invalid image URL.' });
    }

    if (parsed.origin !== new URL(workerUrl).origin) {
      return res.status(400).json({ message: 'Image is not stored in SportSmack media.' });
    }

    const match = /^\/([1-9][0-9]*)\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/.exec(parsed.pathname);
    if (!match || Number(match[1]) !== Number(req.user.id)) {
      return res.status(403).json({ message: 'You cannot delete another user’s image.' });
    }

    const [postReference, profileReference] = await Promise.all([
      prisma.post.findFirst({
        where: { image_url: imageUrl },
        select: { id: true }
      }),
      prisma.user.findFirst({
        where: { profile_pic: imageUrl },
        select: { id: true }
      })
    ]);

    if (postReference || profileReference) {
      return res.json({
        success: true,
        skipped: true,
        message: 'Image is still referenced and was retained.'
      });
    }

    const key = match[1] + '/' + match[2];
    const token = signPayload({
      userId: Number(req.user.id),
      key,
      action: 'delete',
      expiresAt: Date.now() + 60 * 1000
    }, secret);

    const response = await fetch(workerUrl + '/delete/' + key, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return res.status(response.status).json({
        message: body.message || 'Unable to delete image.'
      });
    }

    return res.json({ success: true });
  } catch (error) {
    console.error('Media deletion failed:', error);
    return res.status(500).json({ message: 'Unable to delete image.' });
  }
});

module.exports = router;
