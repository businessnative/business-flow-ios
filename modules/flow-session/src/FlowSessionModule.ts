import { NativeModule, requireNativeModule } from 'expo';

import type { FlowSessionModuleEvents, MicPermission, RecordingResult } from './FlowSession.types';

declare class FlowSessionModule extends NativeModule<FlowSessionModuleEvents> {
  appGroup: string;
  getShared(key: string): string | null;
  setShared(key: string, value: string | null): void;
  publishState(json: string): void;
  micPermission(): MicPermission;
  requestMicPermission(): Promise<boolean>;
  isKeyboardEnabled(): boolean;
  keyboardFullAccessSeenAt(): number;
  startSession(): Promise<void>;
  stopSession(): Promise<void>;
  isSessionActive(): boolean;
  startRecording(): Promise<void>;
  stopRecording(): Promise<RecordingResult>;
  cancelRecording(): void;
  isRecording(): boolean;
  readFileBase64(uri: string): Promise<string>;
  deleteFile(uri: string): void;
  /** Call notes inbox (Share Extension → App Group): JSON array of {id,kind,name,file,date}. */
  callInbox(): string;
  /** Moves an inbox item into Documents/calls; returns its file:// URI or null. */
  takeCallInboxItem(id: string): string | null;
  /** ms since the last mic buffer while recording; -1 when not recording. */
  bufferAgeMs(): number;
  /** Restart the audio engine, keeping the samples recorded so far (stall / route recovery). */
  restartEngine(): Promise<void>;
  /** Soft synthesized cue (own implementation), volume 0…1. */
  playCue(kind: 'start' | 'stop' | 'error', volume: number): void;
}

export default requireNativeModule<FlowSessionModule>('FlowSession');
