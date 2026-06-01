<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

# AIYO_new Agent Guide

## Before Starting

Before making changes, debugging, or running fixes, first check whether there is an existing project-specific skill, rule, guide, script, or documentation that should be used.

Check these locations when relevant:

* `AGENTS.md`
* `.cursor/rules/`
* `.codex/`
* `skills/`
* `docs/`
* `scripts/`
* `package.json` scripts
* existing tests related to the task
* `node_modules/next/dist/docs/` when editing Next.js behavior

If a suitable skill, guide, or script exists, follow it before inventing a new workflow.

Do not skip existing project workflows, validation scripts, documented conventions, or test utilities unless there is a clear reason. If no suitable skill exists, briefly mention that none was found and continue with the best available approach.

## Project Goal

AIYO_new is an AI travel-planning system. The planner must generate realistic, map-ready, editable itineraries based on user preferences, verified places, time flow, meals, transportation, and optional web research.

The main app lives in this `aiyo/` directory. Run project commands from this directory unless the task clearly requires working from the repository root.

## Core Rules

* Do not only change tests when the issue is in production logic.
* Keep itinerary generation grounded in verified POI, verified research, or explicit user input.
* Do not invent fake place titles such as `代表性景點`, `文化體驗`, `市區自由探索`, `河岸散策`, `文創街區漫步`, `夜景收尾`, or `在地市場`.
* If research data is insufficient, return fewer safe items and add a clear warning.
* Return `question_card` only when required trip basics are missing, such as destination or duration.
* Do not skip preference reuse. If reusable preferences exist, ask whether to apply them before generating a full plan.
* Do not expose API keys, secrets, raw prompts, internal tool details, or private implementation notes in user-facing replies.
* Do not replace production behavior with mocks unless the task is explicitly about tests, fixtures, or local harnesses.

## Itinerary Standard

For a 3D2N trip:

* Day 1: arrival, hotel/check-in buffer, light route, dinner, nearby night activity.
* Day 2: main travel day, core attractions, lunch, dinner, shopping or night view.
* Day 3: light route, souvenirs, lunch, return buffer.

Each itinerary item should have:

* chronological time
* single searchable title
* valid type
* transport from the previous stop
* notes
* location when verified

The planner should avoid overpacked routes. A realistic itinerary is better than a dense but impractical one.

## Title Rules

Itinerary item titles must be single searchable place or venue names.

Allowed examples:

* `東京晴空塔`
* `淺草寺`
* `林聰明沙鍋魚頭`
* `國際通`
* `午餐`
* `晚餐`

Disallowed examples:

* `歷史文化體驗 熊本城`
* `熊本城周邊午餐`
* `市區自由探索`
* `夜景收尾`
* `熊本城・白川水源`
* `A/B`
* `A 與 B`

If a real restaurant is unknown, use `午餐` or `晚餐` as the title and describe the area in `notes`.

## Search Policy

* General advice does not require search.
* Opening hours, ticket prices, weather, events, transportation alerts, official notices, and “today/latest” questions require search.
* Full itinerary without dates: search POI and restaurant candidates only.
* Full itinerary with dates: additionally search weather and relevant events.
* Do not overuse web search when local context and verified POI candidates are sufficient.
* If one provider fails, continue with available data instead of failing the whole plan.

## Fallback Policy

When model generation, JSON parsing, or provider calls fail:

* Return fallback `travel_plan`, not API 502, when destination and duration are known.
* Use only verified `researchPlaceHits` or explicit user-provided places as concrete POI titles.
* If verified POIs are insufficient, produce fewer items instead of inventing fake places.
* Add a warning such as:

`目前搜尋資料不足，以下行程僅根據可驗證地點建立，建議出發前再次確認。`

* Return `question_card` only when destination, duration, or other required basics are missing or invalid.

## Performance Rules

* Avoid unnecessary web search.
* Do not run supplementary sources every time.
* Provider failures must not block the whole plan.
* Use `Promise.allSettled` where independent research calls can run in parallel.
* JSON retry at most once.
* On Ollama timeout, return fallback `travel_plan`, not API 502.
* Prefer smaller context windows unless long verified research is truly needed.
* Keep user-visible progress steps accurate: understand, research, generate, validate, complete.

## Testing Rules

Before finishing meaningful changes, run the relevant checks.

Default checks:

* `npm test`
* `npm run build`

Planner-related checks:

* `npm run test:e2e:phase7`
* `npm run test:e2e:phase8`

Live AI checks, only when live environment is available:

* `$env:E2E_LIVE_AI="1"; npm run test:e2e:live-ai:itinerary`

If a test fails, report the root cause clearly. Do not hide failures by skipping or weakening assertions unless the test is genuinely obsolete and the replacement test covers the same product behavior.

## Report Format

When done, report only:

* production files changed
* test files changed
* fallback behavior
* search behavior
* failed tests, if any
* build/typecheck result
