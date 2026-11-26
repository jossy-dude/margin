/** v0.7.8.10 (owner's ask 3): a Settings page opens at its top; Data & export is compact. */
import { readFileSync } from 'fs';
import { join } from 'path';

const page = readFileSync(join(__dirname, '..', 'ui', 'FullPage.tsx'), 'utf8'), settings = readFileSync(join(__dirname, '..', 'sheets', 'Settings.tsx'), 'utf8');
describe('Settings sub-pages open at the top', () => {
  it('the page scroll is keyed, and Settings keys it by sub-page', () => {
    expect(page).toContain("<ScrollView key={scrollKey ?? 'page'}");
    expect(settings).toContain('testID="settings" scrollKey={page}>');
  });
  it('export is one picker and two buttons', () => {
    expect(settings).toContain("<Seg value={xf} opts={[['xlsx', 'Excel'], ['csv', 'CSV (.zip)'], ['json', 'JSON']]}");
    expect(settings).not.toContain("(['xlsx', 'csv', 'json'] as ExportFormat[]).map(");
  });
});
