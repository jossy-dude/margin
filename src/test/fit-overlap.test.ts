/**
 * v0.2 — the task form's "fit" hint stops overlapping the fields below it.
 *
 * Jossy's screenshot (2026-10-19): the "Comfortable: needs ~2h 49m…" box sat ON TOP of the
 * "Latest start" line and the "Remind me" label. The cause is in `Fit` (forms.tsx): it rendered
 * BOTH crossfading message boxes with `position: 'absolute'`, so neither contributed layout
 * height. The only in-flow child was the "Latest start" text, which therefore started at the very
 * top of the container — directly beneath the floating boxes.
 *
 * The fix keeps the crossfade but reserves the height: the "comfortable" box (the longer of the two
 * strings, so it wraps at least as far) is rendered in NORMAL flow, and only the "tight" box is
 * overlaid absolutely on top of it. The in-flow box now pushes everything after it — "Latest start"
 * and the reminder chips — down below the hint instead of under it.
 *
 * This is a layout property, pinned as a source contract (react-test-renderer does not run Yoga):
 * `Fit` must render its comfortable box WITHOUT absolute positioning, so it occupies real height.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const forms = readFileSync(join(__dirname, '../sheets/forms.tsx'), 'utf8');

/** The body of the Fit component. */
const fitBody = () => {
  const i = forms.indexOf('function Fit(');
  expect(i).toBeGreaterThan(-1);
  const next = forms.indexOf('\nfunction ', i + 10);
  return forms.slice(i, next > -1 ? next : forms.length);
};

describe('the fit hint reserves its height and does not float over the fields below', () => {
  it('the comfortable message box is in normal flow (not absolute), so it takes up space', () => {
    const body = fitBody();
    // the comfortable HandBox is the one with fill={c.card}
    const cardIdx = body.indexOf('fill={c.card}');
    expect(cardIdx).toBeGreaterThan(-1);
    // walk back to the opening of the element that wraps this HandBox
    const wrapperStart = body.lastIndexOf('<Animated.View', cardIdx);
    const plainStart = body.lastIndexOf('<View', cardIdx);
    // whichever wrapper encloses the comfortable box, it must NOT be absolutely positioned
    const start = Math.max(wrapperStart, plainStart);
    const openTag = body.slice(start, body.indexOf('>', start));
    expect(openTag).not.toMatch(/position:\s*'absolute'/);
  });

  it('the "Latest start" line is a sibling after the box, in normal flow', () => {
    const body = fitBody();
    const boxIdx = body.indexOf('fill={c.card}');
    const latestIdx = body.indexOf('Latest start: {startBy}'); // the JSX, not a comment mention
    expect(boxIdx).toBeGreaterThan(-1);
    expect(latestIdx).toBeGreaterThan(boxIdx); // it comes after the box in source order
  });

  it('the tight overlay is the one that floats (absolute), crossfading over the reserved box', () => {
    const body = fitBody();
    const hlIdx = body.indexOf('fill={c.hl}');
    expect(hlIdx).toBeGreaterThan(-1);
    const wrapperStart = body.lastIndexOf('<Animated.View', hlIdx);
    const openTag = body.slice(wrapperStart, body.indexOf('>', wrapperStart));
    expect(openTag).toMatch(/position:\s*'absolute'/);
  });
});
