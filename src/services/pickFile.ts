import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

/**
 * The picker door into Settings → Data → Import: the phone's own document picker, then the file's text.
 *
 * The reading is the awkward half, and it is awkward for a real reason. expo-document-picker answers with
 * a cache `uri` on Android/iOS, which `expo-file-system` reads — but on web it answers with the browser's
 * own `File` object, and a `blob:` URI is not something `expo-file-system` can open. So the web path reads
 * the `File` it was handed and the native path goes through the filesystem module; both return the same
 * `{ name, text }`, and a cancelled picker is `null` from either (`null` is "you changed your mind", not
 * an error, and the caller has nothing to say about it).
 *
 * Nothing here parses or validates: the text goes back to `domain/importPlan.ts`, which never throws and
 * reports what is wrong on the preview. A file that cannot be *read* is the one failure that has to
 * surface, and it surfaces as a rejected promise the sheet turns into one line of text.
 */
export interface PickedFile { name: string; text: string }

/** The MIME types the two formats arrive as. `text/plain` is in the list on purpose: some file managers
 *  label a `.csv` that way, and a mislabelled CSV is better picked and refused by the planner than
 *  hidden from the person looking for it. */
const TYPES = ['application/json', 'text/json', 'text/csv', 'text/comma-separated-values', 'application/csv', 'text/plain'];

export async function pickImportFile(): Promise<PickedFile | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: TYPES, copyToCacheDirectory: true, multiple: false });
  if (res.canceled) return null;
  const asset = res.assets?.[0];
  if (!asset) return null;
  return { name: asset.name, text: await readText(asset) };
}

async function readText(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  const web = (asset as { file?: { text?: () => Promise<string> } }).file;
  if (typeof web?.text === 'function') return web.text();
  return new File(asset.uri).text();
}
