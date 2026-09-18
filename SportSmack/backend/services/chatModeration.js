const axios = require('axios');
const prisma = require('../lib/prisma');

const GEMINI_MODEL =
  process.env.GEMINI_MODEL ||
  'gemini-2.5-flash';

async function classifyMessage(
  content,
  reportedReason
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY is not configured'
    );
  }

  const prompt = `
You are the automated content-moderation system
for a sports discussion website.

Evaluate the following user-generated sports chat
message for violations of the site's chat conduct rules.

A violation includes:
- hate speech
- slurs
- attacks based on protected characteristics
- targeted harassment
- threats
- severe abusive/derogatory language
- sexually explicit abusive language
- violent threats
- clearly abusive personal attacks

Ordinary sports trash talk, disagreement,
competitive banter, profanity that is not directed
as abusive conduct, or criticism of a team/player
should NOT automatically be considered a violation.

Reported reason:
${String(reportedReason || 'OTHER')}

Message:
${JSON.stringify(String(content || ''))}

Return ONLY JSON:

{
  "violation": true,
  "category": "HATE|HARASSMENT|THREATS|SEXUAL_CONTENT|VIOLENCE|OTHER",
  "confidence": 0.0,
  "reason": "brief explanation"
}
`.trim();

  const response =
    await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 200,
          responseMimeType:
            'application/json'
        }
      },
      {
        timeout: 15000
      }
    );

  const raw =
    response.data?.candidates?.[0]
      ?.content?.parts?.[0]?.text;

  if (!raw) {
    throw new Error(
      'Empty moderation response'
    );
  }

  const result =
    JSON.parse(
      raw
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim()
    );

  return {
    violation:
      result.violation === true,
    category:
      String(
        result.category || 'OTHER'
      ),
    confidence:
      Number(result.confidence) || 0,
    reason:
      String(
        result.reason || ''
      ).slice(0, 500)
  };
}

async function processGameMessageReport(
  report
) {
  const messageId =
    Number(report.targetId);

  if (!Number.isInteger(messageId)) {
    return;
  }

  const message =
    await prisma.gameMessage.findUnique({
      where: {
        id: messageId
      }
    });

  if (!message) {
    await prisma.report.update({
      where: {
        id: report.id
      },
      data: {
        status: 'DISMISSED',
        resolvedAt: new Date()
      }
    });

    return;
  }

  const result =
    await classifyMessage(
      message.content,
      report.reason
    );

  const isViolation =
    result.violation &&
    result.confidence >= 0.85;

  await prisma.$transaction(
    async tx => {
      if (isViolation) {
        const discipline =
          await tx.gameChatDiscipline.upsert({
            where: {
              userId_league_gameId: {
                userId:
                  message.userId,
                league:
                  message.league,
                gameId:
                  message.gameId
              }
            },
            update: {},
            create: {
              userId:
                message.userId,
              league:
                message.league,
              gameId:
                message.gameId
            }
          });

        const offenseNumber =
          discipline.yellowCards +
          discipline.redCards +
          1;

        if (offenseNumber === 1) {
          await tx.gameChatDiscipline.update({
            where: {
              id: discipline.id
            },
            data: {
              yellowCards: {
                increment: 1
              }
            }
          });
        } else {
          await tx.gameChatDiscipline.update({
            where: {
              id: discipline.id
            },
            data: {
              redCards: {
                increment: 1
              },
              banned: true
            }
          });
        }

        await tx.gameMessage.update({
          where: {
            id: message.id
          },
          data: {
            content:
              '[MODERATED] This message was removed for violating the chat conduct rules.'
          }
        });
      }

      await tx.report.updateMany({
        where: {
          targetType:
            'GAME_MESSAGE',
          targetId:
            String(message.id),
          status:
            'PENDING'
        },
        data: {
          status:
            isViolation
              ? 'REVIEWED'
              : 'DISMISSED',
          resolvedAt:
            new Date()
        }
      });
    }
  );

  return {
    messageId,
    violation: isViolation,
    category:
      result.category,
    confidence:
      result.confidence
  };
}

async function processPendingChatReports(
  limit = 25
) {
  const reports =
    await prisma.report.findMany({
      where: {
        targetType:
          'GAME_MESSAGE',
        status:
          'PENDING'
      },
      orderBy: {
        createdAt: 'asc'
      },
      take: limit
    });

  const results = [];

  for (const report of reports) {
    try {
      results.push(
        await processGameMessageReport(
          report
        )
      );
    } catch (error) {
      console.error(
        `Chat moderation failed for report ${report.id}:`,
        error.message
      );
    }
  }

  return results;
}

module.exports = {
  processPendingChatReports
};
