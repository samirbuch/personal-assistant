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
  stt: LiveClient;
  tts: SpeakLiveClient;
  agent: Agent<{}, never, never>;
}

export class VoiceAgent {
  private streamSid: string;
  private stateMachine: VoiceAgentStateMachine;
  private audio: AudioController;
  private conversation: ConversationManager;
  private interruption: InterruptionDetector;
  private stt: LiveClient;
  private tts: SpeakLiveClient;
  private agent: Agent<{}, never, never>;
  private abortController: AbortController | null = null;
  private audioInFlight: boolean = false; // Track if TTS is still sending audio

  constructor(config: VoiceAgentConfig) {
    this.streamSid = config.streamSid;
    this.stt = config.stt;
    this.tts = config.tts;
    this.agent = config.agent;

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
    // Send to STT
    const buffer = Uint8Array.fromBase64(mulawBase64);
    this.stt.send(buffer.buffer);

    // TODO: INTERRUPTION DISABLED FOR TESTING
    // Check for interruption ONLY when speaking
    // if (this.stateMachine.is(AgentState.SPEAKING)) {
    //   if (this.interruption.shouldInterrupt(mulawBase64)) {
    //     this.handleInterruption();
    //   }
    // }
  }

  /**
   * Handle user transcript from STT
   */
  public async handleTranscript(transcript: string): Promise<void> {
    // Only process transcripts when listening
    if (!this.stateMachine.is(AgentState.LISTENING)) {
      console.log(`[VoiceAgent] Ignoring transcript - state is ${this.stateMachine.getState()}`);
      return;
    }

    console.log(`[VoiceAgent] User said: "${transcript}"`);

    // Add to conversation
    this.conversation.addUserMessage(transcript);

    // Transition to thinking
    this.stateMachine.transition(AgentState.THINKING, "Processing user input");

    // Generate response
    await this.generateResponse();
  }

  /**
   * Handle interruption - stop speaking immediately
   */
  private handleInterruption(): void {
    // TODO: INTERRUPTION DISABLED FOR TESTING
    console.log(`[VoiceAgent] 🚨 INTERRUPTION DETECTED (DISABLED)`);
    return;

    // console.log(`[VoiceAgent] 🚨 INTERRUPTION DETECTED`);
    //
    // // Transition to interrupted state
    // this.stateMachine.transition(AgentState.INTERRUPTED, "User interrupted");
    //
    // // Stop audio IMMEDIATELY
    // this.audio.stopImmediately();
    //
    // // Abort LLM generation
    // if (this.abortController) {
    //   this.abortController.abort("interrupted");
    //   this.abortController = null;
    // }
    //
    // // Save partial response
    // this.conversation.handleInterruption();
    //
    // // Return to listening
    // this.stateMachine.transition(AgentState.LISTENING, "Ready for new input");
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
        
        // Wait a moment for final audio, then transition to listening
        setTimeout(() => {
          if (this.stateMachine.is(AgentState.SPEAKING)) {
            this.stateMachine.transition(AgentState.LISTENING, "Response complete");
          }
        }, 500);
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
    
    // If we're done speaking and no audio in flight, we can safely disable audio
    if (!this.stateMachine.is(AgentState.SPEAKING)) {
      this.audio.disable();
    }
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
}
