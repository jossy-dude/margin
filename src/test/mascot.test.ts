/** v0.5 O1 — the mascot's eyes: where a finger or a caret puts them on Teddy's 0–100 `numLook` input. */
import { lookAlong, lookAt, RIG } from '../onboarding/mascot';

it('a finger across the page maps to 0–100, clamped, and a zero-width page looks ahead', () => {
  expect(lookAt(0, 400)).toBe(0);
  expect(lookAt(200, 400)).toBe(50);
  expect(lookAt(900, 400)).toBe(100);
  expect(lookAt(-5, 400)).toBe(0);
  expect(lookAt(10, 0)).toBe(50);
});
it('the eyes follow the caret along a name, and stop at the end of the field', () => {
  expect(lookAlong(0)).toBe(0);
  expect(lookAlong(10)).toBe(30);
  expect(lookAlong(80)).toBe(100);
});
it('names the Rive inputs exactly as the file spells them', () => {
  expect(RIG).toMatchObject({ artboard: 'Teddy', machine: 'Login Machine', look: 'numLook', checking: 'isChecking', handsUp: 'isHandsUp', success: 'trigSuccess', fail: 'trigFail' });
});
