/**
 * v0.7.8.13 (owner's ask 4): which launcher icon Marrow wears. A chosen one, or "skin": the icon that goes with the
 * look (Collage → Denim, Notebook and Plain → Paper, Daylight → Sky; dark mode → Ink).
 */
export type AppIconName = 'paper' | 'denim' | 'ink' | 'sky';
export type AppIconChoice = AppIconName | 'skin';
export const APP_ICONS: readonly { id: AppIconName; name: string }[] = [
  { id: 'paper', name: 'Paper' }, { id: 'denim', name: 'Denim' }, { id: 'ink', name: 'Ink' }, { id: 'sky', name: 'Sky' },
];
export function iconFor(choice: AppIconChoice | undefined, palette: string, dark: boolean): AppIconName {
  // absent = Paper: an update never moves the icon by itself; only a choice in Settings does
  if (!choice) return 'paper';
  if (choice !== 'skin') return choice;
  if (dark) return 'ink';
  return palette === 'collage' ? 'denim' : palette === 'daylight' ? 'sky' : 'paper';
}
