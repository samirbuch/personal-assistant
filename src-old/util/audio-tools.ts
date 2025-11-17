import type { CallSession } from "../types/CallSession";

// Calculate audio energy from mulaw audio
export function calculateAudioEnergy(mulawBase64: string): number {
  try {
    const buffer = Uint8Array.fromBase64(mulawBase64);
    let energy = 0;
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i];
      if (sample === undefined) continue;
      const deviation = Math.abs(sample - 127);
      energy += deviation;
    }
    return energy / buffer.length;
  } catch {
    return 0;
  }
}

// Update rolling average of noise baseline
export function updateNoiseBaseline(session: CallSession, energy: number) {
  session.noiseSamples.push(energy);
  
  // Keep only the last 50 samples (about 1 second of audio at 20ms chunks)
  if (session.noiseSamples.length > 50) {
    session.noiseSamples.shift();
  }
  
  // Calculate rolling average
  const sum = session.noiseSamples.reduce((a: number, b: number) => a + b, 0);
  session.noiseBaseline = sum / session.noiseSamples.length;
}

// Check if there's ANY audio activity (ultra-aggressive detection)
export function hasAnyAudioActivity(mulawBase64: string): boolean {
  try {
    const buffer = Uint8Array.fromBase64(mulawBase64);
    let activity = 0;
    
    // Count samples that deviate from silence (127)
    for (let i = 0; i < buffer.length; i++) {
      const sample = buffer[i];
      if (sample === undefined) continue;
      const deviation = Math.abs(sample - 127);
      if (deviation > 3) { // Very low threshold - almost any sound
        activity++;
      }
    }
    
    // If more than 10% of samples show activity, consider it audio
    return (activity / buffer.length) > 0.1;
  } catch {
    return false;
  }
}

// Check if audio energy indicates speech (above baseline + margin)
export function isSpeechDetected(session: CallSession, energy: number): boolean {
  // Need a margin above baseline to detect speech vs noise
  // Lower multiplier (1.8x) for faster interruption detection
  const threshold = session.noiseBaseline * 1.8;
  return energy > Math.max(threshold, 8); // Lower minimum threshold for faster response
}
