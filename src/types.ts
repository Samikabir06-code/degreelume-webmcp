export type SchoolId = string;
export type CollegeId = string;
// 13 majors: the V1 trio + the 10-major expansion (SPEC_MAJOR_SWITCH_2026-07-03,
// authorized by Sami 2026-07-03 — top-10 by transfer volume, ECC→UCR/CPP pilot).
export type MajorId =
  | "business" | "cs" | "psych"
  | "civil" | "mech" | "ee" | "bio" | "econ"
  | "soc" | "polisci" | "comm" | "math" | "kin";
// A major the student may not have picked yet. Every registry lookup accepts
// this and answers "no data" for the empty case, so no surface has to invent a
// major to have something to render.
export type MajorChoice = MajorId | "";
export type CourseCode = string;
export type TermLoad = "light" | "normal" | "heavy";

// ---- Data provenance (A1/A2): every requirement source is versioned & citable ----
export interface DataProvenance {
  sourceName: string;        // "ASSIST articulation: El Camino College → UC Riverside, Business"
  sourceUrl: string;         // official page the data derives from
  catalogYear: string;       // agreement/catalog year, e.g. "2025–26"
  lastVerified: string;      // ISO date the snapshot was last checked against the source
  // demo = illustrative, never represented real data;
  // unreviewed = transcribed from the real source but no human has checked the
  //   transcription yet (the ingestion tooling emits this — flipping to
  //   'verified' is a HUMAN act, per DATA_REQUIREMENTS);
  // verified = a human checked the transcription against the source.
  verification: "demo" | "unreviewed" | "verified";
}

export type StudentStatus = "new" | "current" | "switching";
export type GoalId = "transfer" | "graduate" | "both";
export type GradTrack = "associate" | "adt";

// ---- Transfer GE patterns (dual-pattern: Cal-GETC vs IGETC) ----
// Which pattern applies is a STUDENT fact, not a requirement-set fact: CCC entry
// fall 2025+ → Cal-GETC (the AB 928 single pathway); earlier entrants keep IGETC
// catalog rights and may complete either. See data/gePatterns.ts for the rule.
export type GePatternId = "igetc" | "calgetc";

export interface GePattern {
  id: GePatternId;            // doubles as the per-course tag field name (Course[id])
  name: string;               // "Cal-GETC" | "IGETC" — every UI label derives from this
  description: string;
  areas: GeArea[];
  meta: DataProvenance;
}

// How the course history entered the profile (TR-9 provenance, coarse tier —
// per-row detail lives in the tp:transcript record; 'sis' joins later, ONB-10).
// 'canvas' = pre-filled from the student's connected Canvas (confirmed course
// mappings only), then confirmed by the student on the coursework step.
export type EntrySource = 'manual' | 'transcript' | 'canvas';

export interface StudentProfile {
  college: CollegeId;         // registry key (see data/colleges.ts) — institutions are rows, not code paths
  status: StudentStatus;
  goal: GoalId;
  gradTrack: GradTrack;       // meaningful when goal includes graduate
  school: SchoolId;
  major: MajorChoice;         // target major; "" until the student picks one
  fromMajor: MajorId | null;  // previous major when switching (narrative + carry-over framing)
  completed: CourseCode[];
  inProgress: CourseCode[];
  exams: string[];            // AP/IB/CLEP exam ids whose credit clears courses
  frenchBac: boolean;
  gpa: string;
  startTerm: string;          // e.g. "Fall 2026"
  termLoad: TermLoad;
  // Whether the term plan uses Winter/Summer intersession terms. undefined =
  // derive from the load (light = no; normal/heavy = yes). Set explicitly to let
  // a student OPT OUT and keep a Fall/Spring-only schedule on any load.
  includeIntersessions?: boolean;
  entrySource?: EntrySource;  // provenance tier of the course history
  // First term ever enrolled at a California community college, when actually
  // known ('' otherwise). Facts only — set from the transcript's first term or,
  // for brand-new students, the start term. Never fabricated from a guess.
  ccEntryTerm: string;
  // The student's GE-pattern selection where a choice exists (pre-fall-2025
  // entrants may complete either pattern). 'auto' = derive from entry term.
  // Ignored when the entry term forces Cal-GETC (fall 2025+).
  gePatternChoice: GePatternId | "auto";
  // Courses the student has CHOSEN to take to satisfy general-education areas,
  // picked on the result screen (the "build your own GE" surface). These are
  // intentions, not facts — distinct from `completed`/`inProgress` — so they
  // count toward the PLAN (term-by-term schedule, "in your plan" area state)
  // but never toward a completed-coursework verdict. Major prep is never here:
  // it stays engine-planned and locked. An area the student has put ≥1 pick in
  // is "theirs" — the engine schedules exactly those picks and stops
  // auto-filling it; untouched areas keep auto-filling so the plan stays whole.
  // Optional: profiles/share tokens/test fixtures saved before this existed
  // backfill to [] (see INITIAL_PROFILE + sanitizeProfile).
  gePlan?: CourseCode[];
  // ─── Undecided / exploration path ───
  // A student who doesn't know their major yet follows the exploration path: a
  // major-agnostic first year (GE + the courses that count toward the most
  // candidate majors), with a "decide later" handoff into a normal single-major
  // plan. `major` still holds a primary/default for the bits that need one, but
  // the exploration result shows no single verdict.
  exploring?: boolean;
  // Fields of interest, as candidate majors. Empty/undefined while exploring =
  // "I really don't know" → a balanced mix across every major.
  interests?: MajorId[];
  // Courses the student asked to skip on the avoid step. Honored by the planner
  // (it picks alternatives / drops optional tasters), but a course needed to
  // graduate (sole filler of a required GE area) or needed for every candidate
  // major is locked there and can never land here.
  avoidCourses?: CourseCode[];
}

// ---- Transfer requirement data (UC/CSU), keyed by school|major ----
// Note: no gePattern field — which GE pattern applies (Cal-GETC vs IGETC) is a
// fact about the STUDENT (CCC entry term), never about the agreement.
export interface RequirementSet {
  school: SchoolId;
  major: MajorId;
  impacted: boolean;
  gpaTarget: number;
  adt: {
    available: boolean;
    name: string | null;
    grantsPriority: boolean;
  };
  // UC TAG (Transfer Admission Guarantee) facts for this campus+major —
  // ADVISORY COPY ONLY (B1): the engine never uses these in a verdict, and the
  // UI must describe the official program (with its official criteria/link),
  // never tell the student they are guaranteed.
  tag?: {
    eligible: boolean;     // major is not on the campus TAG exclusion list
    gpa: number | null;    // per-major minimum TAG GPA (by end of prior summer)
    notes: string;         // cycle year + the criteria worth surfacing
    sourceUrl: string;     // the TAG matrix / campus TAG page the facts came from
  };
  // CSU-side facts (CSUs have no TAG) — ADVISORY COPY ONLY (B1): never a
  // verdict input. An ADT guarantees admission to the CSU SYSTEM with junior
  // standing — never a specific campus/major when impacted (rule 4: "guarantee"
  // only as the official program's own claim, with its official link). The
  // engine's `adt` block above is DERIVED from adtGuarantee for CSU sets
  // (grantsPriority = available && similarMajorAtCampus).
  csu?: {
    adtGuarantee: {
      available: boolean;            // a similar ADT exists statewide
      similarMajorAtCampus: boolean; // this campus maps that ADT to THIS major
      similarAdt: string | null;     // e.g. "AS-T Computer Science"
      notes: string;                 // what the guarantee covers + impaction caveat
    };
    campusImpacted: string | null;   // campus-level impaction scope (e.g. "campus-wide (FTF & UDT)"); null = none for transfers
    localAdmissionArea: string | null; // local-priority context; null = none published / not applicable
    sourceUrl: string;               // the official campus impaction/ADT page
  };
  majorPrep: MajorPrepReq[];
  // True when the agreement lists this major's requirements but articulates
  // NONE of them from this college — ASSIST returns an empty articulation set.
  // A real, published answer ("take it after you transfer"), not missing data:
  // verified against live ASSIST for Cerritos → San Diego State CS, 2026-08-19.
  // Distinguishes an honest empty prep list from a broken one, so the UI can
  // say which it is instead of rendering a blank section.
  noArticulatedPrep?: boolean;
  meta: DataProvenance;
}

// ---- ECC associate-degree data (local AA/AS), keyed by major ----
// AA vs AS is a real attribute of the degree (different GE/major-unit splits),
// not just a label — it's modeled explicitly so the swap from demo to catalog
// data carries it. AA-T/AS-T (transfer degrees) live in AdtTemplate below.
export type AssociateDegreeType = "AA" | "AS";
export type AdtDegreeType = "AA-T" | "AS-T";

export interface AssociateDegree {
  major: MajorId;
  name: string;              // "Associate in Science — Business Administration"
  degreeType: AssociateDegreeType; // AA | AS — drives the GE/major-unit split
  gePattern: "ECC GE";
  totalUnits: number;        // 60
  gpaTarget: number;         // 2.0
  majorCore: MajorPrepReq[]; // required/elective split via MajorPrepReq.required
  meta: DataProvenance;
}

// ---- ECC Associate Degree for Transfer (AA-T / AS-T) template, keyed by major ----
//
// The official ADT template is published by the community college and its
// lower-division major core MAY DIFFER from the UC articulation prep — so the
// engine must not keep approximating "ADT core = UCR articulation prep". This
// type is the real drop target (populated per major from the degrees-adt drop;
// transfer GE — IGETC/Cal-GETC — and the 60-unit / 2.0 ADT standards still come
// from the transfer side). Until a template's `core` is transcribed it stays
// EMPTY, and the engine falls back to the documented articulation-prep
// approximation (see runAudit) — a clearly-flagged placeholder, never a claim.
export interface AdtTemplate {
  major: MajorId;
  degreeType: AdtDegreeType;        // AS-T | AA-T (as the college confers it)
  name: string;                     // "Associate in Science for Transfer — Computer Science"
  totalUnits: number;               // ADT standard: 60 CSU-transferable semester units
  gpaTarget: number;                // ADT standard: 2.0 minimum
  grantsTransferPriority: boolean;  // ADTs grant CSU (and UC, per agreement) transfer priority
  // The official template's lower-division major core. EMPTY = not yet
  // transcribed → engine falls back to the articulation prep. Non-empty = the
  // template takes over the ADT degree audit. required/elective via .required.
  core: MajorPrepReq[];
  meta: DataProvenance;
}

export interface MajorPrepReq {
  id: string;
  label: string;
  options: CourseCode[];
  required: boolean;
  // Select-N group (ASSIST "Select N courses from the following."). Rows that
  // share group.id form ONE requirement: it is met when `count` distinct
  // MEMBERS are complete. A member = one ASSIST receiving course; a member can
  // span several normalized rows (AND-group splits), and every row of a member
  // must be done for that member to count. Rows without `group` keep plain
  // row semantics (each row must be satisfied individually).
  group?: {
    id: string;       // shared by all rows of the group
    label: string;    // student-facing heading, as ASSIST prints it
    count: number;    // members required (e.g. 3 for "select 3 courses")
    memberId: string; // the ASSIST receiving course this row belongs to
  };
}

// "unknown" = we genuinely can't verify this one (foreign credential, data gap) —
// never silently coerced to done or missing (B2). Unknowns surface an escalation
// card with a pre-written question for a human counselor.
export type ReqStatus = "done" | "in-progress" | "missing" | "unknown";

export interface AuditedReq extends MajorPrepReq {
  status: ReqStatus;
  satisfiedBy?: CourseCode;
  inProgressBy?: CourseCode;
}

export interface AuditedArea {
  id: string;
  label: string;
  status: ReqStatus;
  satisfiedBy: string | null; // first completed course counted (kept for single-course areas)
  have: number;               // distinct completed courses counted toward this area
  need: number;               // courses required (GeArea.count, default 1)
  minDepts: number;           // distinct disciplines those courses must span (GeArea.minDistinctDepts, default 1)
  courses: string[];          // all completed course codes counted toward this area
}

// ---- Audit sub-results ----
export interface TransferAudit {
  verdict: "eligible" | "competitive" | "reach";
  impacted: boolean;
  majorPrep: AuditedReq[];
  gePatternId: GePatternId;   // which pattern this audit ran against
  gePatternName: string;      // "Cal-GETC" | "IGETC" — for UI labels
  ge: AuditedArea[];          // areas of the selected transfer GE pattern
  unitsDone: number;          // transferable units completed (incl. exam credit)
  unitsInProgress: number;
  unitsFloor: number;         // UC/CSU 60-unit transfer minimum
  prepDone: number;
  prepInProgress: number;
  prepMissing: number;
  requiredCount: number;
  gpaTarget: number;
}

export type DegreeStatus = "complete" | "on-track" | "off-track";

export interface DegreeAudit {
  track: GradTrack;
  name: string;
  gePatternLabel: string;     // "IGETC" | "ECC GE"
  core: AuditedReq[];
  ge: AuditedArea[];
  coreDone: number;
  coreRequired: number;
  unitsDone: number;
  unitsInProgress: number;
  unitsRequired: number;      // 60
  gpaTarget: number;
  hasGpa: boolean;            // did the student enter a GPA at all
  gpaMet: boolean;            // GPA entered AND at/above target
  grantsTransferPriority: boolean;
  status: DegreeStatus;
}

// ---- Post-transfer upper-division data (at the destination university) ----

// Academic terms a course can be offered in. Quarter schools (UC) use
// fall/winter/spring(/summer); semester schools (CSU) use fall/spring(/summer).
export type Term = "fall" | "winter" | "spring" | "summer";

export interface UpperDivCourse {
  code: string;
  name: string;
  units: number;
  // Courses that must come first, where the catalog names exactly one. Kept
  // flat because that is what every existing caller reads.
  prereqs?: string[];
  // The SAME requirement, in the catalog's own shape: an array of groups, each
  // group being an "any one of these" set. ["MECENG C85", "CIVENG C30"] is one
  // group meaning either satisfies it.
  //
  // Why both exist: `prereqs` can only hold single-course requirements, so a
  // rule like "MECENG C85 or CIVENG C30" had nowhere to go and was DROPPED —
  // flattening it to an AND would have been worse, but the result was a
  // planner that believed MECENG 108 had no prerequisites at all and would
  // happily schedule it first. Verified against Berkeley's catalog 2026-08-20;
  // the same omission ran through Molecular & Cell Biology, Business and
  // Mechanical Engineering.
  //
  // A group whose every member is outside the planning pool is treated as
  // already cleared, exactly as a flat out-of-pool prereq always was.
  prereqGroups?: string[][];
  // How the class has actually been taught, where the university publishes an
  // instruction mode. Carried from the institution catalog so the planner can
  // answer "which of these can I take online" without a second lookup.
  modality?: 'in-person' | 'online' | 'other';
  modalityTerm?: string;        // the term that mode was read from
  everOnline?: boolean;         // taught online at least once in the window
  // Terms this course is offered. ABSENT = offered every term (back-compat:
  // existing data and the upper-div transfer planner ignore this field). The
  // schedule reorganizer honors it so a Fall-only course never lands in Spring.
  offered?: Term[];
}

export interface UpperDivRequirementSet {
  school: SchoolId;
  major: MajorId;
  degreeName: string;        // "B.S. in Business Administration"
  totalUnits: number;        // upper-division units to finish the degree
  confidence: "high" | "medium" | "low";
  // ISO date on which a HUMAN checked these rows against the university's own
  // catalog, course by course. Only ever set alongside confidence 'high', and
  // only when that check actually happened — it is the evidence behind the
  // product dropping its "not yet human-verified" caveat, so setting it
  // without the check is precisely the fabrication PLAN_LOGIC.md forbids.
  verifiedOn?: string;
  notes?: string;
  sources?: string[];
  courses: UpperDivCourse[];
}

// A citation rendered under an audit verdict (A2): which official source the
// numbers derive from, for which catalog year, and how trustworthy the copy is.
export interface SourceCitation extends DataProvenance {
  appliesTo: string;         // "Transfer requirements" | "Degree requirements" | …
  // Present only when this source predates a sending-college course rename
  // that appears in the audited requirement rows. The UI must distinguish
  // "same course, new number" from "the newer agreement has confirmed the
  // articulation" — the former is known from the college crosswalk; the
  // latter remains unknown until ASSIST publishes it.
  renumberingNotice?: {
    effectiveTerm: string;
    targetCatalogYear: string;
    courses: { code: CourseCode; formerCode: CourseCode }[];
  };
}

// One thing the audit could not verify (B2) — paired in the UI with a
// pre-written question the student can hand to a human counselor.
export interface ReviewItem {
  id: string;
  label: string;             // what we couldn't verify
  reason: string;            // why we couldn't verify it
  question: string;          // copy-paste question for the counselor
}

export interface UpperDivAudit {
  degreeName: string;
  schoolName: string;
  totalUnits: number;
  plannedUnits: number;
  electiveUnitsNeeded: number;
  confidence: "high" | "medium" | "low";
  notes?: string;
  terms: TermPlan[];
}

// Multi-term efficiency plan
export interface PlannedCourse {
  code: CourseCode;
  name: string;
  units: number;
  fills: string;
  prereqs?: CourseCode[];     // for drag-and-drop ordering checks in the editable plan
  // What we actually know about the college running this course in the term it
  // landed in. 'offered' = the college lists it (or its published cycle says
  // so); 'unknown' = we hold no evidence either way. A plan row NEVER carries
  // 'not-offered' — the planner refuses to place one — but a student who drags
  // a course into a term themselves can create that, and the board says so.
  offering?: CourseOffering;
  // Set when the planner had to push this course past an earlier term because
  // the college doesn't run it then. Without this the plan just looks oddly
  // ordered; with it, the board can say which term it skipped and why.
  deferredFrom?: { term: string; detail: string };
}

export type CourseOfferingStatus = 'offered' | 'not-offered' | 'unknown';

export interface CourseOffering {
  status: CourseOfferingStatus;
  detail: string | null;    // student-facing sentence, or null when there is nothing honest to say
  pattern: string | null;   // the college's own words for the cycle ("Fall and Spring Only")
}

// ---- Major-switch carry-over: how completed courses count toward a target major ----
export type CarryKind = "major" | "ge" | "elective";

export interface CarryOverItem {
  code: CourseCode;
  name: string;
  units: number;
  kind: CarryKind;
  detail: string;             // "Major prep · Macroeconomics" | "IGETC Area 4 · …" | "Transfers as elective"
  inProgress: boolean;
}

export interface CarryOver {
  major: MajorChoice;
  items: CarryOverItem[];
  countsTowardMajor: number;
  countsTowardGe: number;
  electiveOnly: number;
  unitsApplied: number;       // units counting toward major prep or GE
  unitsElective: number;      // units that transfer but aren't required for this major
  totalCourses: number;
}

export interface TermPlan {
  label: string;              // "Fall 2026"
  courses: PlannedCourse[];
  totalUnits: number;
}

// Ballpark time-to-finish, driven by the units-per-term load (and whether summers are used)
export interface TimeEstimate {
  terms: number;              // terms needed to finish (requirements + reach the unit floor)
  finishTerm: string;         // "Fall 2027"
  durationLabel: string;      // "about 1¼ years"
  usesSummer: boolean;        // normal/heavy loads accelerate with summer terms
  goalVerb: string;           // "transfer-ready" | "graduation-ready"
}

// ---- Counselor insight helpers ----
export interface MajorDifficulty {
  requiredPrepCount: number;
  recommendedPrepCount: number;
  totalPrepUnits: number;     // units across the cheapest required-prep options
  longestChainTerms: number;  // deepest prerequisite chain among prep (min terms forced)
  gateways: string[];         // notable gateway courses (e.g., Calculus, Physics)
  gpaTarget: number;
  impacted: boolean;
}

export interface PrereqStep {
  code: CourseCode;
  name: string;
  done: boolean;
}

export interface PrereqChain {
  reqLabel: string;
  target: CourseCode;
  steps: PrereqStep[];        // ordered prereqs first, ending in the target course
  allClear: boolean;
}

// ─── Proactive guidance (counselor deepening #2/#3) ───
//
// "What I noticed" observations + "Your next move" — both are PURE derivations
// over the audit the engine already produced (BUSINESS_RULES A3: the LLM never
// ranks or decides; it may only relay these). One code path feeds the result
// page AND the chat counselor so the two surfaces can never disagree.

export type ObservationSeverity = 'critical' | 'warning' | 'opportunity' | 'info';
export type ObservationCategory =
  | 'prereq' | 'gpa' | 'impaction' | 'units' | 'credit-loss'
  | 'ge' | 'adt-tag' | 'deadline' | 'needs-review' | 'on-track';

export interface GuidanceLink { label: string; href: string }

export interface Observation {
  id: string;                  // STABLE id, e.g. 'gateway:MATH-190' — drives dedupe, tests, analytics
  category: ObservationCategory;
  severity: ObservationSeverity;
  title: string;               // plain, specific: "MATH-190 is gating 3 later courses"
  detail: string;              // 1–2 sentences, references the student's own data
  groundedIn: string;          // which engine field(s) produced this — REQUIRED, never empty
  action?: string;             // the concrete move, if any (mirrors a NextStep headline)
  cta?: GuidanceLink;          // optional in-app link (catalog, GPA calc, ASSIST, counselor)
  verifyWithCounselor?: boolean; // true for needs-review-derived items (B2)
}

export type NextStepKind =
  | 'verify-with-counselor' | 'meet-deadline' | 'start-prereq-chain'
  | 'register-course' | 'raise-gpa' | 'declare-adt' | 'reach-unit-floor'
  | 'apply' | 'on-track';

export interface NextStep {
  id: string;
  kind: NextStepKind;
  headline: string;            // imperative, ONE action: "Register for MATH-190 this term"
  why: string;                 // the single reason it ranks #1 (the grounding, in plain words)
  dueLabel?: string;           // "Nov 30, 2026 · 21 days left"
  daysLeft?: number;           // present when time-bound (from the deadline)
  links?: GuidanceLink[];
  groundedIn: string;          // REQUIRED
  fromObservationId?: string;  // ties back to the matching Observation
}

export interface AuditResult {
  goal: GoalId;
  transfer: TransferAudit | null;
  degree: DegreeAudit | null;
  termPlan: TermPlan[];
  electiveUnitsNeeded: number; // units shy of the degree floor after planned courses
  upperDiv: UpperDivAudit | null; // post-transfer plan at the destination
  carryOver: CarryOver | null; // how already-taken courses count toward the target major
  estimate: TimeEstimate | null; // ballpark time to finish, by term load
  difficulty: MajorDifficulty | null; // transparent prep-difficulty profile for the major
  prereqChains: PrereqChain[]; // prerequisite "unlock maps" for required prep
  warnings: string[];
  needsReview: ReviewItem[];   // things we explicitly could not verify (B2)
  sources: SourceCitation[];   // citations for the data behind this audit (A2)
  dataVersion: string;         // snapshot id of the requirement data used (A1/F3)
}

export interface Course {
  code: CourseCode;
  name: string;
  dept: string;
  units: number;
  igetc: string[];            // IGETC area ids satisfied
  calgetc: string[];          // Cal-GETC area ids satisfied (separate id space — e.g.
                              // ethnic studies is IGETC 7 but Cal-GETC 6)
  eccge: string[];            // ECC local GE area ids satisfied
  prereqs?: CourseCode[];
  // The number this course used to carry, when the college has renumbered it
  // (California's AB 1111 Common Course Numbering). `code` is always what the
  // college publishes TODAY — what a student will actually find in the class
  // search — and this is the number their older transcript, saved plan or
  // shared link still says. Absent for a course that has never been renumbered.
  formerCode?: CourseCode;
  // The college-published term when formerCode changed to code. Keeping this
  // beside the alias lets the audit compare that transition with the exact
  // agreement year it is using, without relying on today's wall-clock date.
  formerCodeEffectiveTerm?: string;
}

// ─── Live class sections (the schedule builder; endgoal "Registration copilot") ───
//
// A section is ONE offering of a course in a term — the thing a student
// actually registers for (a CRN). Section data is a versioned per-college,
// per-term snapshot (src/data/schedules/<college>.<term>.ts) generated by
// scripts/ingest from the public schedule source (ECC publishes its schedule
// as public PDFs + a public guest course search on selfservice.elcamino.edu —
// no portal credentials involved, same data posture as the ASSIST pipeline).
//
// Honest seat states (B2): some sections don't publish counts ("Seat Counts
// Unavailable"), some are open with seats, some are waitlist-only. The engine
// and UI treat each state exactly as published — never invented, never rolled
// forward to a future term.

export type SectionModality = 'in-person' | 'online-sync' | 'online-async' | 'hybrid';
// 'open' = seats available · 'waitlisted' = full, queue open ·
// 'closed' = no enrollment · 'counts-unavailable' = published without counts ·
// 'unlimited' = no published cap.
export type SectionAvailability = 'open' | 'waitlisted' | 'closed' | 'counts-unavailable' | 'unlimited';

// ONE published meeting block of a section. A section commonly has more than
// one (a lecture plus a lab, or a Tuesday lecture plus a Thursday lab), and
// EVERY block occupies the student's calendar — so the conflict check must see
// all of them. Keeping only the first block is how a schedule builder tells a
// student two overlapping classes "don't conflict".
export interface SectionMeeting {
  days: string;               // "MWF" / "TTh" / "S"; "" when there is no fixed day
  startTime: string;          // "08:00" 24h; "" when unscheduled (async)
  endTime: string;            // "09:15" 24h; "" when unscheduled
  location: string | null;    // "MBA 201" / "ONLINE"; null = TBD
  kind: string;               // published block kind: "LEC" | "LAB" | "XLAB" | …
}

export interface CourseSection {
  term: string;               // "Fall 2026" — the term this section runs in
  crn: string;                // registration ID (unique within the term)
  code: CourseCode;           // catalog code the section belongs to ("MATH 190")
  name: string;               // section name as published (may differ from catalog)
  modality: SectionModality;
  // Every published meeting block, in published order. Empty for a fully
  // asynchronous online section (nothing occupies the calendar).
  meetings: SectionMeeting[];
  instructor: string | null;  // as printed ("S Potter"); null = TBD/not published
  availability: SectionAvailability;
  seatsAvailable: number | null; // null when counts aren't published
  seatsTotal: number | null;
  waitlistCount: number | null;  // null when not published
  // Sections the college REQUIRES be taken together ("LINKED with corequisite
  // support — must take with section 0070"). A registration kit that hands out
  // one without the other hands out an invalid schedule.
  linkedCrns: string[];
  // Published enrollment restriction ("RESERVED: FYE students only"), or null
  // when the section is open to any student. Restricted sections are excluded
  // from schedule options by default rather than silently offered.
  restriction: string | null;
  // Short-term / late-start sections publish their own date range
  // ("meets from Oct. 19 to Dec. 12"); null = full term.
  dateRange: string | null;
  notes: string[];            // other published notes, verbatim
  meta: DataProvenance;       // which schedule snapshot this came from
}

// A conflict-free choice of one section per planned course — the output of the
// schedule builder, and the payload the registration kit carries to the portal.
export interface ScheduleOption {
  term: string;
  sections: CourseSection[];  // one per placed course, verified non-overlapping
  totalUnits: number;
  // Corequisite sections the college requires alongside a chosen section. The
  // registration kit must carry these too — a CRN list that silently omits a
  // mandatory linked section is a schedule that won't register.
  linkedCrns: string[];
  // Planned courses this option could NOT place (empty for a full schedule).
  // A partial option is offered honestly rather than withheld.
  unplacedCodes: CourseCode[];
  // Why the engine ranked this option where it did — surfaces the reasoning
  // the same way verdicts carry citations.
  notes: string[];
}

// ─── Professor ratings (Section Scout signal) ──────────────────────────────
//
// One signal among several — NEVER the foundation, and never invented. There
// is no official RateMyProfessors API and scraping it is TOS-gray, so this
// registry stays EMPTY until a real licensed feed is contracted: the type and
// the engine seam exist so that feed can drop in, not so placeholder numbers
// can. A rating that is not published is an honest unknown, and a section
// whose instructor has no rating is scored on the signals it DOES carry.
export interface ProfessorRating {
  collegeId: string;          // which college's instructor this is
  name: string;               // normalized instructor name (lowercase, trimmed)
  rating: number | null;      // overall quality 0–5 (null if unpublished)
  difficulty: number | null;  // 0–5 (null if unpublished)
  wouldRetakePct: number | null; // % who'd take again, when published
  sampleSize: number | null;  // number of reviews behind the rating
  meta: DataProvenance;
}

export interface GeArea {
  id: string;
  label: string;
  description: string;
  count?: number;            // courses required to satisfy this area (default 1)
  minDistinctDepts?: number; // distinct disciplines those courses must span (default 1)
  appliesTo?: "UC" | "CSU";  // area only required for this system (e.g. IGETC 1C is
                             // CSU-only); undefined = required for both
}

// Which academic calendar a campus runs. NOT derivable from `system`: UC
// Berkeley and UC Merced run semesters while every other UC runs quarters, and
// assuming otherwise offers a student terms their campus does not have.
export type Calendar = "quarter" | "semester";

export interface SchoolMeta {
  id: SchoolId;
  name: string;
  shortName: string;
  system: "UC" | "CSU";
  // Omitted = the system default (UC quarter, CSU semester). Set explicitly,
  // with a source, for any campus that differs.
  calendar?: Calendar;
  ready: boolean;
  city?: string;            // display-only; omitted for staged campuses (not fabricated)
  state?: string;
}

export interface MajorMeta {
  id: MajorId;
  name: string;
  icon: string;
  // Campuses that do NOT offer this major, with the VERIFIED closest offered
  // match (SPEC_MAJOR_SWITCH). Drives the explorer's not-offered rows from
  // data, never UI branches; a row must NEVER silently substitute one major
  // for another — the closest match is surfaced by name, and when its
  // articulation is wired under this major's key the audit is explicitly
  // labeled as the closest-match program. closestMajorId links another matrix
  // row when the closest match IS one of the modeled majors; null otherwise.
  notOfferedAt?: Partial<Record<SchoolId, {
    closestMajorId: MajorId | null;
    closestName: string;   // exact program name at the campus (e.g. "Media and Cultural Studies, B.A.")
    note: string;          // one-line student-facing explanation
  }>>;
}

// Course grouping for the Coursework step
export interface CourseGroup {
  id: string;
  label: string;
  highlight: boolean;
  courses: Course[];
}

// ─── Scholarship scanner (SCH-1) ───
//
// Matching is deterministic and runs ONLY on academic facts already in the
// profile (major, GPA, units, enrollment college, status). Criteria the
// product deliberately does not collect — financial need, residency, age,
// memberships (C1: no SSN/DOB/FAFSA data in V1) — are surfaced as explicit
// self-checks, never silently assumed met or unmet (B2).

// A criterion the engine CAN evaluate from the profile/audit.
export interface ScholarshipCheck {
  kind: "gpa-min" | "major" | "college" | "min-units" | "enrolled";
  label: string;              // student-facing, e.g. "3.5+ GPA"
  gpaMin?: number;            // kind: gpa-min
  majors?: MajorId[];         // kind: major
  college?: CollegeId;        // kind: college
  minUnits?: number;          // kind: min-units (completed transferable units)
}

// A criterion the engine deliberately CANNOT evaluate — the student confirms.
export interface ScholarshipSelfCheck {
  id: string;
  label: string;              // e.g. "Demonstrated financial need"
}

export interface Scholarship {
  id: string;
  name: string;
  sponsor: string;
  amountLabel: string;        // display only — e.g. "up to $55,000 / year"
  blurb: string;
  deadlineMonth: number;      // 1–12, typical annual cycle
  deadlineDay: number;
  deadlineNote?: string;      // e.g. "typical cycle — confirm on the official site"
  checks: ScholarshipCheck[];
  selfChecks: ScholarshipSelfCheck[];
  sourceUrl: string;          // official site, top-level domain (deep links rot)
}

export interface ScholarshipCheckResult extends ScholarshipCheck {
  status: ReqStatus;          // done = met, missing = not met, unknown = can't verify
  detail?: string;            // e.g. "your 3.1 GPA is below the 3.5 minimum"
}

// B1-safe fit language: "matches" describes the profile against published
// criteria — never an award prediction. 'check' = a checkable fact is missing
// (usually GPA); 'not-yet' = a published criterion isn't met today.
export type ScholarshipFit = "matches" | "check" | "not-yet";

export interface ScholarshipMatch {
  scholarship: Scholarship;
  fit: ScholarshipFit;
  checks: ScholarshipCheckResult[];
  selfChecks: ScholarshipSelfCheck[];
  nextDeadline: string;       // local calendar date of the next occurrence, "YYYY-MM-DD"
  dateLabel: string;          // "Dec 1, 2026"
  daysLeft: number;
}
