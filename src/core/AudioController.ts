/**
 * Audio Controller
 * 
 * Direct, simple control over audio flow.
 * Either audio flows or it doesn't. No complex gates.
 */

import type Bun from "bun";
import type { TwilioWebsocket } from "../../lib/TwilioWebsocketTypes";

export class AudioController {
  private enabled: boolean = false;
  private ws: Bun.ServerWebSocket;
  private streamSid: string;
  private lastClearTime: number = 0;

  constructor(ws: Bun.ServerWebSocket, streamSid: string) {
    this.ws = ws;
    this.streamSid = streamSid;
  }

  /**
   * Enable audio output - TTS audio will flow to Twilio
   */
  public enable(): void {
    this.enabled = true;
    console.log(`[AudioController] ✅ Audio ENABLED`);
  }

  /**
   * Disable audio output - TTS audio will be dropped
   */
  public disable(): void {
    this.enabled = false;
    console.log(`[AudioController] ❌ Audio DISABLED`);
  }

  /**
   * Check if audio can flow
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Send audio chunk to Twilio (if enabled)
   */
  public sendAudio(audioBase64: string): boolean {
    if (!this.enabled) {
      return false; // Audio dropped
    }

    const msg: TwilioWebsocket.Sendable.MediaMessage = {
      event: "media",
      streamSid: this.streamSid,
      media: { payload: audioBase64 }
    };

    this.ws.send(JSON.stringify(msg));
    return true;
  }

  /**
   * Immediately clear Twilio's audio buffer
   */
  public clearBuffer(): void {
    const now = Date.now();
    
    // Debounce - don't clear too frequently
    if (now - this.lastClearTime < 50) {
      return;
    }

    this.lastClearTime = now;

    // Send clear command multiple times for reliability
    const clearMsg: TwilioWebsocket.Sendable.ClearMessage = {
      event: "clear",
      streamSid: this.streamSid
    };

    this.ws.send(JSON.stringify(clearMsg));
    this.ws.send(JSON.stringify(clearMsg));
    this.ws.send(JSON.stringify(clearMsg));

    console.log(`[AudioController] 🧹 Buffer cleared`);
  }

  /**
   * Stop all audio immediately - disable + clear
   */
  public stopImmediately(): void {
    this.disable();
    this.clearBuffer();
  }
}
