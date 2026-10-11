// Portfolio chatbot using Google Gemini.
// Needs GEMINI_API_KEY in Netlify > Project configuration > Environment variables.
// Optional GEMINI_MODEL to change the model without editing code (default below).
// Check setup: open https://kigan-portfolio.netlify.app/.netlify/functions/chat in a browser.

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
};
const reply = (statusCode, data) => ({
  statusCode,
  headers: { ...CORS, 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod === 'GET') {
    return reply(200, { ok: true, keySet: Boolean(process.env.GEMINI_API_KEY), model: MODEL });
  }
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!process.env.GEMINI_API_KEY) return reply(500, { error: 'GEMINI_API_KEY is not set in Netlify' });

  try {
    const { messages = [], system = '' } = JSON.parse(event.body || '{}');
    const contents = messages.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m.content || '') }]
    }));
    if (contents.length === 0) return reply(400, { error: 'No messages sent' });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: String(system).slice(0, 8000) }] },
          contents,
          generationConfig: { maxOutputTokens: 600 }
        })
      }
    );
    const data = await res.json();
    const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();

    if (!res.ok || !text) {
      const why = data.error?.message || data.promptFeedback?.blockReason || 'Empty reply from Gemini';
      console.error('Gemini error', res.status, why);
      return reply(502, { error: why });
    }
    return reply(200, { content: [{ text }] });
  } catch (err) {
    console.error('Chat function error', err);
    return reply(500, { error: err.message });
  }
};
