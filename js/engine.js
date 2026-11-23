import { state, subscribe } from './state.js';

export class Engine {
  constructor() {
    this.lastFrameTime = 0;
    this.animationFrameId = null;
    this.subscribers = new Set();

    // React to play/pause and manual glitch state changes automatically
    subscribe('isPlaying', (isPlaying) => {
      if (isPlaying) {
        this.start();
      }
    });

    subscribe('glitchActive', (glitchActive) => {
      if (glitchActive) {
        this.start();
      }
    });
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  start() {
    if (this.animationFrameId) return;
    this.lastFrameTime = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  pause() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  loop = (timestamp) => {
    if (state.isExporting) {
      this.animationFrameId = null;
      return;
    }

    if (!this.lastFrameTime) this.lastFrameTime = timestamp;
    // Clamp dt to 0.1s max to avoid huge jumps when resuming from pause or background tab
    const rawDt = (timestamp - this.lastFrameTime) / 1000;
    const dt = Math.min(0.1, Math.max(0, rawDt));
    this.lastFrameTime = timestamp;

    // Notify subsystems
    for (const sub of this.subscribers) {
      sub(dt, timestamp);
    }

    // Only keep scheduling frames while playing or decaying an active glitch spike
    if (state.isPlaying || state.glitchActive) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    } else {
      this.animationFrameId = null;
    }
  }
}

export const engine = new Engine();
