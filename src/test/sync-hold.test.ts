import { holdQuestion } from '../domain/syncHold';

describe('big-delete question (vault-sync §9)', () => {
  it('names where the files went and how many', () => {
    const q = holdQuestion({ holdId: 'H', from: 'this computer', src: 'desktop', count: 40, sample: ['Daily/a.md', 'Daily/b.md', 'x.md', 'y.md'] });
    expect(q.title).toBe('Sync stopped: 40 files deleted on the desktop');
    expect(q.body).toBe('Do you want to sync the deletes? For example: Daily/a.md, Daily/b.md, x.md.');
    expect(q.yes).toBe('Delete them here too');
    expect(q.no).toBe('Keep the files');
  });
  it('a phone delete asks about the desktop', () => {
    const q = holdQuestion({ holdId: 'local', from: 'phone', src: 'phone', count: 1, local: true });
    expect(q.title).toBe('Sync stopped: 1 file deleted on the phone');
    expect(q.body).toBe('Do you want to sync the deletes?');
    expect(q.yes).toBe('Delete on the desktop too');
  });
});
