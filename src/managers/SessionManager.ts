/**
 * Session Manager
 * 
 * Manages all active voice agent sessions
 */

import { VoiceAgent } from "../core/VoiceAgent";

export class SessionManager {
  private sessions: Map<string, VoiceAgent> = new Map();

  public create(streamSid: string, agent: VoiceAgent): void {
    this.sessions.set(streamSid, agent);
    console.log(`[SessionManager] Created session: ${streamSid}`);
  }

  public get(streamSid: string): VoiceAgent | undefined {
    return this.sessions.get(streamSid);
  }

  public has(streamSid: string): boolean {
    return this.sessions.has(streamSid);
  }

  public delete(streamSid: string): void {
    const agent = this.sessions.get(streamSid);
    if (agent) {
      agent.cleanup();
      this.sessions.delete(streamSid);
      console.log(`[SessionManager] Deleted session: ${streamSid}`);
    }
  }

  public getCount(): number {
    return this.sessions.size;
  }

  public getAllSessions(): VoiceAgent[] {
    return Array.from(this.sessions.values());
  }
}
