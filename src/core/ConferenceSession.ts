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
import type { Experimental_Agent as Agent } from "ai";
import { ConversationManager, Speaker } from "./ConversationManager";
import { AudioRouter } from "./AudioRouter";
import { createLLMAgent } from "../managers/LLMManager";

export class ConferenceSession {
  private callerAgent: VoiceAgent | null = null;
  private ownerAgent: VoiceAgent | null = null;
  private conversation: ConversationManager;
  private router: AudioRouter;
  private llmAgent: Agent<{}, never, never> | null = null;
  private isActive: boolean = true;
  private abortController: AbortController | null = null;

  constructor() {
    this.conversation = new ConversationManager();
    this.conversation.enableConferenceMode(); // Enable multi-speaker tracking
    this.router = new AudioRouter();
    
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
    
    // Now that we have both agents, initialize LLM with tools
    // Note: We can't pass VoiceAgent to LLM tools anymore since we have TWO agents
    // We'll need to refactor LLM tools to work at ConferenceSession level
    this.llmAgent = await createLLMAgent();
    
    console.log(`[ConferenceSession] Conference fully initialized - ready for 3-way conversation`);
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

    // Ask ResponseGatekeeper if Jordan should respond
    const decision = await this.router.route(
      speaker,
      transcript,
      this.conversation.getMessages()
    );

    // Jordan should respond?
    if (decision.jordanShouldRespond) {
      console.log(`[ConferenceSession] 🤖 Jordan will respond: ${decision.reasoning}`);
      await this.generateJordanResponse();
    } else {
      console.log(`[ConferenceSession] 🤫 Jordan staying silent: ${decision.reasoning}`);
    }
  }

  /**
   * Generate Jordan's response and send to BOTH calls
   */
  private async generateJordanResponse(): Promise<void> {
    if (!this.llmAgent) {
      console.warn(`[ConferenceSession] Cannot generate response - LLM not initialized`);
      return;
    }

    if (!this.callerAgent || !this.ownerAgent) {
      console.warn(`[ConferenceSession] Cannot generate response - both agents not connected`);
      return;
    }

    try {
      console.log(`[ConferenceSession] 🤖 Jordan generating response...`);
      
      this.abortController = new AbortController();
      this.conversation.startAssistantMessage();

      const result = await this.llmAgent.stream({
        prompt: this.conversation.getMessages()
      });

      // Stream Jordan's response to BOTH calls simultaneously
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          const text = chunk.text;
          this.conversation.appendToAssistantMessage(text);
          
          // Send to both agents
          await Promise.all([
            this.callerAgent.speakText(text),
            this.ownerAgent.speakText(text)
          ]);
          
          console.log(`[ConferenceSession] 🤖 Jordan: "${text}"`);
        }
      }

      this.conversation.completeAssistantMessage();
      
      // Flush TTS on both agents
      await Promise.all([
        this.callerAgent.flushTTS(),
        this.ownerAgent.flushTTS()
      ]);

      console.log(`[ConferenceSession] 🤖 Jordan response complete`);

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`[ConferenceSession] Jordan response aborted`);
      } else {
        console.error(`[ConferenceSession] Error generating Jordan response:`, error);
      }
    } finally {
      this.abortController = null;
    }
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
    
    // Note: We don't cleanup the individual agents here
    // That's handled by SessionManager when calls end
  }
}
