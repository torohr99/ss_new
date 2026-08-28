const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const entityDb = require('../services/entityDb');

// Helper to build a detailed, interpretable meme prompt
function buildMemePrompt(userInput, entityContext) {
  const base = userInput.trim();
  
  // Detect tone/style signals in the prompt
  const isReaction = /reaction|reacting|watching|when|face when|pov/i.test(base);
  const isAction = /running|jumping|throwing|hitting|catching|celebrating|crying|angry|shocked/i.test(base);
  
  let styleGuide = 'photorealistic, highly detailed, meme-worthy composition, natural lighting';
  
  if (isReaction) {
    styleGuide += ', extreme facial expression, close-up shot';
  } else if (isAction) {
    styleGuide += ', dynamic action shot, motion blur, sports photography';
  }
  
  if (entityContext) {
    const whoDesc = `${entityContext.name}${entityContext.team ? `, ${entityContext.team}` : ''}${entityContext.sport ? ` ${entityContext.sport} player` : ''}`;
    return `${whoDesc} - ${base}, ${styleGuide}, sharp focus, cinematic quality, 4K resolution`;
  }
  
  return `${base}, ${styleGuide}, sharp focus, cinematic quality, 4K resolution`;
}

// @route   POST /api/ai/meme
// @desc    Generate 3 meme image candidates from a user prompt
router.post('/meme', authMiddleware, async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ message: 'Prompt is required' });
    }

    // Analyze prompt to extract known sports entities (athletes, teams)
    const entity = await entityDb.identifyEntity(prompt);

    const candidates = [];
    let responseType = 'generic';
    let sourceImage = null;

    const seed1 = Math.floor(Math.random() * 9000000) + 1000000;
    const seed2 = Math.floor(Math.random() * 9000000) + 1000000;
    const seed3 = Math.floor(Math.random() * 9000000) + 1000000;
    
    const basePrompt = buildMemePrompt(prompt, entity);
    
    // 3 stylistic variants so all candidates are always AI images (no broken entity photo candidate)
    const prompt1 = `${basePrompt}, photorealistic photograph`;
    const prompt2 = `${basePrompt}, dramatic angle, vivid colors, editorial photography`;
    const prompt3 = `${basePrompt}, bold composition, high contrast, internet meme aesthetic, funny`;

    const makeUrl = (p, seed) => {
      // model=flux gives the highest quality, most prompt-accurate results
      return `https://image.pollinations.ai/prompt/${encodeURIComponent(p)}?width=800&height=500&nologo=true&seed=${seed}&model=flux`;
    };

    candidates.push(makeUrl(prompt1, seed1));
    candidates.push(makeUrl(prompt2, seed2));
    candidates.push(makeUrl(prompt3, seed3));

    if (entity && entity.image) {
      responseType = 'entity';
      sourceImage = entity.image;
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
