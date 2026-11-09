export type MicPermission = 'granted' | 'denied' | 'undetermined';

export interface RecordingResult {
  uri: string;
  seconds: number;
  peak: number;
  speechSeconds: number;
  silent: boolean;
  whisper: boolean;
}

export type FlowSessionModuleEvents = {
  onCommand: (e: { json: string }) => void;
  onLevel: (e: { level: number }) => void;
  onInterruption: (e: { reason: 'interrupted' | 'ended' | 'route' | 'reset' }) => void;
};
