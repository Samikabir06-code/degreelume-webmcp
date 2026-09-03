# Narration of the submitted demo video (2:38)

Eight beats, one clip each. Every number was read off the tools' real output
for the author's El Camino College Canvas on 2026-09-03, with the target set to
Cal State Dominguez Hills · Business Administration and the community-college
entry term Fall 2024. Each on-screen action fires at the second its beat begins.

1. **Credit-Carry (compare_campuses)** — "DegreeLume Assistant: a college
   counselor your AI agent can call. Thirteen WebMCP tools, registered with
   `document.modelContext`, over official transfer agreements and my own
   Canvas. Here is the one question ASSIST cannot answer: my El Camino
   coursework against seventeen UC and CSU campuses at once, the Credit-Carry
   report. Santa Barbara: three of four required prep courses already done.
   Dominguez Hills, where I transferred: three of seven. Verdicts are eligible,
   competitive or reach, never guaranteed, and each row is cited to its
   agreement and year."
2. **Your courses (live Canvas)** — "The data is live. This is my El Camino
   College Canvas, connected read-only: twenty courses, current grades, a
   hundred and fifty-two assignments. Courses Canvas withholds show as unnamed;
   nothing is invented."
3. **Risk radar (get_grade_risk)** — "Get grade risk checks every in-progress
   course against the C-or-better rule it cites: Calculus II, Statistics,
   Managerial Accounting, Ethnic Studies. All clear."
4. **Why question (check_course_transfer, MATH 190 at CSUDH)** — "A why
   question: why doesn't Calculus I count for business at Dominguez Hills? It
   does not articulate to any lower-division requirement in the 2025–26
   agreement. It still carries GE area 2, and it counts for business at twelve
   other campuses, UCLA and Berkeley among them. Cited, not guessed."
5. **Deadlines (get_deadlines)** — "Everything before the CSU deadline, in one
   list: the November 30 priority deadline, the two prep courses still missing
   with the term the planner would schedule them, and my Canvas work."
6. **Reminder (add_reminder)** — "And the tools can act: add reminder writes to
   the page, and the page shows it."
7. **Activity feed** — "Every answer is deterministic. A language model never
   decides; it only asks. In ChatGPT's browser the model calls these tools
   itself. Here I ran them from the page's own console, and every call is on
   this feed: tool, input, answer."
8. **Close** — "Open source, MIT, on a public data slice: El Camino's catalog
   and fifty-two ASSIST agreements. DegreeLume Assistant, a counselor your
   agent can call."

Recorded in Chrome 152 with `chrome://flags/#enable-webmcp-testing` on; the
header pill reads "13 site tools registered". Tools were invoked through the
page's console handle (`window.__degreelume.run`), as the narration says.
