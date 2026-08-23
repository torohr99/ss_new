const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const entityDb = require('../services/entityDb');

// @route   POST /api/ai/meme
// @desc    Generate a meme image URL by enriching the prompt for maximum accuracy
router.post('/meme', authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    // 1. Analyze prompt to extract entities (athletes, teams)
    const entity = await entityDb.identifyEntity(prompt);

    const candidates = [];
    let responseType = 'generic';
    let sourceImage = null;

    if (entity && entity.image) {
      responseType = 'entity';
      sourceImage = entity.image;
      // Provide the official source image as the primary candidate for "inpainting/editing" in the frontend
      candidates.push(entity.image);
      
      // Also generate an AI variation using the entity's exact details
      const enrichedPrompt = `Highly detailed photograph of ${entity.name}, ${entity.team ? entity.team : ''} ${entity.sport} player, ${prompt.replace(new RegExp(entity.name, 'gi'), '')}, photorealistic, exact likeness, 8k resolution, meme format`;
      candidates.push(`https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=800&height=500&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`);
      candidates.push(`https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=800&height=500&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`);
    } else {
      // Generic prompt
      const enrichedPrompt = `Highly detailed photograph of ${prompt.trim()}, masterpiece, photorealistic, 8k resolution, meme format`;
      candidates.push(`https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=800&height=500&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`);
      candidates.push(`https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=800&height=500&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`);
      candidates.push(`https://image.pollinations.ai/prompt/${encodeURIComponent(enrichedPrompt)}?width=800&height=500&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`);
    }

    res.json({ 
      type: responseType,
      sourceImage,
      entityName: entity ? entity.name : null,
      candidates 
    });
  } catch (error) {
    console.error('Error generating AI meme URL:', error.message);
    res.status(500).json({ message: 'Server error generating meme' });
  }
});

module.exports = router;
