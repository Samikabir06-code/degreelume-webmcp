import type { CollegeId, SchoolId } from '../types';

// Where each of our institutions runs Canvas — audited 2026-08-17.
//
// The student picks their school from a list; they never type a hostname.
// That is only safe if every host here is genuinely that school's Canvas, and
// "a Canvas exists at this slug" is NOT that: `pasadena.instructure.com` is
// Pasadena Unified School District, `canyons.instructure.com` is a K-12
// ClassLink tenant, `yccd.instructure.com` is Yuba CCD not Yosemite CCD. A
// student pasting a real token into the wrong school's Canvas just gets a
// confusing 401 — but we would have told them it was theirs.
//
// So every row carries the proof that earned it. Two facts had to hold:
//
//   1. It IS Canvas: an unauthenticated GET /api/v1/accounts returns HTTP 401
//      with {"errors":[{"message":"user authorisation required"}]} — Canvas's
//      own signature, on every instance in the world and nothing else.
//   2. It is THIS school's Canvas, proven by something only the school
//      controls — one of:
//        idp     GET /login/saml redirects to an identity provider on the
//                school's own domain (signon.elcamino.edu, idp.csudh.edu …)
//                or a vendor tenant named for it (cerritos.onbio-key.com).
//        tenant  the SAML redirect goes to login.microsoftonline.com/<GUID>
//                and the school's own .edu domain resolves to that same GUID
//                via the public openid-configuration endpoint.
//        dns     the host is on the school's own domain (canvas.csudh.edu),
//                or a school-owned host redirects onto it (canvas.sdsu.edu →
//                sdsu.instructure.com).
//        site    the school's own website links the host.
//
// Where a district runs one Canvas for several colleges (SOCCCD, Coast CCD,
// LACCD, VCCCD, Yosemite CCD), the college-branded alias is listed when one
// exists and resolves to the SAME root account; otherwise the district host.
//
// Re-run `node scripts/audit-canvas-hosts.mjs` when a college migrates. Add a
// row only with a proof; never from the slug alone.

export type CanvasProof = 'idp' | 'tenant' | 'dns' | 'site';

export interface CanvasInstitution {
  // The registry id this row belongs to — a sending college or a destination
  // university. A student can be at either (a CSU student connects their CSU).
  id: CollegeId | SchoolId;
  kind: 'college' | 'university';
  name: string;
  host: string;
  proof: CanvasProof;
  // The thing that proved ownership, in the terms above.
  evidence: string;
  verifiedOn: string; // ISO date of the audit run
}

const ON = '2026-08-17';

export const CANVAS_INSTITUTIONS: CanvasInstitution[] = [
  // ── Community colleges ──
  { id: 'ecc',                    kind: 'college', name: 'El Camino College',            host: 'elcamino.instructure.com',      proof: 'idp',    evidence: '/login/saml → signon.elcamino.edu; elcamino.edu links it', verifiedOn: ON },
  { id: 'pasadena-city',          kind: 'college', name: 'Pasadena City College',        host: 'pcc.instructure.com',           proof: 'tenant', evidence: 'MS tenant = pasadena.edu (pasadena.instructure.com is Pasadena USD, K-12)', verifiedOn: ON },
  { id: 'de-anza',                kind: 'college', name: 'De Anza College',              host: 'deanza.instructure.com',        proof: 'idp',    evidence: '/login/saml → ssoshib.fhda.edu', verifiedOn: ON },
  { id: 'santa-monica',           kind: 'college', name: 'Santa Monica College',         host: 'smc.instructure.com',           proof: 'tenant', evidence: 'MS tenant = smc.edu', verifiedOn: ON },
  { id: 'mt-sac',                 kind: 'college', name: 'Mount San Antonio College',    host: 'mtsac.instructure.com',         proof: 'site',   evidence: 'mtsac.edu links it; /login/saml → sso.cccmypath.org (CCC statewide SSO)', verifiedOn: ON },
  { id: 'diablo-valley',          kind: 'college', name: 'Diablo Valley College',        host: 'dvc.instructure.com',           proof: 'idp',    evidence: '/login/saml → pg.4cd.edu; dvc.edu says "visit dvc.instructure.com"; same root account as 4cd.instructure.com', verifiedOn: ON },
  { id: 'east-la',                kind: 'college', name: 'East Los Angeles College',     host: 'ilearn.laccd.edu',              proof: 'dns',    evidence: 'LACCD-owned host (one Canvas for all nine LACCD colleges)', verifiedOn: ON },
  { id: 'fullerton-college',      kind: 'college', name: 'Fullerton College',            host: 'fullcoll.instructure.com',      proof: 'idp',    evidence: '/login/saml → login.nocccd.edu (fullerton.instructure.com is a Google-SSO K-12 tenant)', verifiedOn: ON },
  { id: 'la-pierce',              kind: 'college', name: 'Los Angeles Pierce College',   host: 'ilearn.laccd.edu',              proof: 'dns',    evidence: 'LACCD-owned host (one Canvas for all nine LACCD colleges)', verifiedOn: ON },
  { id: 'orange-coast',           kind: 'college', name: 'Orange Coast College',         host: 'coastdistrict.instructure.com', proof: 'site',   evidence: 'orangecoastcollege.edu links it; MS tenant = cccd.edu; district-wide instance (orangecoastcollege.instructure.com is a separate, unlinked instance)', verifiedOn: ON },
  { id: 'long-beach-city',        kind: 'college', name: 'Long Beach City College',      host: 'lbcc.instructure.com',          proof: 'tenant', evidence: 'MS tenant = lbcc.edu', verifiedOn: ON },
  { id: 'irvine-valley',          kind: 'college', name: 'Irvine Valley College',        host: 'ivc.instructure.com',           proof: 'tenant', evidence: 'MS tenant = ivc.edu/socccd.edu; same root account as socccd.instructure.com', verifiedOn: ON },
  { id: 'moorpark',               kind: 'college', name: 'Moorpark College',             host: 'vcccd.instructure.com',         proof: 'site',   evidence: 'moorparkcollege.edu: "Login to Canvas directly through https://vcccd.instructure.com"', verifiedOn: ON },
  { id: 'chaffey',                kind: 'college', name: 'Chaffey College',              host: 'chaffey.instructure.com',       proof: 'idp',    evidence: '/login/saml → chaffey.ondemandlogin.com (vendor tenant named for the college)', verifiedOn: ON },
  { id: 'cerritos',               kind: 'college', name: 'Cerritos College',             host: 'cerritos.instructure.com',      proof: 'idp',    evidence: '/login/saml → cerritos.onbio-key.com (vendor tenant named for the college)', verifiedOn: ON },
  { id: 'college-of-the-canyons', kind: 'college', name: 'College of the Canyons',       host: 'coc.instructure.com',           proof: 'idp',    evidence: '/login/saml → portalguard.canyons.edu (canyons.instructure.com is a ClassLink K-12 tenant)', verifiedOn: ON },
  { id: 'riverside-city',         kind: 'college', name: 'Riverside City College',       host: 'rccd.instructure.com',          proof: 'site',   evidence: 'rcc.edu homepage links it; MS tenant = rccd.edu (rcc.instructure.com is a separate RCCD instance)', verifiedOn: ON },
  { id: 'saddleback',             kind: 'college', name: 'Saddleback College',           host: 'saddleback.instructure.com',    proof: 'tenant', evidence: 'MS tenant = saddleback.edu/socccd.edu; its own root account (not the IVC/socccd one)', verifiedOn: ON },
  { id: 'sierra',                 kind: 'college', name: 'Sierra College',               host: 'sierra.instructure.com',        proof: 'tenant', evidence: 'MS tenant = sierracollege.edu', verifiedOn: ON },
  { id: 'modesto-junior',         kind: 'college', name: 'Modesto Junior College',       host: 'yosemite.instructure.com',      proof: 'tenant', evidence: 'MS tenant = yosemite.edu/mjc.edu (yccd.instructure.com is a different tenant — Yuba CCD)', verifiedOn: ON },

  // ── Universities ──
  { id: 'ucr',                    kind: 'university', name: 'UC Riverside',              host: 'elearn.ucr.edu',                proof: 'dns',    evidence: 'UCR-owned host', verifiedOn: ON },
  { id: 'uci',                    kind: 'university', name: 'UC Irvine',                 host: 'canvas.eee.uci.edu',            proof: 'dns',    evidence: 'UCI-owned host', verifiedOn: ON },
  { id: 'ucla',                   kind: 'university', name: 'UC Los Angeles',            host: 'bruinlearn.ucla.edu',           proof: 'dns',    evidence: 'UCLA-owned host', verifiedOn: ON },
  { id: 'uc-berkeley',            kind: 'university', name: 'UC Berkeley',               host: 'bcourses.berkeley.edu',         proof: 'dns',    evidence: 'Berkeley-owned host', verifiedOn: ON },
  { id: 'uc-davis',               kind: 'university', name: 'UC Davis',                  host: 'canvas.ucdavis.edu',            proof: 'dns',    evidence: 'UC Davis-owned host', verifiedOn: ON },
  { id: 'uc-merced',              kind: 'university', name: 'UC Merced',                 host: 'catcourses.ucmerced.edu',       proof: 'dns',    evidence: 'UC Merced-owned host; ucmerced.instructure.com → shib.ucmerced.edu', verifiedOn: ON },
  { id: 'uc-san-diego',           kind: 'university', name: 'UC San Diego',              host: 'canvas.ucsd.edu',               proof: 'dns',    evidence: 'UCSD-owned host; ucsd.instructure.com → a5.ucsd.edu', verifiedOn: ON },
  { id: 'uc-santa-barbara',       kind: 'university', name: 'UC Santa Barbara',          host: 'ucsb.instructure.com',          proof: 'idp',    evidence: '/login/saml → passport.identity.ucsb.edu', verifiedOn: ON },
  { id: 'uc-santa-cruz',          kind: 'university', name: 'UC Santa Cruz',             host: 'canvas.ucsc.edu',               proof: 'dns',    evidence: 'UCSC-owned host; ucsc.instructure.com → login.ucsc.edu', verifiedOn: ON },
  { id: 'csulb',                  kind: 'university', name: 'Cal State Long Beach',      host: 'csulb.instructure.com',         proof: 'tenant', evidence: 'MS tenant = csulb.edu', verifiedOn: ON },
  { id: 'csudh',                  kind: 'university', name: 'Cal State Dominguez Hills', host: 'canvas.csudh.edu',              proof: 'dns',    evidence: 'CSUDH-owned host; /login/saml → idp.csudh.edu; csudh.instructure.com redirects to it', verifiedOn: ON },
  { id: 'csula',                  kind: 'university', name: 'Cal State Los Angeles',     host: 'calstatela.instructure.com',    proof: 'dns',    evidence: 'canvas.calstatela.edu redirects to it; MS tenant = calstatela.edu', verifiedOn: ON },
  { id: 'csu-bakersfield',        kind: 'university', name: 'CSU Bakersfield',           host: 'csub.instructure.com',          proof: 'dns',    evidence: 'canvas.csub.edu redirects to it; MS tenant = csub.edu', verifiedOn: ON },
  { id: 'csu-channel-islands',    kind: 'university', name: 'CSU Channel Islands',       host: 'cilearn.csuci.edu',             proof: 'dns',    evidence: 'CSUCI-owned host; csuci.instructure.com → mckinley.csuci.edu', verifiedOn: ON },
  { id: 'csu-chico',              kind: 'university', name: 'CSU Chico',                 host: 'canvas.csuchico.edu',           proof: 'dns',    evidence: 'Chico-owned host', verifiedOn: ON },
  { id: 'csu-east-bay',           kind: 'university', name: 'CSU East Bay',              host: 'csueb.instructure.com',         proof: 'idp',    evidence: '/login/saml → vince.csueastbay.edu', verifiedOn: ON },
  { id: 'csu-fresno',             kind: 'university', name: 'CSU Fresno',                host: 'fresnostate.instructure.com',   proof: 'site',   evidence: 'fresnostate.edu links it (3 pages)', verifiedOn: ON },
  { id: 'csu-fullerton',          kind: 'university', name: 'CSU Fullerton',             host: 'csufullerton.instructure.com',  proof: 'dns',    evidence: 'canvas.fullerton.edu redirects to it; /login/saml → shibboleth.fullerton.edu', verifiedOn: ON },
  { id: 'cal-poly-humboldt',      kind: 'university', name: 'Cal Poly Humboldt',         host: 'canvas.humboldt.edu',           proof: 'dns',    evidence: 'Humboldt-owned host', verifiedOn: ON },
  { id: 'csu-monterey-bay',       kind: 'university', name: 'CSU Monterey Bay',          host: 'csumb.instructure.com',         proof: 'idp',    evidence: '/login/saml → csumb.okta.com', verifiedOn: ON },
  { id: 'csu-northridge',         kind: 'university', name: 'CSU Northridge',            host: 'canvas.csun.edu',               proof: 'dns',    evidence: 'CSUN-owned host', verifiedOn: ON },
  { id: 'cal-poly-pomona',        kind: 'university', name: 'Cal Poly Pomona',           host: 'canvas.cpp.edu',                proof: 'dns',    evidence: 'CPP-owned host; cpp.instructure.com → idp.cpp.edu', verifiedOn: ON },
  { id: 'csu-sacramento',         kind: 'university', name: 'CSU Sacramento',            host: 'csus.instructure.com',          proof: 'dns',    evidence: 'canvas.csus.edu redirects to it; then → idp.csus.edu', verifiedOn: ON },
  { id: 'csu-san-bernardino',     kind: 'university', name: 'CSU San Bernardino',        host: 'csusb.instructure.com',         proof: 'idp',    evidence: '/login/saml → idp.csusb.edu', verifiedOn: ON },
  { id: 'san-diego-state',        kind: 'university', name: 'San Diego State',           host: 'sdsu.instructure.com',          proof: 'dns',    evidence: 'canvas.sdsu.edu redirects to it; MS tenant = sdsu.edu', verifiedOn: ON },
  { id: 'sf-state',               kind: 'university', name: 'San Francisco State',       host: 'sfsu.instructure.com',          proof: 'tenant', evidence: 'MS tenant = sfsu.edu', verifiedOn: ON },
  { id: 'san-jose-state',         kind: 'university', name: 'San José State',            host: 'sjsu.instructure.com',          proof: 'idp',    evidence: '/login/saml → sjsu.okta.com', verifiedOn: ON },
  { id: 'cal-poly-slo',           kind: 'university', name: 'Cal Poly San Luis Obispo',  host: 'canvas.calpoly.edu',            proof: 'dns',    evidence: 'Cal Poly-owned host; calpoly.instructure.com → idp.calpoly.edu', verifiedOn: ON },
  { id: 'csu-san-marcos',         kind: 'university', name: 'CSU San Marcos',            host: 'csusm.instructure.com',         proof: 'dns',    evidence: 'cougarcourses.csusm.edu redirects to it; MS tenant = csusm.edu', verifiedOn: ON },
  { id: 'sonoma-state',           kind: 'university', name: 'Sonoma State',              host: 'canvas.sonoma.edu',             proof: 'dns',    evidence: 'Sonoma-owned host; sonoma.instructure.com MS tenant = sonoma.edu', verifiedOn: ON },
  { id: 'csu-stanislaus',         kind: 'university', name: 'CSU Stanislaus',            host: 'csustan.instructure.com',       proof: 'idp',    evidence: '/login/saml → idp.csustan.edu; canvas.csustan.edu redirects to it', verifiedOn: ON },
];

// Every host a token may be sent to. The Worker refuses anything else — this
// is what stops a student's token being pointed at an arbitrary server.
export const CANVAS_HOSTS: ReadonlySet<string> = new Set(CANVAS_INSTITUTIONS.map((i) => i.host));

export const canvasInstitutionFor = (id: string): CanvasInstitution | undefined =>
  CANVAS_INSTITUTIONS.find((i) => i.id === id);

export const canvasInstitutionByHost = (host: string): CanvasInstitution | undefined =>
  CANVAS_INSTITUTIONS.find((i) => i.host === host);
