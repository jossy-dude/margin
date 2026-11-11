export type SkyPhase = 'dawn' | 'day' | 'dusk' | 'night';
/** The sky follows the phone's clock: sunrise, daylight, sunset, night. */
export const skyPhase = (hour: number): SkyPhase => (hour >= 5 && hour < 8 ? 'dawn' : hour >= 8 && hour < 17 ? 'day' : hour >= 17 && hour < 20 ? 'dusk' : 'night');
export const nowPhase = () => skyPhase(new Date().getHours());

const pt = (rad: number, ang: number) => `${(rad * Math.sin(ang)).toFixed(1)} ${(-rad * Math.cos(ang)).toFixed(1)}`;
/** Twelve cut-paper rays, long and short in turn, around a disc of radius `r`. */
export const sunRays = (r: number) => Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2, tip = r * (i % 2 ? 1.4 : 1.62), base = r * 1.14;
  return `M${pt(base, a - 0.12)}L${pt(tip, a)}L${pt(base, a + 0.12)}Z`;
}).join('');
