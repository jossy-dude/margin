/** v0.7.8.18 (SPEC §7.3, owner's ask 11): the page header is two rows, so the title never wraps under the actions. */
import { readFileSync } from 'fs';
import { join } from 'path';

const c = readFileSync(join(__dirname, '..', 'screens', 'common.tsx'), 'utf8'), w = readFileSync(join(__dirname, '..', 'screens', 'Week.tsx'), 'utf8');
describe('page header', () => {
  it('row 1: a one-line title, the face, a 48 dp gear; row 2: the subtitle and the page actions', () => {
    expect(c).toContain('<Txt f="marker" s={32} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header"');
    expect(c).toContain("style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}");
    expect(c).toContain('{sub || right ? (');
  });
  it('Week\'s + Class sits left, clear of the floating +', () => {
    expect(w).toMatch(/<Row style=\{\{ flexWrap: 'nowrap', gap: 10 \}\}><Btn small kind="ghost" icon="plus" label="Class"/);
  });
});
