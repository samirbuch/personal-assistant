/**
 * Voice Agent
 * 
 * Main orchestrator for a voice conversation session.
 * Coordinates state machine, audio, conversation, and LLM.
 */

import type Bun from "bun";
import type { LiveClient, SpeakLiveClient } from "@deepgram/sdk";
import type { Experimental_Agent as Agent } from "ai";
import { VoiceAgentStateMachine, AgentState } from "./StateMachine";
import { AudioController } from "./AudioController";
import { ConversationManager } from "./ConversationManager";
import { InterruptionDetector } from "./InterruptionDetector";

export interface VoiceAgentConfig {
  ws: Bun.ServerWebSocket;
  streamSid: string;
  callSid: string;
  stt: LiveClient;
  tts: SpeakLiveClient;
  agent?: Agent<{}, never, never>; // Optional - can be set later
}

export class VoiceAgent {
  private streamSid: string;
  private callSid: string;
  private stateMachine: VoiceAgentStateMachine;
  private audio: AudioController;
  private conversation: ConversationManager;
  private interruption: InterruptionDetector;
  private stt: LiveClient;
  private tts: SpeakLiveClient;
  private agent!: Agent<{}, never, never>; // Will be set after construction
  private abortController: AbortController | null = null;
  private audioInFlight: boolean = false; // Track if TTS is still sending audio

  constructor(config: VoiceAgentConfig) {
    this.streamSid = config.streamSid;
    this.callSid = config.callSid;
    this.stt = config.stt;
    this.tts = config.tts;
    if (config.agent) {
      this.agent = config.agent;
    }

    // Initialize core components
    this.stateMachine = new VoiceAgentStateMachine();
    this.audio = new AudioController(config.ws, config.streamSid);
    this.conversation = new ConversationManager();
    this.interruption = new InterruptionDetector();

    // Set up state change reactions
    this.setupStateHandlers();
  }

  /**
   * Initialize the agent - transition to LISTENING
   */
  public async initialize(): Promise<void> {
    console.log(`[VoiceAgent ${this.streamSid}] Initializing...`);
    this.stateMachine.transition(AgentState.LISTENING, "Call started");
  }

  /**
   * Handle incoming audio from user
   */
  public async handleIncomingAudio(mulawBase64: string): Promise<void> {
    // Send to STT always
    const buffer = Uint8Array.fromBase64(mulawBase64);
    this.stt.send(buffer.buffer);

    // Don't use audio-based interruption detection - rely on transcript-based only
    // This avoids false positives from user's own trailing audio
  }

  /**
   * Handle user transcript from STT
   */
  public async handleTranscript(transcript: string): Promise<void> {
    const currentState = this.stateMachine.getState();
    
    // If we receive a transcript while SPEAKING, that's an interruption
    if (currentState === AgentState.SPEAKING) {
      console.log(`[VoiceAgent] User interrupted with: "${transcript}"`);
      this.handleInterruption();
      
      // Add to conversation
      this.conversation.addUserMessage(transcript);

      // Transition to thinking
      this.stateMachine.transition(AgentState.THINKING, "Processing user input");

      // Generate response
      await this.generateResponse();
      return;
    }
    
    // Accept transcripts in LISTENING state
    if (currentState === AgentState.LISTENING) {
      console.log(`[VoiceAgent] User said: "${transcript}"`);

      // Add to conversation
      this.conversation.addUserMessage(transcript);

      // Transition to thinking
      this.stateMachine.transition(AgentState.THINKING, "Processing user input");

      // Generate response
      await this.generateResponse();
    } else {
      // Ignore transcripts during THINKING or ERROR states
      console.log(`[VoiceAgent] Ignoring transcript "${transcript}" - state is ${currentState}`);
    }
  }

  /**
   * Handle interruption - stop speaking immediately
   */
  private handleInterruption(): void {
    console.log(`[VoiceAgent] 🚨 INTERRUPTION DETECTED`);

    // Transition to interrupted state
    this.stateMachine.transition(AgentState.INTERRUPTED, "User interrupted");

    // Stop audio IMMEDIATELY
    this.audio.stopImmediately();

    // Abort LLM generation
    if (this.abortController) {
      this.abortController.abort("interrupted");
      this.abortController = null;
    }

    // Clear TTS queue - stop any pending audio
    try {
      this.tts.clear();
    } catch (error) {
      // Ignore errors from clearing TTS
    }

    // Save partial response
    this.conversation.handleInterruption();

    // Return to listening
    this.stateMachine.transition(AgentState.LISTENING, "Ready for new input");
  }

  /**
   * Generate LLM response
   */
  private async generateResponse(): Promise<void> {
    try {
      // Create new abort controller for this response
      this.abortController = new AbortController();

      const result = await this.agent.stream({
        prompt: this.conversation.getMessages()
      });

      // Transition to speaking
      this.stateMachine.transition(AgentState.SPEAKING, "Generating response");
      this.conversation.startAssistantMessage();

      // Stream text to TTS
      for await (const chunk of result.textStream) {
        // Check if we're still speaking (could have been interrupted)
        if (!this.stateMachine.is(AgentState.SPEAKING)) {
          console.log(`[VoiceAgent] LLM stream cancelled`);
          break;
        }

        this.conversation.appendToAssistantMessage(chunk);
        this.tts.sendText(chunk);
      }

      // Flush TTS
      if (this.stateMachine.is(AgentState.SPEAKING)) {
        this.tts.flush();
        this.conversation.completeAssistantMessage();
        
        // Don't transition here - let handleTTSFlushed() handle the transition
        // This keeps us in SPEAKING state so interruptions can still be detected
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`[VoiceAgent] LLM generation aborted`);
      } else {
        console.error(`[VoiceAgent] Error generating response:`, error);
        // Return to listening on error
        this.stateMachine.transition(AgentState.LISTENING, "Error occurred");
      }
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Handle outgoing TTS audio
   */
  public handleTTSAudio(audioBase64: string): void {
    // Track that we're receiving audio
    this.audioInFlight = true;
    
    // Audio controller decides if it flows
    this.audio.sendAudio(audioBase64);
  }

  /**
   * Called when TTS has flushed and no more audio is coming
   */
  public handleTTSFlushed(): void {
    console.log(`[VoiceAgent] TTS flushed - all audio sent`);
    this.audioInFlight = false;
    
    // Transition to LISTENING now that audio is complete
    if (this.stateMachine.is(AgentState.SPEAKING)) {
      this.stateMachine.transition(AgentState.LISTENING, "Response complete");
    }
    
    // Disable audio gate
    this.audio.disable();
  }

  /**
   * Setup reactions to state changes
   */
  private setupStateHandlers(): void {
    this.stateMachine.onStateChange((newState, oldState) => {
      console.log(`[VoiceAgent] State: ${oldState} → ${newState}`);

      // Enable audio when we START speaking
      if (newState === AgentState.SPEAKING) {
        this.audio.enable();
        this.audioInFlight = false; // Reset audio tracking
      }
      
      // When leaving SPEAKING state, disable audio only if no audio in flight
      if (oldState === AgentState.SPEAKING && newState === AgentState.LISTENING) {
        // Don't disable immediately - let handleTTSFlushed() handle it
        // This allows all buffered audio to flow through
        console.log(`[VoiceAgent] Waiting for TTS to finish before closing audio gate...`);
      }
    });
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    console.log(`[VoiceAgent] Cleaning up...`);
    
    if (this.abortController) {
      this.abortController.abort("cleanup");
    }

    this.audio.stopImmediately();
    this.stt.requestClose();
    this.tts.requestClose();
    this.stateMachine.reset();
  }

  /**
   * Get current state
   */
  public getState(): AgentState {
    return this.stateMachine.getState();
  }

  /**
   * Get conversation history
   */
  public getConversation() {
    return this.conversation;
  }

  /**
   * Set the LLM agent (called after construction)
   */
  public setAgent(agent: Agent<{}, never, never>): void {
    this.agent = agent;
  }

  /**
   * Get call SID
   */
  public getCallSid(): string {
    return this.callSid;
  }

  /**
   * Send DTMF tones over the connection
   */
  public sendDTMF(digits: string): void {
    console.log(`[VoiceAgent] Sending DTMF: ${digits}`);
    
    // Send each digit as a separate message
    for (const digit of digits) {
      const dtmfMessage = {
        event: "dtmf",
        streamSid: this.streamSid,
        dtmf: {
          digit: digit
        }
      };
      
      this.audio["ws"].send(JSON.stringify(dtmfMessage));
    }
  }

  /**
   * Hang up the call
   */
  public async hangUp(): Promise<void> {
    console.log(`[VoiceAgent] Hanging up call ${this.callSid}`);
    
    // Use the hangup API endpoint
    const publicURL = process.env.PUBLIC_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const port = process.env.PORT || 40451;
    const isNgrok = publicURL?.includes(".ngrok-free.app");
    const url = `http://${publicURL}${isNgrok ? "" : `:${port}`}/api/hangup/${this.streamSid}`;
    
    try {
      const response = await fetch(url, { method: "POST" });
      if (!response.ok) {
        console.error(`[VoiceAgent] Failed to hang up: ${response.statusText}`);
      }
    } catch (error) {
      console.error(`[VoiceAgent] Error hanging up:`, error);
    }
  }
}
