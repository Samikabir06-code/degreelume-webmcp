# Devpost submission — paste-ready fields

Draft written 2026-09-02; final numbers are checked against the built app
before submission. Nothing below claims a saving or a guarantee.

## Project name

DegreeLume Assistant

## Tagline (≤ 80 chars)

A college counselor your AI agent can call — cited, deterministic, yours.

## Live URL

https://assistant.degreelume.com

## Repo

https://github.com/Samikabir06-code/degreelume-webmcp (MIT)

## Description

**The problem.** Every year, California community-college students transfer to
UC and CSU campuses carrying courses that do not count. The Public Policy
Institute of California finds the median CSU transfer applicant arrives with
71.5 units against a 60-unit requirement. The official articulation database,
ASSIST, holds the answers — but one campus pair at a time, as a PDF-shaped page
no agent can query, and nothing in it knows what the student is actually taking
this semester.

**What we built.** DegreeLume Assistant is a college counselor that an AI agent
can operate through WebMCP. The page registers twelve tools with
`document.modelContext.registerTool()`. An agent in ChatGPT's browser (or Chrome
with WebMCP enabled) can:

- **check_course_transfer** — does this El Camino College course satisfy a
  requirement at UCLA for computer science? Cited to the ASSIST agreement row
  and academic year.
- **audit_coursework** — a whole transcript against one campus and major:
  satisfied, in progress, missing, cannot verify; GE areas; units toward the
  60-unit floor; an eligible / competitive / reach reading.
- **compare_campuses** — the Credit-Carry report: the same coursework across
  17 UC and CSU campuses side by side — which units land where. This is the
  question ASSIST structurally cannot answer.
- **explain_requirement** — what satisfies a requirement, with the agreement
  row behind it.
- **get_current_courses / get_upcoming_work / get_grade_risk** — the student's
  own Canvas: current grades, what is due this week, what is overdue, and which
  in-progress course endangers which transfer requirement, with the average
  still needed on the remaining work.
- **get_deadlines** — everything that must happen before a date: UC filing,
  TAG, Transfer Academic Update, CSU priority deadline, Canvas due dates, the
  prep courses still missing and when the planner would schedule them.
- **set_student_target / add_reminder / complete_reminder** — the agent can
  update the page, and the page shows it.

**Why WebMCP fits.** Every tool is a deterministic engine over official state
records: structured in, cited out. A language model never decides an answer;
it only asks. That is the shape agent tools should have — the agent brings the
conversation, the site brings the authority. The page executes each call
visibly and keeps an activity feed, so the student sees exactly what the agent
did and on what basis.

**Implementation.** React + TypeScript on Cloudflare Workers (static assets +
a read-only Canvas proxy). The transfer engine, GE matching, term planner,
major-switch comparator, deadline calendar and grade risk radar are the same
pure functions that run DegreeLume's product, over a public data slice: the
El Camino College 2025–26 catalog and 52 ASSIST articulation agreements
(El Camino → 17 campuses × business, computer science, psychology). Canvas
access is read-only; the token stays in the student's browser and is forwarded
per request, never stored. Every answer carries citations with the agreement's
academic year and verification state; machine-transcribed agreements say so.
A labelled sample student lets anyone try the whole thing without a Canvas
account.

## How to test (private field)

1. Open https://assistant.degreelume.com in the ChatGPT desktop app's built-in
   browser (site-tools arrow appears in the address bar) or in Chrome 149+ with
   `chrome://flags/#enable-webmcp-testing` enabled.
2. Click **Load the sample student** (fictional, labelled).
3. Ask the agent, for example:
   - "What's due this week, and is anything putting my transfer at risk?"
   - "Compare every campus you cover for computer science — where do my classes count the most?"
   - "Why doesn't PHYS 1A count at Cal Poly Pomona?"
   - "Remind me to file my UC TAG before September 30."
4. The **Tool console** at the bottom of the page runs every tool by hand; the
   **activity feed** shows every call the agent made.
5. To use your own Canvas: pick your school, paste a Canvas access token
   (Account → Settings → New access token). Read-only; nothing is stored.

## Built with

TypeScript, React, Vite, Tailwind, Cloudflare Workers, WebMCP
(`document.modelContext`), Canvas LMS REST API, ASSIST articulation data.

## Video

(YouTube link — public, under 3 minutes, with audio)
