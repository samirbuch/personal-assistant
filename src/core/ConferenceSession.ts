/**
 * Conference Session
 * 
 * Manages a "virtual 3-way call" by coordinating two separate Twilio calls:
 * - Call A: Original caller (barbershop, etc.)
 * - Call B: Owner joining to help
 * 
 * Routes audio between the calls and coordinates Jordan's (AI) participation.
 */

import type { VoiceAgent } from "./VoiceAgent";
import type { Experimental_Agent as Agent, AssistantModelMessage } from "ai";
import { ConversationManager, Speaker } from "./ConversationManager";
import { createLLMAgent } from "../managers/LLMManager";
import { createClient, LiveTTSEvents } from "@deepgram/sdk";
import type { LiveClient, SpeakLiveClient } from "@deepgram/sdk";

export class ConferenceSession {
  private callerAgent: VoiceAgent | null = null;
  private ownerAgent: VoiceAgent | null = null;
  private conversation: ConversationManager;
  private tts: SpeakLiveClient | null = null; // Deepgram TTS connection
  private isActive: boolean = true;
  private abortController: AbortController | null = null;

  constructor() {
    this.conversation = new ConversationManager();
    this.conversation.enableConferenceMode(); // Enable multi-speaker tracking

    // Don't create TTS yet - will be created when Jordan first speaks

    console.log(`[ConferenceSession] Created new conference session`);
  }

  /**
   * Set the caller's VoiceAgent (Call A)
   */
  public setCallerAgent(agent: VoiceAgent): void {
    this.callerAgent = agent;
    console.log(`[ConferenceSession] Caller agent connected`);
  }

  /**
   * Set the owner's VoiceAgent (Call B)
   */
  public async setOwnerAgent(agent: VoiceAgent): Promise<void> {
    this.ownerAgent = agent;
    console.log(`[ConferenceSession] Owner agent connected`);
  }

  /**
   * Route raw audio from one call to the other
   * This creates direct human-to-human audio connection
   */
  public routeRawAudio(fromSpeaker: Speaker.CALLER | Speaker.OWNER, mulawBase64: string): void {
    // Route to the OTHER agent
    const targetAgent = fromSpeaker === Speaker.CALLER ? this.ownerAgent : this.callerAgent;

    if (targetAgent) {
      targetAgent.sendRawAudio(mulawBase64);
    }
  }

  /**
   * Handle transcript from either call
   * This is called by VoiceAgent when STT produces a transcript
   */
  public async onTranscript(
    speaker: Speaker.CALLER | Speaker.OWNER,
    transcript: string
  ): Promise<void> {
    if (!this.isActive) {
      console.warn(`[ConferenceSession] Ignoring transcript - session inactive`);
      return;
    }

    console.log(`[ConferenceSession] 🎙️  ${speaker} said: "${transcript}"`);

    // Add to shared conversation history
    this.conversation.addUserMessage(transcript, speaker);
  }

  /**
   * Get the shared conversation history
   */
  public getConversation(): ConversationManager {
    return this.conversation;
  }

  /**
   * Get caller agent
   */
  public getCallerAgent(): VoiceAgent | null {
    return this.callerAgent;
  }

  /**
   * Get owner agent
   */
  public getOwnerAgent(): VoiceAgent | null {
    return this.ownerAgent;
  }

  /**
   * Check if both agents are connected
   */
  public isFullyConnected(): boolean {
    return this.callerAgent !== null && this.ownerAgent !== null;
  }

  /**
   * End the conference session
   */
  public cleanup(): void {
    console.log(`[ConferenceSession] Cleaning up conference session`);

    this.isActive = false;

    if (this.abortController) {
      this.abortController.abort("cleanup");
    }

    // Close the shared TTS connection
    if (this.tts) {
      this.tts.requestClose();
      this.tts = null;
    }

    // Note: We don't cleanup the individual agents here
    // That's handled by SessionManager when calls end
  }
}
