// Move a take out of the temp directory so iOS does not purge it before the user retries.
// The file stays on this phone. Upload happens only when transcription or Retry runs.
import { Directory, File, Paths } from 'expo-file-system';

import FlowSession from '../../modules/flow-session';

const safe = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || 'take';

export function persistDictationAudio(tempUri: string, id: string): string {
  try {
    const dir = new Directory(Paths.document, 'dictation-audio');
    if (!dir.exists) dir.create({ intermediates: true });
    const dest = new File(dir, `${safe(id)}.wav`);
    if (dest.uri === tempUri) return tempUri;
    const src = new File(tempUri);
    if (dest.exists) dest.delete();
    src.copy(dest);
    try {
      FlowSession.deleteFile(tempUri);
    } catch {
      // The copy is the one we keep.
    }
    return dest.uri;
  } catch {
    return tempUri;
  }
}

export function discardAudio(uri?: string) {
  if (!uri) return;
  try {
    new File(uri).delete();
  } catch {
    // Native delete below still runs.
  }
  try {
    FlowSession.deleteFile(uri);
  } catch {
    // Already gone, or the module is unavailable in tests.
  }
}
