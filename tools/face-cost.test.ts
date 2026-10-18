/** JS cost of rebuilding a clock face (diagnosis only). */
import { FACES, dialPal, staticSvg, spinLayers, compositeSvg } from '../src/ui/clock/faces';
import { parse } from 'react-native-svg';
import { makeTheme } from '../src/tokens/theme';

const pal = dialPal(FACES[0]!, makeTheme({ theme: 'light', palette: 'refined', pen: 'warm' }, false).c, false);

const time = (label: string, n: number, f: () => unknown) => {
  f(); // warm
  const t0 = performance.now();
  for (let i = 0; i < n; i++) f();
  console.log(`${label}: ${((performance.now() - t0) / n).toFixed(2)}ms/op`);
};

it('face rebuild cost', () => {
  const sizes: [string, number][] = [['thumb 96', 96], ['today 92', 92], ['focus 196', 196]];
  for (const f of FACES) {
    for (const [label, px] of sizes) {
      time(`${f.id}@${label} gen`, 50, () => {
        const xml = staticSvg(f, pal, 'serif', px, 'a');
        spinLayers(f.id, pal, px);
        return xml;
      });
      const xml = staticSvg(f, pal, 'serif', px, 'a');
      time(`${f.id}@${label} parse`, 50, () => parse(xml));
      const comp = compositeSvg(f, pal, 'serif', { h: 10, m: 10, s: 30 }, 0, px, 'a');
      time(`${f.id}@${label} composite+parse`, 50, () => parse(comp));
    }
  }
}, 120000);
