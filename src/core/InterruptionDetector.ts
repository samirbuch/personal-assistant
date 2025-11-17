/**
 * Interruption Detector
 * 
 * Ultra-simple, ultra-fast audio activity detection.
 * During speaking: ANY audio = interrupt
 */

export class InterruptionDetector {
  private lastDetectionTime: number = 0;
  private detectionCount: number = 0;

  /**
   * Check if audio contains activity (simple energy-based)
   */
  public detectActivity(mulawBase64: string): boolean {
    try {
      const buffer = Uint8Array.fromBase64(mulawBase64);
      let activeSamples = 0;

      // Count samples that deviate from silence (127 for mulaw)
      for (let i = 0; i < buffer.length; i++) {
        const sample = buffer[i];
        if (sample === undefined) continue;
        
        // Very low threshold - we want to catch ANY sound
        if (Math.abs(sample - 127) > 3) {
          activeSamples++;
        }
      }

      // If >5% of samples show activity, consider it audio
      const activityRatio = activeSamples / buffer.length;
      return activityRatio > 0.05;
      
    } catch {
      return false;
    }
  }

  /**
   * Should we trigger an interruption?
   * Returns true if audio detected and not debounced
   */
  public shouldInterrupt(mulawBase64: string): boolean {
    if (!this.detectActivity(mulawBase64)) {
      return false;
    }

    const now = Date.now();
    
    // Debounce: Don't trigger multiple interrupts within 100ms
    if (now - this.lastDetectionTime < 100) {
      return false;
    }

    this.lastDetectionTime = now;
    this.detectionCount++;
    
    console.log(`[Interruption] Activity detected (${this.detectionCount} total)`);
    return true;
  }

  /**
   * Reset detection state
   */
  public reset(): void {
    this.lastDetectionTime = 0;
  }

  /**
   * Get total interruptions detected
   */
  public getCount(): number {
    return this.detectionCount;
  }
}
