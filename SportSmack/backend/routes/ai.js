const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const entityDb = require('../services/entityDb');
const sportsApi = require('../services/sportsApi');

// Build a highly constrained sports meme prompt.
function buildMemePrompt(
  userInput,
  entities,
  gameContext = null
) {
  const prompt = String(userInput || '').trim();

  const verifiedEntities = Array.isArray(entities)
    ? entities
    : [];

  const entityText = verifiedEntities.length
    ? verifiedEntities
        .map((entity, index) => {
          return `
ENTITY ${index + 1}:
Type: ${entity.type || 'unknown'}
Name: ${entity.name || 'unknown'}
Team: ${entity.team || 'unknown'}
Sport: ${entity.sport || 'unknown'}
Verified image: ${entity.image || 'none'}
Confidence: ${entity.score || 0}
`;
        })
        .join('\n')
    : 'No verified sports entities were identified.';

  const contextText = gameContext
    ? `
CURRENT GAME CONTEXT:

League:
${gameContext.league || 'unknown'}

Game ID:
${gameContext.gameId || 'unknown'}

Home Team:
${gameContext.homeTeam || 'unknown'}

Away Team:
${gameContext.awayTeam || 'unknown'}

Score:
${gameContext.score || 'unknown'}

Status:
${gameContext.status || 'unknown'}

Situation:
${JSON.stringify(
  gameContext.situation || null,
  null,
  2
)}
`
    : 'No game context was supplied.';

  return `
You are generating a highly accurate sports meme image for SportSmack.

USER'S EXACT REQUEST:
${prompt}

VERIFIED SPORTS ENTITIES:
${entityText}

${contextText}

IDENTITY REQUIREMENTS:

- If the user names a specific athlete, depict THAT athlete.
- Never replace a named athlete with a generic athlete.
- If multiple athletes are named, depict the correct athletes
  interacting in the requested way.
- If a team is named, use that exact team's identity.
- Use the team's actual uniform colors and design.
- Do not invent another team's uniform.
- Do not use unrelated logos.
- Do not substitute another player with a similar-looking athlete.

GAME-SITUATION REQUIREMENTS:

- If this is a game-specific meme, reproduce the supplied
  game situation.
- Use the actual score when supplied.
- Use the actual teams.
- Use the actual period/inning/quarter when supplied.
- Use the supplied situation when available.
- Do not invent a play or statistic.

VISUAL REQUIREMENTS:

- Photorealistic professional sports photography.
- Accurate human anatomy.
- Accurate sport-specific equipment.
- Accurate uniforms.
- Correct number of players.
- Natural facial expressions and body language.
- Realistic stadium/environment appropriate to the sport.
- Clearly communicate the user's requested action.
- Make the composition visually humorous when the request
  is humorous.
- Do not create a generic "sports player" image.
- Do not add unrelated people.
- Do not add unrelated teams.
- Do not add unrelated objects.

IMPORTANT:

The image itself should visually communicate the exact event
described by the user.

Do NOT render meme text inside the image.
SportSmack will add the text separately.

Return only the image-generation prompt.
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
