exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { type, text } = body;
  if (!type || !text) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing type or text' }) };
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
  }

  const prompt = type === 'detect' ? buildDetectPrompt(text) : buildHumanizePrompt(text);

  try {
    // Aapki list se exact model name: gemini-2.5-flash
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: type === 'detect' ? 0.2 : 0.9 }
        })
      }
    );

    const textData = await resp.text();

    if (!resp.ok) {
      console.error('Google API Error:', textData);
      return { statusCode: 500, body: JSON.stringify({ error: `Google API Error: ${textData}` }) };
    }

    const data = JSON.parse(textData);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!raw) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Empty AI response' }) };
    }

    if (type === 'detect') {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      try {
        const parsed = JSON.parse(cleaned);
        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
      } catch {
        return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }
    } else {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: raw }) };
    }
  } catch (err) {
    console.error('Function Error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: `Internal error: ${err.message}` }) };
  }
};

function buildDetectPrompt(text) {
  return `You are an expert AI text detector. Analyze the following text and determine if it was written by AI or by a human.
TEXT TO ANALYZE:
"""
${text}
"""
Respond ONLY with valid JSON:
{
  "ai_probability": <number 0-100>,
  "verdict": "<likely_ai | likely_human | mixed>",
  "reasoning": "<2-3 sentences>",
  "signals": ["<signal 1>", "<signal 2>"]
}`;
}

function buildHumanizePrompt(text) {
  return `You are an expert human writer. Rewrite the following AI-generated text so it sounds completely natural and human-written.
Rules:
- Keep the meaning intact. Vary sentence length. Remove AI-signature phrases.
- Return ONLY the rewritten text.
TEXT TO HUMANIZE:
"""
${text}
"""`;
}
