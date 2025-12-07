/**
 * Session Manager
 * 
 * Manages all active voice agent sessions
 */

import { VoiceAgent } from "../core/VoiceAgent";

export class SessionManager {
  private agents: Map<string, VoiceAgent> = new Map(); // streamSid -> VoiceAgent

  /**
   * Create a voice agent session
   */
  public create(streamSid: string, agent: VoiceAgent): void {
    this.agents.set(streamSid, agent);
    console.log(`[SessionManager] Created session: ${streamSid}`);
  }

  /**
   * Get a voice agent by streamSid
   */
  public getAgent(streamSid: string): VoiceAgent | undefined {
    return this.agents.get(streamSid);
  }

  /**
   * Check if agent exists
   */
  public has(streamSid: string): boolean {
    return this.agents.has(streamSid);
  }

  /**
   * Delete an agent
   */
  public async delete(streamSid: string): Promise<void> {
    const agent = this.agents.get(streamSid);
    if (agent) {
      await agent.cleanup();
      this.agents.delete(streamSid);
      console.log(`[SessionManager] Deleted agent: ${streamSid}`);
    }
  }

  /**
   * Get count of agents
   */
  public getCount(): number {
    return this.agents.size;
  }

  /**
   * Get all agents
   */
  public getAllAgents(): VoiceAgent[] {
    return Array.from(this.agents.values());
  }
}
