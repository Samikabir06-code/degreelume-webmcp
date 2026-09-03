# Demo video — script (target 2:40, hard limit 3:00, audio required)

Sami narrates. The screen is `https://assistant.degreelume.com`. Every line
below has been checked against the built app; the tool answers quoted are the
real ones for the sample student. Read at a normal pace — the narration is
about 390 words.

## Setup before recording (10 min)

**Best: the ChatGPT desktop app's built-in browser.** Open the URL there; the
site-tools arrow appears in the address bar. Ask ChatGPT the prompts below and
it calls the tools itself. (Needs the latest desktop app and GPT-5.6 Sol or
Terra; site tools are off in Enterprise/Edu workspaces.)

**Fallback: Chrome 152 with `chrome://flags/#enable-webmcp-testing` enabled
and the Model Context Tool Inspector extension** (Chrome Web Store id
`gbpdfapgefenggkahomfgkhfehlcenpd`). The inspector's side panel lists the 13
tools; its Gemini mode can call them from a prompt, or you click a tool and run
it by hand. If you use this route, say so in the narration (line 2 has the
alternate wording) — never imply a model called a tool when you clicked it.

Either way: reload the page, click **Load the sample student**, then **Clear
everything is NOT pressed** — the sample must be loaded before you start.
Recording at 1440×900 or larger; keep the page zoom at 100%.

## The take

| t | Screen (Claude drives / you click) | You say |
|---|---|---|
| 0:00 | Page top. Header pill reads "13 site tools registered". | "This is DegreeLume Assistant — a college counselor that an AI agent can call. The page registers thirteen tools with WebMCP, `document.modelContext.registerTool`. Every tool is a deterministic engine over official records. A language model never decides an answer here; it only asks." |
| 0:15 | Hover the address-bar site-tools arrow (ChatGPT) — or open the inspector side panel (Chrome). | "In ChatGPT's browser they show up as site tools." *(Chrome fallback: "In Chrome behind the WebMCP flag, the Model Context Tool Inspector shows the same thirteen tools, and I'll call them from here.")* |
| 0:25 | Point at the student panel: UCLA, Computer Science, six completed and four in-progress El Camino courses, Canvas showing "Sample data". | "Meet a sample student — fictional and labelled. She's at El Camino College, aiming at UCLA for computer science, and her Canvas is connected read-only." |
| 0:35 | **Prompt 1:** *What's due this week, and is anything putting my transfer at risk?* Page flashes "Due in the next 7 days" then "Risk radar". | "First question: what's due, and is anything putting my transfer at risk. The agent calls `get_upcoming_work` — six items, two overdue — and `get_grade_risk`. Physics 1B is at 66 percent; it needs a C for transfer GE, and the engine says she needs about 86 percent on the remaining 35 percent of the course. Calculus II is a watch. That's the same C-or-better rule the tool cites, not an opinion." |
| 1:05 | **Prompt 2:** *Compare every campus you cover for computer science — where do my classes count the most?* Credit-Carry table sorts. | "Second: compare every campus. This is the Credit-Carry report — the one question ASSIST cannot answer, because ASSIST shows one campus pair at a time. Seventeen campuses, one call. Each row says how many required prep courses are already satisfied, which units count toward the major or GE and which only transfer as electives, the engine's verdict — eligible, competitive or reach, never 'guaranteed' — and the exact agreement it rests on, with the year and whether a human has read it." |
| 1:40 | **Prompt 3:** *Why doesn't CSCI 1 count at Cal Poly Pomona?* Activity feed shows `check_course_transfer`. | "Third: a why question. CSCI 1 does not articulate to any lower-division requirement for computer science at Cal Poly Pomona in the 2025–26 agreement. It still carries no GE credit, and the tool says which campuses do accept it — UCLA and Long Beach among them. Cited, not guessed." |
| 2:00 | **Prompt 4:** *What has to happen before the UC application deadline? Add a reminder for it.* Deadlines list; a new reminder appears. | "Fourth: what has to happen before the UC deadline. `get_deadlines` merges the official UC filing window, her Canvas due dates, the prep courses she's still missing with the term the planner would schedule them — and then `add_reminder` writes to the page. The agent doesn't just read; it can act, and the page shows it." |
| 2:25 | Scroll to **What your agent did on this page**. | "Everything the agent did is on this feed — tool, input, answer. Structured in, cited out." |
| 2:35 | Footer: MIT, repo link. | "Open source, MIT, on a public data slice: El Camino's catalog and fifty-two ASSIST agreements. DegreeLume Assistant — a counselor your agent can call." |

## No-talking route (the audio does not have to be your voice)

The rule is "audio that covers what you built and how you used WebMCP" — a
narration track counts. A generated voiceover of this script exists at
`Downloads\degreelume-voiceover\voiceover-full.mp3` (2:20). To use it:

1. Record the screen silently while driving the four prompts (Windows: Win+Alt+R
   for Game Bar, or Clipchamp → Record → Screen). Pause a beat after each
   prompt so the page has time to react.
2. Open Clipchamp (built into Windows 11), drop the recording on the timeline,
   drop `voiceover-full.mp3` on the audio track, trim the video to fit the
   narration, export 1080p. Total must stay under 3:00.
3. If your screen recording runs long, cut at prompt boundaries — the
   narration pauses between "First", "Second", "Third", "Fourth".

## If a prompt misfires

- The agent asks which campus: say "UCLA" — the page already holds it, but
  some models double-check. That is fine on camera.
- The agent answers without calling a tool: rephrase as "Use the site tools
  to …". Cut the retake at the prompt boundary.
- A tool errors: the error text tells you what to say; nothing here fabricates.

## What NOT to say

No "guaranteed", "approved", "will be admitted", no time or money saved, no
"all campuses" (it is 17), no "verified" for the machine-transcribed
agreements (15 of the 17 CS agreements are unreviewed and the page says so).
