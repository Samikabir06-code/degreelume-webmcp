import type { CollegeId, Course, GeArea } from '../types';
import { ECC_COURSES } from './courses';
import { ECC_GE_AREAS } from './eccge';

// Community-college registry. In the main product this table carries 20
// colleges; this build covers ONE by design (docs/PLAN.md) — El Camino, the
// college whose catalog and ASSIST agreements the data slice holds. The shape
// is the main product's, so `liveRequirements.ts` resolves a college here
// exactly as it does there: a college is a row, not a code path.
export interface CollegeMeta {
  id: CollegeId;
  name: string;
  shortName: string;
  ready: boolean;            // catalog + GE data verified for it?
  catalog: Course[];
  localGeAreas: GeArea[];    // the college's own GE pattern (local AA/AS degrees)
  // First escalation target for "ask a human" hand-offs. Never fabricated —
  // read from the official Transfer Center page.
  transferCenter?: {
    name: string;
    url: string;
    email?: string;
    phone?: string;
    hours?: string;
  };
}

export const COLLEGES: CollegeMeta[] = [
  {
    id: 'ecc',
    name: 'El Camino College',
    shortName: 'ECC',
    ready: true,
    catalog: ECC_COURSES,
    localGeAreas: ECC_GE_AREAS,
    // Read from the official Transfer Center page. No voicemail on the line —
    // call back if busy; email replies take 2–3 business days.
    transferCenter: {
      name: 'El Camino College Transfer Center',
      url: 'https://www.elcamino.edu/academics/transfer-center/',
      email: 'transfercenter@elcamino.edu',
      phone: '310-660-3593 ext. 3408',
      hours: 'Mon–Thu 9am–5pm (closed Friday)',
    },
  },
];

export const DEFAULT_COLLEGE_ID: CollegeId = 'ecc';

export const getCollege = (id: CollegeId) => COLLEGES.find((c) => c.id === id);
