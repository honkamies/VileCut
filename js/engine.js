import { state, subscribe } from './state.js';

export class Engine {
  constructor() {
    this.lastFrameTime = 0;
    this.animationFrameId = null;
    this.subscribers = new Set();
    
    // React to play/pause state changes automatically
    subscribe('isPlaying', (isPlaying) => {
      if (isPlaying) {
        // Start engine only if we are not already running
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
    // We always keep the loop running to manage time properly, even if 'isPlaying' is false
    // actually wait, the original app keeps the loop running even when paused? Let's check:
    // "if (state.isPlaying && state.imageLoaded) { ... }" was in app.js
    
    this.animationFrameId = requestAnimationFrame(this.loop);

    if (state.isExporting) {
      return;
    }

    if (!this.lastFrameTime) this.lastFrameTime = timestamp;
    const dt = (timestamp - this.lastFrameTime) / 1000;
    this.lastFrameTime = timestamp;

    // Notify subsystems
    for (const sub of this.subscribers) {
      sub(dt, timestamp);
    }
  }
}

export const engine = new Engine();
