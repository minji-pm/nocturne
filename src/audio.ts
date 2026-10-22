import type { Mood } from './settings';

/**
 * A deliberately small Web Audio soundscape. It is inert until setEnabled(true)
 * is called from a user gesture, so constructing it is safe during page load.
 */
export class NightAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private waterFilter: BiquadFilterNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private enabled = false;
  private destroyed = false;
  private transition = 0;
  private lastRippleAt = -Infinity;
  private voices = new Set<OscillatorNode>();
  private wind = 0.3;
  private mood: Mood = 'moon';

  async setEnabled(on: boolean): Promise<void> {
    if (this.destroyed) return;
    const transition = ++this.transition;

    if (on) {
      this.createGraph();
      const context = this.context;
      if (!context) throw new Error('이 브라우저는 소리를 지원하지 않습니다.');
      try {
        if (context.state !== 'running') await context.resume();
      } catch {
        // Browsers may still reject a non-gesture resume. Stay silent and allow
        // the next explicit toggle to retry.
        if (transition === this.transition) this.enabled = false;
        throw new Error('소리를 시작할 수 없습니다. 소리 켜기를 다시 눌러주세요.');
      }
      if (this.destroyed || transition !== this.transition || !this.master) return;
      this.enabled = true;
      const now = context.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.linearRampToValueAtTime(0.22, now + 0.45);
      this.applyAtmosphere(now);
      return;
    }

    this.enabled = false;
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const now = context.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.18);
    window.setTimeout(() => {
      if (!this.destroyed && transition === this.transition && !this.enabled && context.state === 'running') {
        void context.suspend();
      }
    }, 220);
  }

  ripple(strength: number, pan: number): void {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running') return;
    const now = context.currentTime;
    if (now - this.lastRippleAt < 0.09 || this.voices.size >= 6) return;
    this.lastRippleAt = now;

    const amount = Math.max(0, Math.min(1, strength));
    if (amount < 0.025) return;
    const index = Math.floor((now * 7 + amount * 5) % PENTATONIC.length);
    const root = this.mood === 'ember' ? 207.65 : this.mood === 'dawn' ? 293.66 : 233.08;
    const oscillator = context.createOscillator();
    const tone = context.createBiquadFilter();
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(root * PENTATONIC[index], now);
    oscillator.frequency.exponentialRampToValueAtTime(root * PENTATONIC[index] * 1.006, now + 0.07);
    tone.type = 'lowpass';
    tone.frequency.value = 2100 + amount * 1600;
    tone.Q.value = 1.4;
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.012 + amount * 0.035, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.65 + amount * 0.55);
    oscillator.connect(tone).connect(gain).connect(panner).connect(this.master!);
    this.voices.add(oscillator);
    oscillator.onended = () => { this.voices.delete(oscillator); oscillator.disconnect(); tone.disconnect(); gain.disconnect(); panner.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + 1.3);
  }

  update(wind: number, mood: Mood): void {
    this.wind = Math.max(0, Math.min(1, wind / 100));
    this.mood = mood;
    if (this.context && this.enabled) this.applyAtmosphere(this.context.currentTime);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    ++this.transition;
    for (const voice of this.voices) {
      try { voice.stop(); } catch { /* already stopped */ }
    }
    this.voices.clear();
    if (this.context) void this.context.close();
    this.context = null;
    this.master = null;
    this.ambience = null;
  }

  private createGraph(): void {
    if (this.context) return;
    if (typeof window === 'undefined') return;
    const AudioContextConstructor = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextConstructor) return;
    const context = new AudioContextConstructor();
    const master = context.createGain();
    const ambience = context.createGain();
    master.gain.value = 0;
    ambience.gain.value = 0.12;
    ambience.connect(master).connect(context.destination);

    const waterFilter = context.createBiquadFilter();
    waterFilter.type = 'lowpass';
    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.Q.value = 0.45;
    this.makeNoise(context, waterFilter);
    this.makeNoise(context, windFilter);
    waterFilter.connect(ambience);
    windFilter.connect(ambience);
    this.context = context;
    this.master = master;
    this.ambience = ambience;
    this.waterFilter = waterFilter;
    this.windFilter = windFilter;
  }

  private makeNoise(context: AudioContext, destination: AudioNode): void {
    const seconds = 2;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const values = buffer.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < values.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.08) / 1.08;
      values[i] = brown * 3.2;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    source.start();
  }

  private applyAtmosphere(now: number): void {
    if (!this.ambience || !this.waterFilter || !this.windFilter) return;
    const color = this.mood === 'ember' ? 1 : this.mood === 'dawn' ? 1.18 : 0.82;
    this.ambience.gain.setTargetAtTime(0.055 + this.wind * 0.1, now, 0.25);
    this.waterFilter.frequency.setTargetAtTime((430 + this.wind * 500) * color, now, 0.3);
    this.windFilter.frequency.setTargetAtTime((220 + this.wind * 900) * color, now, 0.3);
  }
}

const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3] as const;

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
