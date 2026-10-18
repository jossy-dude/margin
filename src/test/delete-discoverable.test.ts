/**
 * v0.2 — every delete is findable, not a bare trash icon you have to guess at.
 *
 * Jossy's report (2026-10-19): "i wrote economic instead of introduction to economic so i cant
 * delete the old one… add a delete feature for all data." The delete DID exist — a trash-icon-only
 * ghost button in each edit sheet's footer — but an icon with no label is invisible to someone who
 * does not already know it is there.
 *
 * This file pins that every edit sheet's footer delete carries a VISIBLE `label`, not just an
 * `a11y` string. The a11y label is for TalkBack; the visible label is what makes the control
 * discoverable in the first place.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const forms = readFileSync(join(__dirname, '../sheets/forms.tsx'), 'utf8');

/** The footer expression of a form, so a delete in the body is not mistaken for the footer's.
 *  Extracted from `footer=` up to the `</Row>` that closes it. */
const footerOf = (name: string) => {
  const i = forms.indexOf(`export function ${name}`);
  expect(i).toBeGreaterThan(-1);
  const next = forms.indexOf('export function ', i + 10);
  const body = forms.slice(i, next > -1 ? next : forms.length);
  const f = body.indexOf('footer=');
  expect(f).toBeGreaterThan(-1);
  const end = body.indexOf('</Row>', f);
  return body.slice(f, end > -1 ? end : body.length);
};

/** Every form that can delete an existing record. */
const EDIT_SHEETS: [string, string][] = [
  ['TaskSheet', 'Delete'],
  ['CourseSheet', 'Delete subject'],
  ['MeetingSheet', 'Delete class'],
  ['MarkSheet', 'Delete mark'],
  ['NoticeSheet', 'Delete note'],
];

describe('every edit sheet footer delete is labelled, not icon-only', () => {
  for (const [name, a11y] of EDIT_SHEETS) {
    it(`${name}'s footer delete carries a visible label`, () => {
      const footer = footerOf(name);
      // find the trash button in the footer
      expect(footer).toMatch(new RegExp(`icon="trash"[^>]*a11y="${a11y}"`));
      // and it must have a VISIBLE label, not only the a11y string
      const trashBtn = footer.slice(footer.indexOf('icon="trash"'), footer.indexOf('onPress', footer.indexOf('icon="trash"')));
      expect(trashBtn).toMatch(/label="/);
    });
  }
});
