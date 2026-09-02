# DegreeLume Assistant — build plan

Written 2026-09-02 15:40 PDT. Deadline **2026-09-03 13:00 PDT** (Devpost, WebMCP
Challenge). This is the spec every builder on this repo works from.

## What it is

A **college counselor an AI agent can call.** The page exposes thirteen WebMCP
tools through `document.modelContext.registerTool()`. An agent in ChatGPT's
desktop browser (or Chrome with the WebMCP flag) can:

- check how any El Camino College course transfers to 17 UC/CSU campuses,
  audit a whole transcript, **compare campuses side by side** (the
  Credit-Carry report — the one question ASSIST structurally cannot answer),
  and explain any requirement row with its citation;
- read the student's **own Canvas**: current courses, grades, ungraded weight,
  what is due this week, what is overdue;
- run a **grade risk radar**: which in-progress course endangers which
  requirement, and what average on the remaining work still clears it;
- merge **everything that has to happen before a date** — UC/CSU application
  deadlines, TAG, TAU, Canvas due dates, missing prep courses, reminders;
- **update the page**: set the student's target, add reminders, complete them.

Everything is deterministic. A language model never decides an answer; it only
asks. Every answer cites the agreement or catalog with its academic year and
verification state, and anything we cannot verify says so.

## Hard rules (from the main product; non-negotiable)

1. **No fabrication.** Nothing asserts a fact the student did not give. Empty
   profile = empty answers with an honest "not set" message. Sample data is
   labelled `sample` in every citation and every summary.
2. **Verdict language**: `eligible` / `competitive` / `reach`, straight from the
   engine. Never "guaranteed", "approved", "will be admitted".
3. **Cite or say unverifiable.** Every ToolOutput carries `citations[]`; a
   transcription nobody has read carries `verification: 'unreviewed'`.
4. **Read-only against Canvas.** GET only. The token lives in the browser's
   localStorage and is forwarded per request; the Worker never stores it.
5. **Separate from the main product.** Different repo, Worker, subdomain.
   Never touch `transferpro` or degreelume.com's deploy.

## Data slice (already copied into `src/data`, verbatim from the main repo)

| File | What |
|---|---|
| `courses.ts` | El Camino catalog, 2025–26 (190-course real closure) |
| `requirements/ecc.<campus>.<major>.ts` × 48 + `ucr.*` × 4 | ASSIST agreements, ECC → 17 campuses × {business, cs, psych} |
| `calgetc.ts`, `igetc.ts`, `gePatterns.ts` | transfer GE patterns + the entry-term rule |
| `eccge.ts` | ECC local GE (engine input; unused for transfer verdicts) |
| `examCredits.ts` | AP → ECC equivalents |
| `termOfferings.ts` | which terms ECC runs each course (planner input) |
| `deadlines.ts` | UC/CSU/TAG/TAU calendar rules with sources |
| `gradeRules.ts` | C-or-better rules for the risk radar |
| `schools.ts`, `majors.ts`, `canvasInstitutions.ts` | registries |
| `meta.ts` | DATA_VERSION + provenance stamps |

Generated files keep their "GENERATED" headers; we do not hand-edit rows.
`requirements/index.ts` must be **rewritten for the slice** (the main one
imports 4,265 files). `schools.ts` may keep all 31 campuses; only the 17 with
`ready: true` have agreements, and the slice has data only for the three majors.

## Engine (already copied, verbatim): `src/engine`

`runAudit`, `buildTermPlan`, `courseCodes`, `buildUpperDivPlan`, `terms`,
`insights`, `termOfferings`, `geSelection`, `groupCourses`, `majorSwitch`,
`deadlines`, `riskRadar`, `liveRequirements`. Their tests are copied too; tests
that import `../data/degrees` / `../data/upperdiv` need a minimal stub module
(`getAssociateDegree` → null, `getAdtTemplate` → null, `getUpperDiv` → null)
or get trimmed. **Do not change engine semantics.** Adapt imports only.

`liveRequirements.ts` imports `../data/colleges` — write a minimal
`colleges.ts` with only El Camino (catalog = ECC_COURSES, localGeAreas =
ECC_GE_AREAS, the real transfer-center contact).

## Layout and ownership

```
src/
  types.ts                  copied
  engine/                   copied (Agent A adapts imports, keeps tests green)
  data/                     copied slice (Agent A writes requirements/index.ts, colleges.ts, degrees stub, upperdiv stub)
  tools/
    contract.ts             DONE — names, descriptions, schemas (do not rename tools)
    transfer.ts             Agent A — list_options, check_course_transfer, audit_coursework, compare_campuses, explain_requirement
    school.ts               Agent B — get_current_courses, get_upcoming_work, get_grade_risk, get_deadlines
    state.ts                Agent A — get_student_status, set_student_target, add_reminder, complete_reminder
    index.ts                Agent A — `runTool(name, input, via)`: validates, dispatches, records activity, returns ToolOutput | ToolError
    *.test.ts               each agent tests their own
  lib/
    store.ts                DONE — page state + persistence
    initialProfile.ts       DONE
    resolve.ts              Agent A — campus/major/course name → registry id (fuzzy, deterministic, tested)
    profile.ts              Agent A — PageState → StudentProfile; runAuditFor(target, courses) helper used by every transfer tool
    canvasClient.ts         Agent B — browser side: connect(host, token) → fetch courses+assignments via /api/canvas/proxy → CanvasSnapshot
    sampleStudent.ts        Agent B — the labelled fictional student (see below)
  webmcp/
    register.ts             Agent C — registers TOOLS with document.modelContext (fallback navigator.modelContext); exposes window.__degreelume.tools for the console; returns status
  components/               Agent C — the page
worker/
  index.js                  DONE (router)
  canvas.js                 Agent B — the proxy (allow-list, GET only, size/timeout caps, Link header passthrough)
  canvas.test.js            Agent B
```

## Tool semantics (what each returns — `data` shapes)

Every tool returns `ToolOutput` (`summary`, `data`, `citations`, `caveats`) or
`ToolError`. Summaries are plain sentences an agent can relay. Citations use the
requirement set's `meta` (sourceName/sourceUrl/catalogYear/verification) and,
for catalog facts, `CATALOG_SOURCE` from `meta.ts`.

- **list_options** → `{ college, campuses: [{id, name, shortName, system, tier: 'verified'|'machine-transcribed', majors: [...]}], majors: [{id, name}], catalogSize, dataVersion }`
- **check_course_transfer** → `{ course: {code, name, units, formerCode?}, campus, major, satisfies: [{rowId, label, required, group?: {label, count}}], geAreas: {calgetc: [...], igetc: [...]}, articulated: boolean, alsoAcceptedAt: [{campus, rows: [label]}] }`. Unknown code → ToolError `unknown_course` with the 3 nearest catalog codes as hint.
- **audit_coursework** → `{ campus, major, gePattern, verdict, impacted, gpaTarget, units: {done, inProgress, floor}, prep: {done, inProgress, missing, requiredTotal}, rows: [{id, label, status, satisfiedBy?, inProgressBy?, required, group?}], ge: [{id, label, status, have, need, courses}], needsReview: [...], estimate: {terms, finishTerm, durationLabel} | null, dataVersion }`
- **compare_campuses** → `{ major, courses, rows: [{campus, campusName, system, verdict, impacted, gpaTarget, prepDone, prepTotal, coverage, unitsApplied, unitsElective, creditsThatCount, electivesOnly, estTerms, provenance, sourceUrl, catalogYear}], sortedBy: 'coverage desc' }`. Uses `runAudit` per campus + `summarizeSwitch` from `majorSwitch.ts`.
- **explain_requirement** → `{ campus, major, matches: [{rowId, label, required, group?, options: [{code, name, units, inCatalog, calgetc, igetc}]}] }`; no match → ToolError `requirement_not_found` with 5 candidate labels.
- **get_current_courses** → `{ source, host, fetchedAt, active: [...CanvasCourseSnapshot], completed: [...] }`; no snapshot → ToolError `canvas_not_connected` (message tells the student to connect on the page or load the sample).
- **get_upcoming_work** → `{ windowDays, from, to, items: [...CanvasAssignmentSnapshot sorted by dueAt], overdue: [...], counts }`
- **get_grade_risk** → `{ flags: [{level, course, requirement, currentLabel, neededRemainingAverage, estimated, message, rule}], summary: {ok, watch, risk}, unmapped: [courseLabel] }` — built with `runRiskRadar` + `buildRequirementResolver` from `liveRequirements.ts` over the target profile.
- **get_deadlines** → `{ before, items: [{kind: 'application'|'coursework'|'canvas'|'reminder', date, label, action, hard, daysLeft, source?: {name, url}, context?}] }`. Coursework items come from the audit's term plan for **required, missing** prep rows: label "Take MATH 191 (planned Spring 2027) — satisfies MATH 31B at UCLA".
- **get_student_status** → `{ target, entryTerm, gePattern, completed, inProgress, canvas: {connected, source, courses} | null, reminders: {open, done}, headline: string | null }`
- **set_student_target** → the new `get_student_status.data`; unknown campus/major → ToolError with candidates.
- **add_reminder** / **complete_reminder** → `{ reminder }`.

`runTool` records every call in `state.activity` (via: 'agent' from WebMCP,
'console' from the page) so the page can show what the agent did.

## The sample student (Agent B, `src/lib/sampleStudent.ts`)

Fictional, labelled "Sample student" everywhere. Loading it sets:
- target: campus `ucla`, major `cs`, entryTerm `Fall 2024` (→ IGETC rights; the tool explains the choice)
- completed: `MATH 190`, `CSCI 1`, `ENGL C1000`, `PHYS 1A`, `HIST 101`, `COMS C1000` (check codes exist in courses.ts; adjust to real codes)
- inProgress: `MATH 191`, `CSCI 2`, `PHYS 1B`, `PSYC C1000`
- Canvas snapshot `source: 'sample'`, host `sample`, active courses matching the in-progress list with grades: MATH 191 score 71 (B-/C+ borderline → **watch**), CSCI 2 score 88, PHYS 1B score 66 with remainingWeight 0.45 (→ **risk** against C-or-better), PSYC C1000 score 93; completed courses = the completed list with final grades. Assignments: ~10 items dated **relative to now** (2 overdue/missing, 4 within 7 days, rest within 30), realistic names ("Problem Set 6", "Lab 4 report", "Midterm 2").
- Two reminders (one done).

The sample exists so a judge without a Canvas account sees the whole product in
one click. It must never be mistaken for real data: `citations[]` carry
`{sourceName: 'Sample student (fictional)', verification: 'sample'}`.

## The page (Agent C)

Single route. Calm DegreeLume shell (tokens in `index.css`). Sections, top to bottom:

1. **Header**: wordmark "DegreeLume Assistant", one Beta line, and the **WebMCP status pill**: green "13 site tools registered" when `document.modelContext` exists; amber "WebMCP not enabled here — open in ChatGPT's browser or enable chrome://flags/#enable-webmcp-testing" otherwise. Link to "How to use with an agent" (a short modal).
2. **Student panel** (left column on desktop): target campus/major/entry term selects; completed / in-progress course chips with a catalog search box to add; **Canvas connect** (host from `canvasInstitutions.ts` + free-text `*.instructure.com`, token field, "Connect" — and a one-click **"Load the sample student"** button + "Clear everything").
3. **Today** (main column): current courses with grade/score/remaining weight; upcoming work (7 days) with overdue first; risk radar flags; deadlines merged list; reminders with done toggles. Each block is fed by the same `runTool` the agent uses, so the page and the agent can never disagree.
4. **Credit-Carry** table: `compare_campuses` for the target major, all campuses, sortable, with the citation link per row and verdict chips.
5. **Agent activity** feed: every tool call (tool, when, via, summary), newest first — the demo's proof that the agent is using the page.
6. **Tool console** (collapsible): pick a tool, edit JSON input (prefilled example), run, see the ToolOutput — lets anyone exercise every tool without an agent.
7. Footer: sources, the honesty line, MIT, repo link.

Tools **execute visibly**: after any tool call, the affected block re-renders
(store subscription) and flashes briefly.

## WebMCP registration (Agent C, `src/webmcp/register.ts`)

```ts
const ctx = document.modelContext ?? navigator.modelContext; // deprecated fallback
for (const t of TOOLS) await ctx.registerTool({
  name: t.name, description: t.description, inputSchema: t.inputSchema,
  annotations: { readOnlyHint: t.readOnly },
  async execute(input) {
    const out = await runTool(t.name, input, 'agent');
    return { content: [{ type: 'text', text: renderForAgent(out) }] };
  },
}, { signal });
```
`renderForAgent` = summary, blank line, `caveats` as "Note:" lines, then
`JSON.stringify({data, citations})`. Keep results under ~12 KB; truncate long
arrays with a `truncated: n` marker. `registerTool` may be sync or async in
different builds — `await` it either way. Unregister on `beforeunload` by
aborting. Also expose `window.__degreelume = { tools: TOOL_NAMES, run: runTool }`
for the Model Context Tool Inspector extension and for our own console.

## Worker (Agent B, `worker/canvas.js`)

`GET /api/canvas/proxy?host=&path=` with `Authorization: Bearer`. Allow-list:
`*.instructure.com`, `*.canvas.com`, plus every host in
`src/data/canvasInstitutions.ts`. Reject anything else with 403
`host_not_allowed`. Only `path` starting with `/api/v1/` and only GET. 15 s
timeout, 2 MB cap, pass `Link` header through as `x-canvas-link`. Never log the
token. Return upstream status. Also `/api/canvas/hosts` → the audited list for
the picker. Tests with a fake `fetch`.

## Deploy

`npm run deploy` → `wrangler deploy` to Worker `degreelume-webmcp`, custom
domain `assistant.degreelume.com` (wrangler.jsonc). This machine's wrangler is
logged in to Sami's account. This Worker has no secrets. It is a different
Worker from `transferpro`; nothing here can clobber degreelume.com.

## Demo storyline (for the 3-minute video)

1. Open in ChatGPT's browser → arrow in the address bar shows 13 site tools.
2. "Load the sample student." Page fills: UCLA CS, courses, Canvas grades.
3. Ask: *"What's due this week and is anything putting my transfer at risk?"*
   → get_upcoming_work + get_grade_risk. Page highlights PHYS 1B at risk with
   the needed remaining average and the C-or-better rule cited.
4. Ask: *"If I applied to every UC and CSU you cover for CS, where do my
   classes count the most?"* → compare_campuses. The Credit-Carry table sorts.
5. Ask: *"Why doesn't CSCI 1 count at Cal Poly Pomona?"* → explain_requirement
   / check_course_transfer with the agreement row and year.
6. Ask: *"What has to happen before the UC application deadline? Add a reminder for it."* → add_reminder; page shows it.
7. Close on the activity feed: every answer came from a tool call the page
   executed; nothing was guessed.
