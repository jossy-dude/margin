# HANDOFF — A3 CLOCK

Everything A3 could do inside its own files, it did. Two items need `src/tokens/theme.ts`, which is shared and
unowned (`COORDINATION.md` §2), so they are written out here as exact patches.

**Rendered proof of what patches 1 and 2 produce:** `/tmp/render/HANDOFF-PREVIEW-whitblack.png` (all five faces,
light over dark, 400 px) and `/tmp/render/HANDOFF-PREVIEW-contactsheet.png`. Both were produced by temporarily
applying this patch, rendering, and then reverting `theme.ts`. That is why the shipped tree does not have it yet.

---

## BLOCKED ON SHARED FILE: `src/tokens/theme.ts` — needs these two constants

**Why:** the owner's first complaint is *"just make their background pure plain and white … pure white and pure
black"*, and the dial ground is `c.card`. `refined.light.card` is `#FFFBF1` and `refined.dark.card` is `#353029` —
so the light dial is a warm off-white indistinguishable from `paper` (`#FAF4E6`), and the dark dial is a muddy
brown-grey that is not what any of these faces is made of. Separately, `prompt.md` V4 calls the sweep hand
**red-brown**, and `pal.accent` in the dark palette is `#E0A47A` — a pale peach that reads grey at hairline width.

**Why it cannot live in `faces.ts`:** `src/test/color-drift.test.ts` fails the build on any hex literal outside
`tokens/theme.ts`. That guard is correct — it exists because three release bugs (BUG-005, BUG-009, BUG-019b) were
each one pasted hex. Dial materials are the same category of thing as the `ONYX` and `TAPE` constants already in
that file, so they belong there too.

### Patch 1 — two dial materials, inserted immediately before `export const TAPE`

```ts
/** Dial materials for the clock faces, alongside ONYX and for the same reason: a dial is a physical plate, not a
 *  themed surface, so the same plate must not change material when the app flips to dark. ENAMEL is true white
 *  porcelain and LACQUER is true black lacquer — the two extremes, because an engraved ground only reads as
 *  engraving when the ink is as far from it as it can get, and that is what stops a dial reading as haze.
 *  SECOND is the sweep hand and the Scales sub-seconds: prompt.md V4 calls it red-brown, which is a lacquered
 *  steel colour and not a theme accent — `refined.dark.acc` is `#E0A47A`, a pale peach that reads grey at
 *  hairline width. Like ONYX, none of these follow `palette: 'original'`: they are materials, not theme colours. */
export const DIAL = { light: '#FFFFFF', dark: '#000000' } as const;
export const SECOND = { light: '#8A4B27', dark: '#C0663A' } as const;
```

Contrast of `SECOND` against the two grounds it now sits on:

| | on `#FFFFFF` | on `#000000` |
|---|---|---|
| light `#8A4B27` | 6.7 : 1 | — |
| dark `#C0663A` | — | 5.2 : 1 |

Both clear the 3:1 that `faces.test.ts` requires of a non-text accent against its own dial, with margin.

### Patch 2 — `src/ui/clock/faces.ts`, read the new materials

```diff
-import { ONYX, type Colors } from '../../tokens/theme';
+import { ONYX, DIAL, SECOND, type Colors } from '../../tokens/theme';
```

```diff
 export function dialPal(f: Pick<FaceSpec, 'native'>, c: Colors, dark: boolean): Pal {
-  return { ink: c.ink, dial: dark && f.native === 'dark' ? ONYX.dark : c.card, accent: c.acc, second: c.acc };
+  return { ink: c.ink, dial: dark ? DIAL.dark : DIAL.light, accent: c.acc, second: dark ? SECOND.dark : SECOND.light };
 }
```

`native` then only decides the *reading* of the engraving, not its ground — the doc comment above `dialPal` needs a
sentence saying so. `ONYX` stops being imported by `faces.ts` (nothing else in the file used it).

### Patch 3 — `src/test/faces.test.ts`, extend the palette-membership guard

A material is exempt from palette membership for exactly the reason `ONYX` was; the guard just needs to know about
the new one.

```diff
-import { palettes, ONYX } from '../tokens/theme';
+import { palettes, ONYX, DIAL } from '../tokens/theme';
```

```diff
-      for (const v of [pal.ink, pal.accent, ...(pal.dial === ONYX.dark ? [] : [pal.dial])]) expect(tone).toContain(v);
+      for (const v of [pal.ink, pal.accent, ...(pal.dial === ONYX.dark || pal.dial === DIAL.light || pal.dial === DIAL.dark ? [] : [pal.dial])]) expect(tone).toContain(v);
```

With that applied `npx jest src/test/faces.test.ts src/test/clock-engine.test.ts` is **40 passed** — I ran exactly
this and reverted.

### What patch 1 changes, seen rather than asserted

Before (shipped): the light ground is `#FFFBF1`, four steps off `paper`, so the dial does not read as an object and
the ornament reads as dust on cream; the dark ground is `#353029`, a brown-grey that belongs to no material.

After (`/tmp/render/HANDOFF-PREVIEW-whitblack.png`): a flat pure-white enamel plate in light and a flat pure-black
lacquer plate in dark, on all five faces. The guilloché reads as a cut rose instead of a grey cloud, the rosette
reads as a rose window with white between the petals, the scale ground reads as scales, and in dark the same
engraving reads as bright metal on black. Both themes are now *designed* — the light one is a white instrument and
the dark one is a black one, which is the answer to *"both themes must look genuinely designed, not one being a
filtered version of the other"*.

---

## Not a handoff — found, and deliberately left alone

1. **`src/ui/onboard/art.tsx` did not compile for part of this session** (three `Expected corresponding JSX
   closing tag for 'Line'` errors at lines 259, 310 and 477). A4 ONBOARD's file, mid-edit. It was fixed by the time
   A3 finished, so there is nothing left to do — noted only because A3 ran `tsc` against it several times and did not
   touch it.

2. **The Skeleton's wheel outlines stay sub-pixel at 96 dp.** `gearSvg` and `balanceSvg` are locked by
   `COORDINATION.md` §3, so their literal stroke weights were left alone; `src/test/clock-engine.test.ts` asserts the
   exemption exists so it cannot be forgotten. It does not actually look bad — what you read on a wheel is its fill,
   not its outline — and the fix would be to lift the lock, not to work around it.

3. **Scales and Lily still draws its ground as 576 individual arcs inside a `clipPath`**, where the reference engine
   used a 10×7 `<pattern>` tile. That is ~100× the geometry for the same picture, and `prompt.md` R11 already flags
   `clipPath id="sc"` as a hazard when a face renders twice in one tree. Converting it is a real win and it was left
   out because `<pattern>` support through `SvgXml` in react-native-svg cannot be verified without a device, and a
   silently-blank dial is a far worse outcome than a heavy one. **Needs a device.** (The arc count now steps down with
   the render size, so the 96 dp picker draws 16×16 rather than 24×24 — that part is done and rendered.)

4. **Celtic Knot's centre figure is three overlapping circles**, which reads more as a trefoil than as a knot. It is
   crisp at every size and legible in both themes, so it passes the bar; making it an actual interlaced knot means
   drawing over/under crossings, which is a redesign of that face rather than a fix to it.