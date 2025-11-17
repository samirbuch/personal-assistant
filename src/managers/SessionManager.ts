/**
 * Session Manager
 * 
 * Manages all active voice agent sessions
 * Handles both solo VoiceAgents and ConferenceSession pairs
 */

import { VoiceAgent } from "../core/VoiceAgent";
import { ConferenceSession } from "../core/ConferenceSession";

export class SessionManager {
  private agents: Map<string, VoiceAgent> = new Map(); // streamSid -> VoiceAgent (always)
  private conferences: Map<string, ConferenceSession> = new Map(); // conferenceId -> ConferenceSession

  /**
   * Create a solo voice agent session
   */
  public create(streamSid: string, agent: VoiceAgent): void {
    this.agents.set(streamSid, agent);
    console.log(`[SessionManager] Created solo session: ${streamSid}`);
  }

  /**
   * Create a conference session
   */
  public createConference(conferenceId: string): ConferenceSession {
    const conference = new ConferenceSession();
    this.conferences.set(conferenceId, conference);
    console.log(`[SessionManager] Created conference: ${conferenceId}`);
    return conference;
  }

  /**
   * Get a voice agent by streamSid
   */
  public getAgent(streamSid: string): VoiceAgent | undefined {
    return this.agents.get(streamSid);
  }

  /**
   * Get a conference by ID
   */
  public getConference(conferenceId: string): ConferenceSession | undefined {
    return this.conferences.get(conferenceId);
  }

  /**
   * Add an agent to an existing conference
   */
  public addToConference(
    streamSid: string,
    agent: VoiceAgent,
    conference: ConferenceSession,
    role: "caller" | "owner"
  ): void {
    // Keep agent in the map (for media routing)
    this.agents.set(streamSid, agent);
    
    // Join the agent to the conference
    agent.joinConference(conference);
    
    if (role === "caller") {
      conference.setCallerAgent(agent);
    } else {
      conference.setOwnerAgent(agent);
    }
    
    console.log(`[SessionManager] Added ${role} agent to conference`);
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
  public delete(streamSid: string): void {
    const agent = this.agents.get(streamSid);
    if (agent) {
      agent.cleanup();
      this.agents.delete(streamSid);
      console.log(`[SessionManager] Deleted agent: ${streamSid}`);
    }
  }

  /**
   * Delete a conference
   */
  public deleteConference(conferenceId: string): void {
    const conference = this.conferences.get(conferenceId);
    if (conference) {
      conference.cleanup();
      this.conferences.delete(conferenceId);
      console.log(`[SessionManager] Deleted conference: ${conferenceId}`);
    }
  }

  /**
   * Get count of agents
   */
  public getCount(): number {
    return this.agents.size;
  }

  /**
   * Get count of conferences
   */
  public getConferenceCount(): number {
    return this.conferences.size;
  }

  /**
   * Get all agents
   */
  public getAllAgents(): VoiceAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get all conferences
   */
  public getAllConferences(): ConferenceSession[] {
    return Array.from(this.conferences.values());
  }
}
