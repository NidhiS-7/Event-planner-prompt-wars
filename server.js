'use strict';
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { validate, buildPrompt, shapePlan } = require('./src/planner');

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 100;

function createApp({ generate = require('./src/gemini').generate, now = () => new Date() } = {}) {
  const app = express();
  const cache = new Map();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"],
    } },
  }));
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));

  app.post('/api/plan', rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a minute and try again.' } }), async (req, res) => {
    const { errors, value } = validate(req.body, now());
    if (errors.length) return res.status(400).json({ error: errors.join(' '), errors });
    const key = JSON.stringify(value);
    const hit = cache.get(key);
    if (!req.body.fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return res.json({ ...hit.plan, cached: true });
    try {
      const plan = shapePlan(await generate(buildPrompt(value)), value, now());
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
      cache.set(key, { at: Date.now(), plan });
      return res.json({ ...plan, cached: false });
    } catch (err) {
      console.error('plan generation failed:', err.message);
      const status = err.status === 503 ? 503 : 502;
      return res.status(status).json({ error: status === 503 ? 'The AI service is not configured.' : 'Could not generate a plan right now. Please try again.' });
    }
  });

  app.use((err, _req, res, _next) => {
    const status = err.status && err.status < 500 ? err.status : 500;
    res.status(status).json({ error: status === 500 ? 'Unexpected error.' : 'Invalid request.' });
  });
  return app;
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createApp().listen(port, () => console.log(`Event planner running on :${port}`));
}
module.exports = { createApp };
