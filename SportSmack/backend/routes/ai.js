const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const entityDb = require('../services/entityDb');
const sportsApi = require('../services/sportsApi');

// Helper to build a detailed, interpretable meme prompt
function buildMemePrompt(
  userInput,
  entityContext,
  gameContext
) {
  const base = userInput.trim();

  const gameDescription = gameContext
    ? `
CURRENT GAME — USE AS GROUND TRUTH:
League: ${gameContext.league}

Home:
${JSON.stringify(gameContext.teams?.home || {}, null, 2)}

Away:
${JSON.stringify(gameContext.teams?.away || {}, null, 2)}

Current Status:
${JSON.stringify(gameContext.status || {}, null, 2)}

Current Situation:
${JSON.stringify(gameContext.situation || {}, null, 2)}

Recognized Players:
${JSON.stringify(gameContext.players || [], null, 2)}

Recent Plays:
${JSON.stringify(gameContext.recentPlays || [], null, 2)}
`
    : '';

  const entityDescription = entityContext
    ? `
PRIMARY IDENTIFIED ENTITY:
${JSON.stringify(entityContext, null, 2)}
`
    : '';

  return `
Create a sports meme image based on this user request:

"${base}"

${gameDescription}

${entityDescription}

ACCURACY RULES:
- The current-game data is authoritative.
- Use ONLY teams and players contained in the current-game data when they are available.
- Never invent a player.
- Never substitute a different player.
- Never substitute a different team.
- Never change the sport.
- Never invent a game situation.
- If the user describes an event, use it only if it is compatible with the supplied game data.
- Preserve the identified player's exact identity.
- Preserve the identified team's identity, colors, and visual characteristics.
- Make the scene visually obvious and humorous.
- If a real player is identified, make the person visually resemble that specific athlete rather than a generic athlete.
- Do not add random logos, jerseys, or unrelated players.

STYLE:
Photorealistic sports photography, highly detailed,
natural anatomy, realistic proportions, realistic stadium/venue,
dynamic composition, cinematic lighting, sharp focus,
professional sports photography, meme-worthy expression.

IMPORTANT:
The image should depict the specific sports situation requested,
not a generic interpretation of the sport.
`;
}

// @route   POST /api/ai/meme
// @desc    Generate 3 meme image candidates from a user prompt
router.post('/meme', authMiddleware, async (req, res) => {
  try {
    const {
      prompt,
      league,
      gameId
    } = req.body;

    if (!prompt) {
      return res.status(400).json({
        message: 'Prompt is required'
      });
    }

    if (!league || !gameId) {
      return res.status(400).json({
        message: 'League and gameId are required'
      });
    }

    /*
     * Fetch the CURRENT game directly from ESPN.
     * Never trust game context supplied by the browser.
     */
    const mapping =
      sportsApi.LEAGUE_MAP[String(league).toLowerCase()];

    if (!mapping) {
      return res.status(400).json({
        message: 'Invalid league'
      });
    }

    const summary =
      await sportsApi.getGameSummary(
        mapping.sport,
        mapping.league,
        String(gameId)
      );

    if (!summary) {
      return res.status(404).json({
        message: 'Game data unavailable'
      });
    }

    /*
     * Convert ESPN's raw response into a compact,
     * meme-specific ground-truth object.
     */
    const gameContext =
      sportsApi.buildMemeGameContext(
        summary,
        league,
        gameId
      );

    if (!gameContext) {
      return res.status(404).json({
        message: 'Current game information unavailable'
      });
    }

    /*
     * Resolve the user's entity against THIS game first.
     */
    const entity =
      await entityDb.identifyEntity(
        prompt,
        gameContext
      );

    const basePrompt =
      buildMemePrompt(
        prompt,
        entity,
        gameContext
      );

    const candidates = [];

    const seeds = [
      Math.floor(Math.random() * 9000000) + 1000000,
      Math.floor(Math.random() * 9000000) + 1000000,
      Math.floor(Math.random() * 9000000) + 1000000
    ];

    const prompts = [
      `${basePrompt}

COMPOSITION:
Wide cinematic sports photograph.
Make the identified subject clearly visible.`,

      `${basePrompt}

COMPOSITION:
Close-up reaction shot.
Emphasize the identified player's facial expression and emotion.`,

      `${basePrompt}

COMPOSITION:
Dynamic action photograph.
Show the exact game situation described by the user.`
    ];

    const makeUrl = (p, seed) => {
      return (
        `https://image.pollinations.ai/prompt/` +
        `${encodeURIComponent(p)}` +
        `?width=800` +
        `&height=500` +
        `&nologo=true` +
        `&seed=${seed}` +
        `&model=flux`
      );
    };

    prompts.forEach((p, index) => {
      candidates.push(
        makeUrl(p, seeds[index])
      );
    });

    res.json({
      type: entity ? 'entity' : 'game',
      entity: entity || null,
      entityName: entity?.name || null,
      sourceImage: entity?.image || null,
      gameContext,
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
