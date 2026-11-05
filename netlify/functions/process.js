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
    return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured in Netlify settings' }) };
  }

  const prompt = type === 'detect' ? buildDetectPrompt(text) : buildHumanizePrompt(text);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  try {
    // Sahi aur stable model name: gemini-1.5-flash-latest
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: type === 'detect' ? 0.2 : 0.9 }
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('Gemini API Error Details:', errText);
      // Agar error aata hai, toh frontend par asli error dikhega
      return { statusCode: 500, body: JSON.stringify({ error: `Google API Error: ${errText}` }) };
    }

    const data = await resp.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

    if (!raw) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Empty AI response' }) };
    }

    if (type === 'detect') {
      const cleaned = raw.replace(/```json|```/g, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse AI response' }) };
      }
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      };
    } else {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ result: raw })
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { statusCode: 504, body: JSON.stringify({ error: 'AI response timed out. Please try again.' }) };
    }
    console.error('Function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: `Internal error: ${err.message}` }) };
  }
};

function buildDetectPrompt(text) {
  return `You are an expert AI text detector. Analyze the following text and determine if it was written by AI (like ChatGPT, Claude, Gemini) or by a human.
TEXT TO ANALYZE:
"""
${text}
"""
Respond ONLY with valid JSON in this exact format — no markdown, no extra text:
{
  "ai_probability": <number 0-100>,
  "verdict": "<likely_ai | likely_human | mixed>",
  "reasoning": "<2-3 sentences in simple English>",
  "signals": ["<signal 1>", "<signal 2>", "<signal 3>"]
}`;
}

function buildHumanizePrompt(text) {
  return `You are an expert human writer. Rewrite the following AI-generated text so it sounds completely natural and human-written.
Rules:
- Keep the original meaning and information intact
- Vary sentence length
- Remove AI-signature phrases
- Return ONLY the rewritten text, nothing else.
TEXT TO HUMANIZE:
"""
${text}
"""`;
}
