# Gather — AI Celebration & Event Planner

Challenge 5: a GenAI planning assistant for **weddings, birthdays and community events**. Enter the event details and
**Google Gemini** returns a budget breakdown, a dated timeline, a vendor checklist and personalised ideas.

## How Gen AI is used
`src/gemini.js` calls the Gemini API (Google AI Studio key) in JSON mode. `buildPrompt` fills the prompt with the user's
type, date, guests, budget, city and preferences, so every plan is different. The server then **validates and normalises**
the AI output (`shapePlan`): budget amounts are recomputed to sum exactly to the user's budget and timeline items get real
calendar dates counted back from the event date.

## Run locally
```bash
npm install
cp .env.example .env      # add GEMINI_API_KEY (https://aistudio.google.com/apikey)
export $(grep -v '^#' .env | xargs) && npm start   # http://localhost:3000
npm test
```

## Deploy (Render, free tier)
New Web Service → connect this repo → Build `npm install` → Start `npm start` → add env var `GEMINI_API_KEY`.
A `Dockerfile` is included for Cloud Run / any container host.

## Design choices mapped to the judging criteria
| Criterion | What was done |
|---|---|
| Code quality | Pure, separately tested logic (`src/planner.js`); thin server; no framework on the client; ESLint-clean style |
| Security | Key only on server; Helmet + strict CSP (no inline scripts); rate limit (10/min/IP); 10 KB body cap; input validation and sanitising; prompt fences user text as data; AI output rendered with `textContent` (no XSS); generic error messages |
| Efficiency | 3 tiny dependencies; no client bundle; in-memory TTL cache; static asset caching; 45 s upstream timeout |
| Testing | 14 `node:test` unit and API tests (validation, budget maths, dates, caching, errors, headers); AI is mocked so tests are offline |
| Accessibility | Labelled fields, skip link, `role="alert"` errors, `aria-live` status, focus moves to results, visible focus rings, table headers with scope, high contrast, reduced motion, print stylesheet, keyboard-only use |
| Problem alignment | Wedding, birthday and community types; budgets, timelines, vendor checklists, personalised ideas; checklists persist in the browser |
