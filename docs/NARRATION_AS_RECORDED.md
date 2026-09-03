# Narration of the submitted demo video (2:36)

Every number below was read off the tools' real output for the author's
El Camino College Canvas on 2026-09-02, with the target set to Cal State
Dominguez Hills · Business Administration and the community-college entry
term Fall 2024.

> This is DegreeLume Assistant, a college counselor that an AI agent can call.
> The page registers thirteen tools with WebMCP, `document.modelContext.registerTool`.
> Every tool is a deterministic engine over official records; a language model
> never decides an answer here, it only asks. This is Chrome with the WebMCP
> flag on: thirteen site tools registered. In ChatGPT's browser the model calls
> them itself; in this recording I run the same registered tools from the
> page's own console, so you see exactly what an agent receives. And this is
> my own Canvas at El Camino College, connected read-only: twenty courses, a
> hundred and fifty-two assignments, live grades. Courses Canvas withholds show
> as unnamed; nothing is invented.
>
> First question: what's due, and is anything at risk? Fall isn't in Canvas
> yet; the only items in the window are two spring extra-credit pieces still
> marked missing. Get grade risk maps each course to the catalog and checks it
> against the C-or-better rule it cites: Calculus II, Statistics, Managerial
> Accounting, Ethnic Studies, all clear.
>
> Second: compare every campus. This is the Credit-Carry report, the one
> question ASSIST cannot answer, because ASSIST shows one campus pair at a
> time. Seventeen campuses, one call, for Business Administration. Santa
> Barbara: three of four required prep courses already done. Dominguez Hills,
> where I actually transferred: three of seven, two in progress. Each row says
> which units count and which only transfer as electives, the engine's verdict,
> eligible, competitive or reach, never guaranteed, and the exact agreement it
> rests on, with the year and whether a human has read it.
>
> Third: a why question. Why doesn't Calculus I count for business at
> Dominguez Hills? It does not articulate to any lower-division requirement in
> the 2025–26 agreement. It still carries GE area 2, and the tool names the
> twelve campuses where it does count for business, UCLA and Berkeley among
> them. Cited, not guessed.
>
> Fourth: what has to happen before the CSU deadline. Get deadlines merges the
> November 30 priority deadline, the two prep courses still missing with the
> term the planner would schedule them, and my Canvas work. Then add reminder
> writes to the page: the tools don't just read, they can act, and the page
> shows it.
>
> Everything that ran is on this feed: tool, input, answer. Structured in,
> cited out. Open source, MIT, on a public data slice: El Camino's catalog and
> fifty-two ASSIST agreements. DegreeLume Assistant, a counselor your agent can
> call.

Tool calls made on screen, in order: `get_upcoming_work`, `get_grade_risk`,
`compare_campuses`, `check_course_transfer` (MATH 190 at Cal State Dominguez
Hills), `get_deadlines`, `add_reminder`.
