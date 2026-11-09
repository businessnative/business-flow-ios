// File import (Fájlok app / iCloud Drive) for call recordings and transcripts.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File as FsFile, Paths } from 'expo-file-system';

import { classifyFile } from './core';
import { addAudio, addTranscript } from './store';

export const PICKER_TYPES = ['public.audio', 'public.mpeg-4-audio', 'com.apple.m4a-audio', 'public.plain-text', 'public.text', 'public.rtf'];

/** Returns the new note id, null when cancelled; throws a Hungarian message for unsupported files. */
export async function pickAndImport(): Promise<string | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
  if (r.canceled || !r.assets?.length) return null;
  const a = r.assets[0];
  const kind = classifyFile(a.name, a.mimeType);
  if (kind === 'unknown') throw new Error('Ezt a fájltípust nem ismerem. Hangfelvételt (m4a, mp3, wav) vagy szöveges leiratot (txt) válassz.');
  const src = new FsFile(a.uri);
  if (kind === 'text') {
    const text = await src.text();
    if (!text.trim()) throw new Error('A fájl üres.');
    return addTranscript(text, a.name);
  }
  const dir = new Directory(Paths.document, 'calls');
  if (!dir.exists) dir.create({ intermediates: true });
  const dest = new FsFile(dir, `${Date.now()}-${a.name.replace(/[/\\:]/g, '_')}`);
  src.copy(dest);
  return addAudio(dest.uri, a.name, 'audio');
}
