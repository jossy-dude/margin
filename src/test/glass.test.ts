/** v0.7 U4 — the glass surface: no shadow, a hairline ring, radius 16, strong glass for sheets and inputs. */
import { GlassCard, glassStyle } from '../ui/Glass';
import { V2 } from '../tokens/v2';

it('glass is a ring and a fill, never a shadow', () => {
  const s = glassStyle('light');
  expect(s).toMatchObject({ backgroundColor: V2.light.glass, borderRadius: 16, borderColor: V2.light.ring });
  expect(s).not.toHaveProperty('shadowColor'); expect(s).not.toHaveProperty('elevation');
  expect(glassStyle('dark', true).backgroundColor).toBe(V2.dark.glassStrong);
  expect(typeof GlassCard).toBe('function');
});
