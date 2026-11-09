// Web mock (used only for the web preview / screenshots — there is no keyboard or native mic session on web).
import { NativeModule, registerWebModule } from 'expo';

import type { FlowSessionModuleEvents, MicPermission, RecordingResult } from './FlowSession.types';

class FlowSessionWeb extends NativeModule<FlowSessionModuleEvents> {
  appGroup = 'group.com.example.businessflow';
  private shared = new Map<string, string>();
  private active = false;
  private recording = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  getShared(key: string) {
    return this.shared.get(key) ?? null;
  }
  setShared(key: string, value: string | null) {
    if (value === null) this.shared.delete(key);
    else this.shared.set(key, value);
  }
  publishState(json: string) {
    this.shared.set('flow.state', json);
  }
  micPermission(): MicPermission {
    return 'granted';
  }
  async requestMicPermission() {
    return true;
  }
  isKeyboardEnabled() {
    return false;
  }
  keyboardFullAccessSeenAt() {
    return 0;
  }
  async startSession() {
    this.active = true;
  }
  async stopSession() {
    this.active = false;
  }
  isSessionActive() {
    return this.active;
  }
  async startRecording() {
    this.recording = true;
    let t = 0;
    this.timer = setInterval(() => {
      t += 1;
      this.emit('onLevel', { level: 0.35 + 0.3 * Math.abs(Math.sin(t / 3)) });
    }, 80);
  }
  async stopRecording(): Promise<RecordingResult> {
    this.cancelRecording();
    return { uri: 'mock://audio.wav', seconds: 2, peak: 0.4, speechSeconds: 1.8, silent: false, whisper: false };
  }
  cancelRecording() {
    this.recording = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  isRecording() {
    return this.recording;
  }
  async readFileBase64() {
    return '';
  }
  deleteFile() {}
  bufferAgeMs() {
    return this.recording ? 50 : -1;
  }
  async restartEngine() {}
  playCue() {}
}

export default registerWebModule(FlowSessionWeb, 'FlowSession');
