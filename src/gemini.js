'use strict';
// Thin Google AI Studio (Gemini) client. The API key never leaves the server.
class UpstreamError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

async function generate(prompt, { fetchImpl = fetch } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new UpstreamError('AI service is not configured.', 503);
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.8 },
    }),
    signal: AbortSignal.timeout(45000),
  });
  if (!res.ok) throw new UpstreamError(`Gemini request failed (${res.status})`);
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '';
  try { return JSON.parse(text.replace(/^```json|```$/g, '').trim()); }
  catch { throw new UpstreamError('Gemini returned invalid JSON'); }
}

module.exports = { generate, UpstreamError };
