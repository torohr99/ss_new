const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
  aiLimiter
} = require('../middleware/rateLimits');

const {
  aiConcurrencyLimiter
} = require('../middleware/concurrency');
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
router.post(
  '/meme',
  authMiddleware,
  aiLimiter,
  aiConcurrencyLimiter,
  async (req, res) => {
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

    let enrichedGameContext =
      gameContext || null;
    
    if (league && gameId) {
      try {
        const mapping =
          sportsApi.LEAGUE_MAP?.[
            String(league).toLowerCase()
          ];
    
        if (mapping) {
          const gameSummary =
            await sportsApi.getGameSummary(
              mapping.sport,
              mapping.league,
              gameId
            );
        
          const liveState =
            sportsApi.buildSportSpecificState(
              gameSummary,
              league
            );
        
          if (liveState) {
            enrichedGameContext = {
              ...(gameContext || {}),
              league,
              gameId,
            
              homeTeam:
                liveState.teams?.home?.name ||
                liveState.teams?.home?.displayName ||
                gameContext?.homeTeam ||
                null,
            
              awayTeam:
                liveState.teams?.away?.name ||
                liveState.teams?.away?.displayName ||
                gameContext?.awayTeam ||
                null,
            
              score:
                liveState.teams?.home?.score != null &&
                liveState.teams?.away?.score != null
                  ? `${liveState.teams.home.name} ${liveState.teams.home.score} - ${liveState.teams.away.name} ${liveState.teams.away.score}`
                  : gameContext?.score || null,
            
              teams:
                liveState.teams,
              status:
                liveState.status,
              situation:
                liveState.situation,
              sportSituation:
                liveState.sportSituation,
              leaders:
                liveState.leaders,
              recentPlays:
                liveState.plays,
              venue:
                liveState.venue,
              odds:
                liveState.odds
            };
          }
        }
      } catch (contextError) {
        console.error(
          'Could not enrich meme game context:',
          contextError.message
        );
      }
    }
    
    const basePrompt =
      buildMemePrompt(
        prompt,
        entities,
        enrichedGameContext
      );

    /*
     * Generate exactly ONE image through OpenAI's
     * dedicated image-generation API.
     *
     * Keep:
     * - authentication
     * - request rate limiting
     * - AI concurrency limiting
     * - verified entity identification
     * - ESPN game-context enrichment
     *
     * This intentionally does NOT generate multiple
     * candidates. One generation keeps cost and server
     * load bounded as SportSmack scales.
     */
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        message:
          'AI image generation is not configured.'
      });
    }
    
    const imagePrompt = `
    Create ONE photorealistic professional sports photograph
    that visually represents the user's exact request.
    
    USER REQUEST:
    ${prompt}
    
    ${basePrompt}
    
    IMAGE-GENERATION PRIORITIES:
    
    1. Follow the user's requested scenario exactly.
    2. If a verified athlete is supplied, depict that athlete.
    3. If a verified team is supplied, use that team's actual identity.
    4. Use realistic human anatomy.
    5. Use realistic hands, fingers, faces, limbs and body proportions.
    6. Use realistic sport-specific equipment.
    7. Use realistic uniforms and equipment placement.
    8. Use realistic stadium, field, court, rink or venue details.
    9. Use natural professional sports-photography lighting.
    10. Make the image look like a real photograph rather than an illustration.
    11. Make the requested comedic situation visually obvious.
    12. Do not add meme text.
    13. Do not add captions.
    14. Do not add watermarks.
    15. Do not invent unrelated athletes or teams.
    16. Do not create a collage.
    17. Do not create multiple panels.
    18. Do not make the image look like a cartoon, painting or video-game screenshot.
    
    The final image should look like a believable photograph
    captured by a professional sports photographer.
    `.trim();
    
    try {
      const imageResponse =
        await axios.post(
          'https://api.openai.com/v1/responses',
          {
            input: [
              {
                role: 'user',
                content: [
                  {
                    type: 'input_text',
                    text: imagePrompt
                  }
                ]
              }
            ],
      
            tools: [
              {
                type: 'image_generation',
      
                model:
                  process.env.OPENAI_IMAGE_MODEL ||
                  'gpt-image-2',
      
                quality: 'high',
      
                size: '1536x1024',
      
                output_format: 'jpeg',
      
                output_compression: 85,
      
                background: 'opaque'
              }
            ]
          },
          {
            headers: {
              Authorization:
                `Bearer ${process.env.OPENAI_API_KEY}`,
      
              'Content-Type':
                'application/json'
            },
      
            timeout: 120000
          }
        );
    
      const imageGeneration =
        imageResponse.data?.output?.find(
          item =>
            item.type ===
            'image_generation_call'
        );
    
      const imageBase64 =
        imageGeneration?.result;
    
      if (!imageBase64) {
        throw new Error(
          'OpenAI returned no generated image.'
        );
      }
    
      const image =
        `data:image/jpeg;base64,${imageBase64}`;
    
      const primaryEntity =
        entities[0] || null;
    
      return res.json({
        type:
          primaryEntity
            ? primaryEntity.type
            : 'generic',
    
        sourceImage:
          primaryEntity?.image ||
          null,
    
        entityName:
          primaryEntity?.name ||
          null,
    
        entities,
    
        prompt,
    
        league:
          league || null,
    
        gameId:
          gameId || null,
    
        image
      });
    
    } catch (imageError) {
      console.error(
        'OpenAI image generation failed:',
        imageError.response?.data ||
        imageError.message
      );
    
      return res.status(502).json({
        message:
          'The AI image generator could not create an image right now.'
      });
    }

    const primaryEntity = entities[0] || null;

    res.json({
      type:
        primaryEntity
          ? primaryEntity.type
          : 'generic',
    
      sourceImage:
        primaryEntity?.image ||
        null,
    
      entityName:
        primaryEntity?.name ||
        null,
    
      entities,
    
      prompt,
      league:
        league || null,
      gameId:
        gameId || null,
    
      image
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
