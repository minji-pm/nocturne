export type Mood = 'moon' | 'ember' | 'dawn';
export type CameraView = 'wide' | 'water' | 'orbit';
export interface WorldSettings {
  mood: Mood;
  fog: number;
  wind: number;
  fireflies: number;
  moonlight: number;
  camera: CameraView;
  paused: boolean;
}
export const DEFAULT_SETTINGS: WorldSettings = {
  mood: 'moon', fog: 42, wind: 30, fireflies: 65, moonlight: 70,
  camera: 'wide', paused: false,
};
export function normalizeSettings(value: unknown): WorldSettings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SETTINGS };
  const v = value as Partial<WorldSettings>;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of ['fog', 'wind', 'fireflies', 'moonlight'] as const) {
    if (typeof v[key] === 'number' && Number.isFinite(v[key])) out[key] = Math.max(0, Math.min(100, v[key]));
  }
  if (['moon', 'ember', 'dawn'].includes(v.mood as string)) out.mood = v.mood!;
  if (['wide', 'water', 'orbit'].includes(v.camera as string)) out.camera = v.camera!;
  return out;
}
