/** A big delete that stopped sync (vault-sync §9), as the sync service reports it. */
export interface SyncHold { holdId: string; from: string; src: 'desktop' | 'phone'; count: number; sample?: string[]; local?: boolean; at?: number }

/** The question a big delete asks (vault-sync §9): sync stops until the owner chooses. */
export function holdQuestion(h: SyncHold): { title: string; body: string; yes: string; no: string } {
  const where = h.src === 'desktop' ? 'on the desktop' : 'on the phone';
  const files = h.count === 1 ? '1 file' : `${h.count} files`;
  const eg = h.sample?.length ? ` For example: ${h.sample.slice(0, 3).join(', ')}.` : '';
  return {
    title: `Sync stopped: ${files} deleted ${where}`,
    body: `Do you want to sync the deletes?${eg}`,
    yes: h.src === 'desktop' ? 'Delete them here too' : 'Delete on the desktop too',
    no: 'Keep the files',
  };
}
