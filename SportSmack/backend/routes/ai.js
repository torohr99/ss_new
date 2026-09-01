const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const entityDb = require('../services/entityDb');
const sportsApi = require('../services/sportsApi');

// Build a highly constrained sports meme prompt.
function buildMemePrompt(userInput, entities, gameContext = null) {
  const prompt = String(userInput || '').trim();

  const entityText = entities.length
    ? entities.map(entity => {
        const parts = [
          `${entity.type}: ${entity.name}`
        ];

        if (entity.team) {
          parts.push(`team: ${entity.team}`);
        }

        if (entity.sport) {
          parts.push(`sport: ${entity.sport}`);
        }

        return parts.join(', ');
      }).join('\n')
    : 'No verified sports entity was identified.';

  const contextText = gameContext
    ? `
GAME CONTEXT:
League: ${gameContext.league || 'unknown'}
Game: ${gameContext.gameId || 'unknown'}
Home Team: ${gameContext.homeTeam || 'unknown'}
Away Team: ${gameContext.awayTeam || 'unknown'}
Status: ${gameContext.status || 'unknown'}
`
    : '';

  return `
Create a sports meme image based on the user's exact idea.

USER IDEA:
${prompt}

VERIFIED SPORTS ENTITIES:
${entityText}

${contextText}

ENTITY ACCURACY RULES:
- Use the verified player/team identities when provided.
- Do NOT substitute another athlete.
- Do NOT invent a different team.
- Do NOT combine two unrelated athletes.
- If a player is identified, depict that specific player rather than a generic athlete.
- If a team is identified, use that team's actual colors, uniforms and visual identity.
- If the prompt describes a game situation, visually depict that situation.
- Preserve the emotional meaning of the user's request.

COMPOSITION:
- One clear central sports subject.
- Strong facial expression or body language when appropriate.
- Authentic professional sports photography appearance.
- Correct sport-specific equipment.
- Correct uniforms for identified teams.
- Dynamic but understandable composition.
- Leave appropriate negative space for meme text.
- No random unrelated people.
- No random logos from other teams.
- No extra limbs, duplicated players or distorted equipment.

STYLE:
photorealistic professional sports photography,
high detail,
realistic anatomy,
realistic stadium lighting,
sharp subject,
natural depth of field,
dramatic but believable,
meme-worthy,
800x500 landscape composition.

Do not render written meme text inside the image.
The frontend will add the meme text.
`.trim();
}

// @route POST /api/ai/meme
router.post('/meme', authMiddleware, async (req, res) => {
  try {
    const {
      prompt,
      league,
      gameId,
      gameContext
    } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        message: 'Prompt is required'
      });
    }

    const entities =
      await entityDb.identifyEntities(prompt);

    const basePrompt =
      buildMemePrompt(
        prompt,
        entities,
        gameContext
      );

    const seeds = [
      Math.floor(Math.random() * 9000000) + 1000000,
      Math.floor(Math.random() * 9000000) + 1000000,
      Math.floor(Math.random() * 9000000) + 1000000
    ];

    const variants = [
      `${basePrompt}
Variant: classic sports photograph, tight reaction shot.`,

      `${basePrompt}
Variant: dramatic sideline photograph, wider environmental composition.`,

      `${basePrompt}
Variant: exaggerated comedic sports moment while remaining photorealistic.`
    ];

    const makeUrl = (promptText, seed) => {
      return (
        'https://image.pollinations.ai/prompt/' +
        encodeURIComponent(promptText) +
        `?width=800&height=500&nologo=true&seed=${seed}&model=flux`
      );
    };

    const candidates = variants.map(
      (variant, index) =>
        makeUrl(variant, seeds[index])
    );

    const primaryEntity = entities[0] || null;

    res.json({
      type: primaryEntity ? primaryEntity.type : 'generic',
      sourceImage: primaryEntity?.image || null,

      entityName:
        primaryEntity?.name || null,

      entities,

      prompt,
      league: league || null,
      gameId: gameId || null,

      candidates
    });

  } catch (error) {
    console.error(
      'Error generating AI meme:',
      error.message
    );

    res.status(500).json({
      message: 'Server error generating meme'
    });
  }
});

module.exports = router;
