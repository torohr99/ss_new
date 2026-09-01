const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const entityDb = require('../services/entityDb');

// Helper to build a detailed, interpretable meme prompt
function buildMemePrompt(userInput, entityContext, gameContext) {
  const base = String(userInput || '').trim();

  const entityDescription = entityContext
    ? [
        `PRIMARY SPORTS ENTITY: ${entityContext.name || 'Unknown'}`,
        entityContext.team ? `TEAM: ${entityContext.team}` : '',
        entityContext.sport ? `SPORT: ${entityContext.sport}` : '',
        entityContext.type ? `ENTITY TYPE: ${entityContext.type}` : ''
      ].filter(Boolean).join('\n')
    : 'PRIMARY SPORTS ENTITY: None identified';

  const gameDescription = gameContext
    ? [
        `CURRENT GAME: ${gameContext.awayTeam || 'Away Team'} vs ${gameContext.homeTeam || 'Home Team'}`,
        gameContext.score
          ? `CURRENT SCORE: ${gameContext.score}`
          : '',
        gameContext.status
          ? `GAME STATUS: ${gameContext.status}`
          : '',
        gameContext.situation
          ? `CURRENT SITUATION: ${gameContext.situation}`
          : ''
      ].filter(Boolean).join('\n')
    : 'CURRENT GAME: No game context supplied';

  return `
Create a sports meme image based on the user's exact idea below.

USER'S MEME IDEA:
"${base}"

${entityDescription}

${gameDescription}

IMPORTANT ACCURACY RULES:
- Preserve the exact athlete, team, sport, action, and situation requested by the user.
- Do not substitute a different athlete or team.
- If a real athlete is identified, make the person visually resemble that athlete.
- If a team is identified, use that team's actual colors, uniform style, helmet/cap, and visual identity.
- If the user describes a specific game situation, reproduce that situation rather than creating a generic sports scene.
- Do not add unrelated players, teams, sports, equipment, or locations.
- The image should communicate the joke visually even without text.
- Leave appropriate negative space for meme text.
- Do not render captions, speech bubbles, watermarks, logos, or written words inside the image.
- Use realistic sports photography unless the user's request explicitly asks for another visual style.
- Make the composition immediately understandable as a meme.

VISUAL REQUIREMENTS:
- Accurate anatomy
- Correct sport-specific equipment
- Correct number of players for the described scene
- Correct team colors
- Realistic stadium/environment when applicable
- Strong facial expression when the joke depends on emotion
- Dynamic action when the joke depends on action
- Cinematic but believable lighting
- High detail
- 4:5 or 16:9 meme-friendly composition
`.trim();
}

// @route   POST /api/ai/meme
// @desc    Generate 3 meme image candidates from a user prompt
router.post('/meme', authMiddleware, async (req, res) => {
  try {
    const {
      prompt,
      gameContext = null
    } = req.body;

    if (!prompt || !String(prompt).trim()) {
      return res.status(400).json({
        message: 'Prompt is required'
      });
    }

    const cleanPrompt = String(prompt).trim();

    // Identify the athlete/team in the user's request.
    const entity = await entityDb.identifyEntity(cleanPrompt);

    const basePrompt = buildMemePrompt(
      cleanPrompt,
      entity,
      gameContext
    );

    // Three genuinely different compositions.
    const prompt1 = `
${basePrompt}

COMPOSITION:
Classic sports meme photograph.
The identified subject is the unmistakable focal point.
Medium-wide shot with the relevant game environment visible.
Funny but believable.
`.trim();

    const prompt2 = `
${basePrompt}

COMPOSITION:
Close-up reaction meme.
Prioritize the identified athlete's facial expression and the exact emotional reaction described by the user.
Keep enough environmental context to identify the game.
`.trim();

    const prompt3 = `
${basePrompt}

COMPOSITION:
Dramatic sports-photography meme.
Wide cinematic shot showing the exact action/situation requested.
Use exaggerated but believable body language.
Make the joke visually obvious.
`.trim();

    const makeUrl = (promptText) => {
      const seed =
        Math.floor(Math.random() * 9000000) + 1000000;

      return (
        `https://image.pollinations.ai/prompt/` +
        `${encodeURIComponent(promptText)}` +
        `?width=1024` +
        `&height=768` +
        `&nologo=true` +
        `&seed=${seed}` +
        `&model=flux`
      );
    };

    const candidates = [
      makeUrl(prompt1),
      makeUrl(prompt2),
      makeUrl(prompt3)
    ];

    res.json({
      type: entity ? 'entity' : 'generic',

      entity: entity
        ? {
            type: entity.type,
            id: entity.id,
            name: entity.name,
            team: entity.team || null,
            sport: entity.sport || null,
            image: entity.image || null
          }
        : null,

      candidates
    });

  } catch (error) {
    console.error(
      'Error generating AI meme:',
      error
    );

    res.status(500).json({
      message: 'Server error generating meme'
    });
  }
});

module.exports = router;
