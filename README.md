# DegreeLume Assistant

A college counselor your AI agent can call.

Live: https://assistant.degreelume.com · MIT

## What it does

DegreeLume Assistant is a deterministic engine over official ASSIST
articulation agreements and the student's own Canvas, exposed to an agent as
13 WebMCP tools through `document.modelContext.registerTool()`. A language
model never decides an answer — it calls a tool, a pure function answers, and
the answer is cited.

The centerpiece is `compare_campuses`, the Credit-Carry report: the same
coursework run against every covered campus for a major, side by side. That
is the question ASSIST cannot answer, because it shows one campus pair at a
time. The Public Policy Institute of California finds the median CSU transfer
applicant arrives with 71.5 units against a 60-unit requirement.

This tool does not claim savings, guarantee outcomes, or predict admission.
Verdicts are `eligible` / `competitive` / `reach`, never a promise.

## Try it in 60 seconds

Open https://assistant.degreelume.com in one of:

- the ChatGPT desktop app's built-in browser — a site-tools arrow appears in
  the address bar;
- Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled;
- the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/gbpdfapgefenggkahomfgkhfehlcenpd)
  extension.

Click **Load the sample student** (a fictional, labelled UCLA-CS-bound El
Camino student), then ask the agent things like:

- "What's due this week, and is anything putting my transfer at risk?"
- "Compare every campus you cover for computer science — where do my classes
  count the most?"
- "Why doesn't CSCI 1 count at Cal Poly Pomona?"
- "What has to happen before the UC application deadline, and add a reminder
  for it."

No agent-capable browser? The on-page **Tool console** runs every tool by
hand, in any browser, and shows the raw result.

## The tools

| Tool | What it answers | Read-only |
|---|---|---|
| `list_options` | What campuses, majors, and catalog this counselor covers | yes |
| `get_student_status` | The profile the page currently holds: target, coursework, Canvas state, reminders | yes |
| `check_course_transfer` | Does one El Camino course satisfy a requirement at a campus, cited to the agreement row | yes |
| `audit_coursework` | Full audit against one campus and major: satisfied / in progress / missing, GE, units, verdict | yes |
| `compare_campuses` | The Credit-Carry report: the same coursework across every covered campus, side by side | yes |
| `explain_requirement` | What satisfies one requirement row, and the catalog courses behind it | yes |
| `get_current_courses` | The student's Canvas enrollments and grades, live or sample | yes |
| `get_upcoming_work` | What's due in the next N days, overdue first | yes |
| `get_grade_risk` | Which in-progress course endangers which requirement, and the average still needed | yes |
| `get_deadlines` | Everything due before a date: application deadlines, Canvas work, missing prep courses, reminders | yes |
| `set_student_target` | Update campus, major, entry term, or coursework | no |
| `add_reminder` | Add a reminder to the student's list | no |
| `complete_reminder` | Mark a reminder done or reopen it | no |

Names and descriptions above come from `src/tools/contract.ts`, the single
source both the WebMCP registration and the page's tool console read from.

## How WebMCP is used

`src/webmcp/register.ts` hands every tool in the contract to whichever Model
Context API this browser has, and executes each call through the same
dispatcher the page's own console uses:

```ts
const ctx = document.modelContext ?? navigator.modelContext; // deprecated fallback
for (const t of TOOLS) {
  await ctx.registerTool(
    {
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: t.readOnly },
      async execute(input) {
        const out = await runTool(t.name, input ?? {}, 'agent');
        return { content: [{ type: 'text', text: renderForAgent(out) }] };
      },
    },
    { signal }, // aborted on beforeunload, so a closed tab drops the tools
  );
}
```

Every call — agent or human — goes through `runTool`, which validates the
input against the contract's schema, dispatches, and records the call in the
page's activity feed. The page re-renders the affected block and flashes it
briefly, so tool calls execute visibly: the student watching the page sees
exactly what the agent asked for and what it got back, not just chat text.

For DevTools or the Tool Inspector extension, every tool is also reachable
directly:

```js
window.__degreelume.run('compare_campuses', { major: 'cs' });
```

## Honesty rules

- **No fabrication.** An empty student profile produces honest empty answers
  ("no target set", "connect Canvas or load the sample"), never a guess.
- **Every answer is cited.** Each `ToolOutput` carries `citations[]` with the
  source's academic year and a `verification` state: `verified`,
  `unreviewed` (machine-transcribed, not yet human-checked), or `sample`.
- **Verdict language is fixed.** Only `eligible`, `competitive`, or `reach`.
  Never "guaranteed" or "will be admitted".
- **The sample student is fictional and labelled.** Its citations carry
  `verification: 'sample'` everywhere, so it can never be mistaken for a real
  transcript.

## Data

- El Camino College catalog, 2025–26.
- 52 ASSIST articulation agreements: El Camino → 17 UC/CSU campuses × business,
  computer science, and psychology. Six campuses (UCR, UCLA, UCI, UC San
  Diego, UC Berkeley, Cal Poly Pomona) are fully human-verified; the other
  eleven have verified campus facts (GPA target, impaction) with
  machine-transcribed agreement rows, marked `unreviewed` until a human pass.
- GE patterns (Cal-GETC and IGETC), selected by the student's community-college
  entry term.
- A UC/CSU deadline calendar with sources, and the grade rules the risk radar
  uses.

This is a deliberately small public slice of DegreeLume's data. Individual
ASSIST agreements are public records, so publishing this subset discloses
nothing new. `src/engine` holds the product's own pure functions, copied
verbatim — no rewrite, no reduced behavior.

## Canvas privacy

Canvas access is read-only: GET requests only. The access token lives in the
browser's own `localStorage` and is forwarded per request through a Worker
proxy to an allow-listed set of Canvas hosts — never stored server-side, never
logged. Disconnecting clears it from the browser immediately.

## Architecture

```
src/
  tools/       contract.ts (the 13 tool declarations) + implementations
  engine/      the pure transfer/GE/planning/risk engine, copied from the product
  data/        the public data slice (catalog, ASSIST agreements, GE, deadlines)
  webmcp/      registers TOOLS with document.modelContext
  components/  the page: student panel, Today dashboard, Credit-Carry table,
               activity feed, tool console
worker/        Cloudflare Worker: static assets + /api/canvas/* proxy
```

A Cloudflare Worker serves the built static assets and runs only for
`/api/*`, currently the read-only Canvas proxy.

## Develop

```
npm install
npm run dev      # http://localhost:5190
npm run check    # tsc + eslint + vitest
npm run deploy   # build, then wrangler deploy
```

`npm run check` currently runs 373 tests across 19 files, all passing.

## Provenance for the challenge

This repository was created on 2026-09-02 for the WebMCP Challenge. Its git
history is the timestamped record of the WebMCP work: the tool contract, the
registration layer, the Canvas proxy, and the page. The transfer engine and
data pipeline predate this repository — they are DegreeLume's product code,
copied in verbatim and credited as such above.

## License

MIT. See `LICENSE`.
