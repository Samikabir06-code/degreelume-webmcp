import type { MajorMeta } from '../types';

// 13 modeled majors: the V1 trio + the 10-major expansion (authorized
// 2026-07-03; SPEC_MAJOR_SWITCH_2026-07-03.md). Names are the persona labels;
// each campus's EXACT program name lives with its requirement set / facts.
//
// notOfferedAt: verified against UCR's majors list (updated May 2026) + the
// ASSIST 2025-26 enumeration (2026-07-03) — UCR does not offer Civil
// Engineering, Communication Studies, or Kinesiology. The closest offered
// match is surfaced BY NAME (never silently substituted); its articulation is
// wired under this major's (ecc|ucr|<major>) key and labeled as the
// closest-match program. closestMajorId links a real matrix row where the
// closest match is itself a modeled major.
//
// 2026-07-06 (all-college expansion): the same not-offered handling verified
// against the ASSIST 2025-26 major enumerations for UCLA / UCI / UCSD —
// UCLA offers no Kinesiology (closest: Physiological Science, B.S.);
// UCI offers no Communication Studies (closest: Film and Media Studies, B.A.)
// and no Kinesiology (closest with established articulation: Public Health
// Sciences, B.S. — the newer Physiology and Exercise Sciences, B.S. has no
// ASSIST articulation yet); UCSD offers no Civil Engineering (closest:
// Structural Engineering, B.S.) and no Kinesiology (closest: Public Health,
// B.S.). Each closest-match articulation is wired under the not-offered
// major's own key per college and labeled in the facts manifests via the
// explicit `agreement` field.
export const MAJORS: MajorMeta[] = [
  {
    id: "business",
    name: "Business Administration",
    icon: "briefcase",
  },
  {
    id: "cs",
    name: "Computer Science",
    icon: "code",
  },
  {
    id: "psych",
    name: "Psychology",
    icon: "brain",
  },
  {
    id: "civil",
    name: "Civil Engineering",
    icon: "hard-hat",
    notOfferedAt: {
      ucr: {
        closestMajorId: "mech",
        closestName: "Environmental Engineering, B.S.",
        note: "UCR doesn't offer Civil Engineering — closest offered programs are Environmental Engineering, B.S. (wired here) and Mechanical Engineering, B.S. (its own row).",
      },
      "uc-san-diego": {
        closestMajorId: "mech",
        closestName: "Structural Engineering, B.S.",
        note: "UC San Diego doesn't offer Civil Engineering — its closest offered program is Structural Engineering, B.S. (wired here as the explicit closest match); Mechanical Engineering, B.S. is its own row.",
      },
    },
  },
  {
    id: "mech",
    name: "Mechanical Engineering",
    icon: "cog",
  },
  {
    id: "ee",
    name: "Electrical Engineering",
    icon: "zap",
  },
  {
    id: "bio",
    name: "Biology",
    icon: "dna",
    notOfferedAt: {
      "uc-berkeley": {
        closestMajorId: null,
        closestName: "Molecular and Cell Biology, B.A.",
        note: "Berkeley has no major called Biology — Molecular and Cell Biology, B.A. is wired here as the closest match. Its whole-organism counterpart, Integrative Biology, B.A., is the other half of Berkeley biology (same college, same 3.0 floor); both articulate from El Camino, so choose by what you want to study.",
      },
    },
  },
  {
    id: "econ",
    name: "Economics",
    icon: "trending-up",
  },
  {
    id: "soc",
    name: "Sociology",
    icon: "users",
  },
  {
    id: "polisci",
    name: "Political Science",
    icon: "landmark",
  },
  {
    id: "comm",
    name: "Communication Studies",
    icon: "megaphone",
    notOfferedAt: {
      ucr: {
        closestMajorId: null,
        closestName: "Media and Cultural Studies, B.A.",
        note: "UCR doesn't offer Communication Studies — the closest offered program is Media and Cultural Studies, B.A. (wired here as the explicit closest match).",
      },
      uci: {
        closestMajorId: null,
        closestName: "Film and Media Studies, B.A.",
        note: "UC Irvine doesn't offer Communication Studies — the closest offered program is Film and Media Studies, B.A. (wired here as the explicit closest match).",
      },
    },
  },
  {
    id: "math",
    name: "Mathematics",
    icon: "sigma",
  },
  {
    id: "kin",
    name: "Kinesiology",
    icon: "activity",
    notOfferedAt: {
      ucr: {
        closestMajorId: "bio",
        closestName: "Global and Community Health, B.A.",
        note: "UCR doesn't offer Kinesiology — closest offered programs are Global and Community Health, B.A. (wired here) and Biology, B.A./B.S. (its own row).",
      },
      ucla: {
        closestMajorId: "bio",
        closestName: "Physiological Science, B.S.",
        note: "UCLA doesn't offer Kinesiology — the closest offered program is Physiological Science, B.S. (wired here as the explicit closest match); Biology, B.S. is its own row.",
      },
      uci: {
        closestMajorId: "bio",
        closestName: "Public Health Sciences, B.S.",
        note: "UC Irvine doesn't offer Kinesiology — the closest offered program with established articulation is Public Health Sciences, B.S. (wired here as the explicit closest match; UCI's newer Physiology and Exercise Sciences, B.S. has no ASSIST articulation yet); Biological Sciences, B.S. is its own row.",
      },
      "uc-san-diego": {
        closestMajorId: "bio",
        closestName: "Public Health, B.S.",
        note: "UC San Diego doesn't offer Kinesiology — the closest offered program is Public Health, B.S. (wired here as the explicit closest match; a UCSD selective major); Biology: General Biology, B.S. is its own row.",
      },
      "uc-berkeley": {
        closestMajorId: "bio",
        closestName: "Public Health, B.A.",
        note: "UC Berkeley doesn't offer Kinesiology or any exercise-science major — the nearest offered program is Public Health, B.A. (wired here as the explicit closest match). It is a population-health degree, not a movement-science one, so check it against what you actually want; Molecular and Cell Biology, B.A. is its own row.",
      },
    },
  },
];

export const getMajor = (id: string) => MAJORS.find((m) => m.id === id);
