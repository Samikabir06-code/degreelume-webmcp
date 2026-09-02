// ─── The tool contract ───────────────────────────────────────────────────────
//
// Every WebMCP tool the page registers is declared HERE, once: name,
// description (what the agent reads), JSON input schema, and the read-only
// annotation. Implementations live in ./transfer.ts and ./school.ts and are
// wired in ./index.ts. The UI's tool console and the WebMCP registration layer
// both read this list, so a tool cannot exist in one and not the other.
//
// Rules every implementation follows (BUSINESS_RULES §4 of the main product):
//   · deterministic — same inputs, same output; a language model never decides;
//   · cited — every answer that rests on an agreement or catalog names it with
//     its academic year and verification state;
//   · honest — anything unverifiable is returned as such, never guessed;
//   · no "guaranteed", no "will be admitted": verdict language is
//     eligible / competitive / reach, exactly as the engine emits it.

export type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export interface Citation {
  sourceName: string;
  sourceUrl: string;
  catalogYear: string;
  verification: 'demo' | 'unreviewed' | 'verified' | 'sample';
  lastVerified?: string;
}

// What every tool returns to the agent. `summary` is one to four plain
// sentences an agent can relay verbatim; `data` is the structured result;
// `citations` back it; `caveats` carry the honest limits ("unreviewed
// transcription", "sample data", "no articulation found").
export interface ToolOutput<T = unknown> {
  summary: string;
  data: T;
  citations: Citation[];
  caveats: string[];
}

export interface ToolError {
  error: string;        // machine code, e.g. 'unknown_course'
  message: string;      // what the agent should tell the student
  hint?: string;        // what to do instead ("call list_options")
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  readOnly: boolean;
  // Grouping for the page's tool console only.
  group: 'transfer' | 'school' | 'state';
}

// One place every campus/major string is normalised: agents send "UCLA",
// "uc los angeles", "ucla" — the resolver in ../lib/resolve.ts maps all of them
// to the registry id and the tool reports the canonical name back.

export const TOOLS: ToolDescriptor[] = [
  // ── Discovery ──
  {
    name: 'list_options',
    group: 'transfer',
    readOnly: true,
    description:
      'List what this counselor can answer about: the sending college (El Camino College), the destination campuses with articulation data, the majors covered, the size of the course catalog, and the data snapshot version. Call this first if you are unsure which campus or major names to use.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_student_status',
    group: 'state',
    readOnly: true,
    description:
      'Read the student profile this page currently holds: target campus and major, community-college entry term, completed and in-progress courses, whether Canvas is connected (live or sample data), how many reminders exist, and a one-line audit headline if a target is set. Use it before other tools so you do not ask the student for facts the page already has.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },

  // ── Transfer tools (deterministic engine over ASSIST agreements) ──
  {
    name: 'check_course_transfer',
    group: 'transfer',
    readOnly: true,
    description:
      'Check whether one El Camino College course satisfies a lower-division major-preparation requirement or a general-education area at a destination campus for a major, and cite the ASSIST articulation agreement row and academic year behind the answer. If the course articulates nowhere in that agreement, the tool says so and reports which other covered campuses do accept it for the same major.',
    inputSchema: {
      type: 'object',
      properties: {
        course: { type: 'string', description: 'El Camino course code, e.g. "MATH 190" or "ECON 101"' },
        campus: { type: 'string', description: 'Destination campus name or id, e.g. "UCLA", "Cal Poly Pomona", "csulb". Defaults to the student\'s target campus.' },
        major: { type: 'string', description: 'Major: "business", "cs" (computer science) or "psych" (psychology). Defaults to the student\'s target major.' },
      },
      required: ['course'],
      additionalProperties: false,
    },
  },
  {
    name: 'audit_coursework',
    group: 'transfer',
    readOnly: true,
    description:
      'Audit a set of completed (and optionally in-progress) El Camino College courses against one destination campus and major: which major-preparation requirements are satisfied, in progress, missing, or cannot be verified; which general-education areas (Cal-GETC or IGETC, chosen by entry term) are covered; transferable units against the 60-unit floor; the engine\'s verdict (eligible / competitive / reach — never a guarantee); items that need a human counselor; and every source cited. Omit courses to use the coursework the page already holds.',
    inputSchema: {
      type: 'object',
      properties: {
        courses: { type: 'array', items: { type: 'string' }, description: 'Completed El Camino course codes. Omit to use the student profile on the page.' },
        inProgress: { type: 'array', items: { type: 'string' }, description: 'Courses currently being taken.' },
        campus: { type: 'string', description: 'Destination campus. Defaults to the student\'s target.' },
        major: { type: 'string', description: '"business", "cs" or "psych". Defaults to the student\'s target.' },
        entryTerm: { type: 'string', description: 'First term at a California community college, e.g. "Fall 2024". Decides Cal-GETC vs IGETC. Defaults to the profile; unknown means Cal-GETC.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'compare_campuses',
    group: 'transfer',
    readOnly: true,
    description:
      'The Credit-Carry report: run the same coursework against several destination campuses for one major and show, side by side, how many required major-prep courses are already satisfied at each, how many units count toward the major or GE versus transferring only as electives, the verdict at each campus, its GPA target and impaction status, and the agreement each row rests on. This is the question ASSIST cannot answer, because it shows one campus pair at a time. Omit campuses to compare every covered campus for the major.',
    inputSchema: {
      type: 'object',
      properties: {
        courses: { type: 'array', items: { type: 'string' }, description: 'Completed El Camino course codes. Omit to use the student profile on the page.' },
        inProgress: { type: 'array', items: { type: 'string' } },
        major: { type: 'string', description: '"business", "cs" or "psych". Defaults to the student\'s target.' },
        campuses: { type: 'array', items: { type: 'string' }, description: 'Campus names or ids to compare. Omit for all covered campuses.' },
        entryTerm: { type: 'string', description: 'First community-college term, e.g. "Fall 2024".' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'explain_requirement',
    group: 'transfer',
    readOnly: true,
    description:
      'Explain one lower-division requirement at a destination campus for a major: the exact El Camino courses that satisfy it, whether it is a plain row or part of a "select N of the following" group, whether the agreement marks it required, the agreement row and academic year, and the catalog entry (name, units, GE areas) for each satisfying course. Match by the receiving course code (e.g. "MATH 31A"), a word from the label (e.g. "statistics"), or the row id from an audit.',
    inputSchema: {
      type: 'object',
      properties: {
        requirement: { type: 'string', description: 'Receiving course code, label fragment, or row id.' },
        campus: { type: 'string', description: 'Destination campus. Defaults to the student\'s target.' },
        major: { type: 'string', description: '"business", "cs" or "psych". Defaults to the student\'s target.' },
      },
      required: ['requirement'],
      additionalProperties: false,
    },
  },

  // ── School assistant (the student's own Canvas + calendar) ──
  {
    name: 'get_current_courses',
    group: 'school',
    readOnly: true,
    description:
      'List the courses in the student\'s Canvas: current enrollments with the current grade and score Canvas reports, the term, the share of the grade still ungraded, and the El Camino catalog course each maps to; plus completed courses with their final grades. Reports whether the data is the student\'s live Canvas or the labelled sample student. If Canvas is not connected, says so — the student must connect it on the page; an agent cannot enter the token.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_upcoming_work',
    group: 'school',
    readOnly: true,
    description:
      'List assignments, quizzes and other graded work due within a window (default the next 7 days) across the student\'s Canvas courses, including anything overdue or missing, with due date, points, submission state and a link. Optionally restrict to one course.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'integer', minimum: 1, maximum: 120, description: 'Window in days from now. Default 7.' },
        course: { type: 'string', description: 'Restrict to one course (Canvas code or catalog code).' },
        includeSubmitted: { type: 'boolean', description: 'Include work already submitted. Default false.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_grade_risk',
    group: 'school',
    readOnly: true,
    description:
      'Risk radar: for every in-progress Canvas course that maps to a requirement in the student\'s target plan, compare the current grade against the grade that requirement demands (C or better for major prep and GE by default, with the rule cited) and report ok / watch / risk, including the average still needed on the remaining ungraded work. A course that cannot be mapped or graded produces no verdict — it is reported as unknown, never as at risk.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_deadlines',
    group: 'school',
    readOnly: true,
    description:
      'Everything that has to happen before a date, merged and sorted: official transfer-application deadlines for the target system (UC filing window, UC TAG, Transfer Academic Update, CSU priority deadline — each with its source page), Canvas due dates, the student\'s own reminders, and the required major-prep courses still missing with the term the planner would schedule them. Defaults to the next 365 days.',
    inputSchema: {
      type: 'object',
      properties: {
        before: { type: 'string', description: 'ISO date (YYYY-MM-DD). Only items due on or before this date.' },
        kinds: { type: 'array', items: { type: 'string', enum: ['application', 'coursework', 'canvas', 'reminder'] }, description: 'Filter by kind. Default all.' },
      },
      additionalProperties: false,
    },
  },

  // ── State-changing tools (annotated as such; the page shows the change) ──
  {
    name: 'set_student_target',
    group: 'state',
    readOnly: false,
    description:
      'Update the student profile on the page: target campus, target major, first community-college term, and/or the lists of completed and in-progress El Camino courses (each list replaces the previous one when given). Changes what every other tool defaults to. The page shows the new profile immediately.',
    inputSchema: {
      type: 'object',
      properties: {
        campus: { type: 'string' },
        major: { type: 'string', description: '"business", "cs" or "psych".' },
        entryTerm: { type: 'string', description: 'e.g. "Fall 2024"' },
        completedCourses: { type: 'array', items: { type: 'string' } },
        inProgressCourses: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'add_reminder',
    group: 'state',
    readOnly: false,
    description:
      'Add a reminder to the student\'s list on this page (title, due date, optional note and link). Use it to turn a deadline or a missing requirement into something the student will see. Returns the reminder id.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        due: { type: 'string', description: 'ISO date or date-time.' },
        note: { type: 'string' },
        url: { type: 'string', description: 'Source link to attach.' },
      },
      required: ['title', 'due'],
      additionalProperties: false,
    },
  },
  {
    name: 'complete_reminder',
    group: 'state',
    readOnly: false,
    description: 'Mark one of the student\'s reminders done (or reopen it) by id.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        done: { type: 'boolean', description: 'Default true.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
  },
];

export const TOOL_NAMES = TOOLS.map((t) => t.name);
export type ToolName = (typeof TOOL_NAMES)[number];

export function toolDescriptor(name: string): ToolDescriptor | undefined {
  return TOOLS.find((t) => t.name === name);
}
