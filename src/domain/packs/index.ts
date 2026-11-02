/**
 * Built-in class timetables (owner, collage pass: "a built-in table for each section, so a classmate picks
 * DRB2603 · Section B in the onboarding instead of typing every subject and class").
 *
 * Each pack is a `margin/2` timetable file — exactly what Settings → Data → Share timetable writes — bundled
 * with the app. Importing one is the ordinary merge-only import (upsert by id, never delete), so a pack can be
 * applied on top of a planner that already has data, and applied twice without doubling anything.
 *
 * To add one: set the section's timetable up once in the app, Share timetable, drop the file in this folder as
 * `<program>-<section>.json`, and add an entry below. Ids inside a pack must be unique to it (an export's ids
 * already are).
 */
import { drb2503 } from './drb2503';

export interface Pack { id: string; program: string; section: string; title: string; data: () => unknown }

export const PACKS: Pack[] = (['A', 'B', 'C'] as const).map((sec) => ({ id: `drb2503-${sec.toLowerCase()}`, program: 'DRB2503', section: sec, title: `DRB2503 · Section ${sec}`, data: () => drb2503(sec) }));

export const programs = (packs: readonly Pack[] = PACKS) => [...new Set(packs.map((p) => p.program))];
export const sectionsOf = (program: string, packs: readonly Pack[] = PACKS) => packs.filter((p) => p.program === program);
export const packById = (id: string, packs: readonly Pack[] = PACKS) => packs.find((p) => p.id === id) ?? null;
