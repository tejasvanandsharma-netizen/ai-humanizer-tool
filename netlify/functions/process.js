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
    // Request timeout set kar rahe hain taaki Netlify error na de
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000); // 9 seconds (Netlify limit se pehle)

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        }),
        signal: controller.signal
      }
    );

    clearTimeout(timeoutId);
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
      const parsed = JSON.parse(cleaned);
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed) };
    } else {
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result: raw }) };
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      return { statusCode: 504, body: JSON.stringify({ error: 'Text bohot lambaa hai. Timeout ho gaya. Chhota text try karein.' }) };
    }
    return { statusCode: 500, body: JSON.stringify({ error: `Internal error: ${err.message}` }) };
  }
};

function buildDetectPrompt(text) {
  return `You are an AI text detector. Analyze text and return ONLY valid JSON: {"ai_probability": number, "verdict": "likely_ai|likely_human|mixed", "reasoning": "text", "signals": ["s1"]}. Text: """${text}"""`;
}

function buildHumanizePrompt(text) {
  return `Rewrite the following text so it sounds human. Keep meaning intact. Return ONLY the rewritten text, no extra words. Text: """${text}"""`;
}
