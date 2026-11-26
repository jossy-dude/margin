/** v0.7.8.17 (owner's ask 7): every Style has its own onboarding scene, not only Collage. */
import { readFileSync } from 'fs';
import { join } from 'path';

const ob = readFileSync(join(__dirname, '..', 'onboarding', 'Onboarding.tsx'), 'utf8'), sc = readFileSync(join(__dirname, '..', 'onboarding', 'Scenes.tsx'), 'utf8');
describe('onboarding scenes', () => {
  it('Notebook, Plain and Daylight each draw their own scene', () => {
    for (const f of ['function NotebookScene', 'function PlainScene', 'function DaylightScene']) expect(sc).toContain(f);
    expect(sc).toContain("edge === 'glass' ? <DaylightScene");
    expect(sc).toContain("edge === 'hairline' ? <PlainScene");
  });
  it('every page has one: hero pages above the sheet, inner pages in the band above the pager; Collage keeps its art', () => {
    expect(ob).toContain("cut === 'collage' ? art : <SkinScene i={i} W={W} H={H} bottom={FOOT + ins.bottom + 8} />");
    expect(ob).toContain("cut === 'collage' ? art : <><SkinScene i={i} W={W} H={H} /><Halo");
  });
  it('section headings are sentence case, not letter-spaced uppercase', () => {
    expect(ob).not.toContain("textTransform: 'uppercase'");
  });
});
