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
import { ConversationManager, Speaker } from "./ConversationManager";
import { InterruptionDetector } from "./InterruptionDetector";

export interface VoiceAgentConfig {
  ws: Bun.ServerWebSocket;
  streamSid: string;
  callSid: string;
  stt: LiveClient;
  tts: SpeakLiveClient;
  agent?: Agent<{}, never, never>; // Optional - can be set later
  callerPhone?: string; // Caller's phone number for verification
  role?: "caller" | "owner"; // Role in conference (if applicable)
}

export enum AgentRole {
  SOLO = "solo",      // Standalone call (not in conference)
  CALLER = "caller",  // Original caller in a conference
  OWNER = "owner"     // Owner who joined the conference
}

export class VoiceAgent {
  private streamSid: string;
  private callSid: string;
  private callerPhone?: string;
  private role: AgentRole;
  private stateMachine: VoiceAgentStateMachine;
  private audio: AudioController;
  private conversation: ConversationManager;
  private interruption: InterruptionDetector;
  private stt: LiveClient;
  private tts: SpeakLiveClient;
  private agent!: Agent<{}, never, never>; // Will be set after construction
  private abortController: AbortController | null = null;
  private audioInFlight: boolean = false;
  
  // Conference mode
  private conferenceSession: any | null = null; // ConferenceSession reference (any to avoid circular dependency)

  constructor(config: VoiceAgentConfig) {
    this.streamSid = config.streamSid;
    this.callSid = config.callSid;
    this.callerPhone = config.callerPhone;
    this.role = config.role === "owner" ? AgentRole.OWNER : 
                config.role === "caller" ? AgentRole.CALLER : 
                AgentRole.SOLO;
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
    // Send to STT always (for Jordan to listen)
    const buffer = Uint8Array.fromBase64(mulawBase64);
    this.stt.send(buffer.buffer);

    // If in conference, route RAW AUDIO directly to the other call
    if (this.conferenceSession) {
      this.conferenceSession.routeRawAudio(this.role!, mulawBase64);
    }

    // Don't use audio-based interruption detection - rely on transcript-based only
    // This avoids false positives from user's own trailing audio
  }

  /**
   * Handle user transcript from STT
   * @param transcript The transcribed text
   * @param speakerId Optional speaker ID from diarization (used in conference mode)
   */
  public async handleTranscript(transcript: string, speakerId?: number): Promise<void> {
    // If in conference mode, delegate to ConferenceSession
    if (this.conferenceSession) {
      const speaker = this.role === AgentRole.CALLER ? Speaker.CALLER : Speaker.OWNER;
      console.log(`[VoiceAgent ${this.streamSid}] Conference mode - delegating transcript to ConferenceSession`);
      await this.conferenceSession.onTranscript(speaker, transcript);
      return;
    }
    
    // Solo mode - handle normally
    const currentState = this.stateMachine.getState();
    
    // If we receive a transcript while SPEAKING, that's an interruption
    if (currentState === AgentState.SPEAKING) {
      console.log(`[VoiceAgent] User interrupted with: "${transcript}"`);
      this.handleInterruption();
      
      // Add to conversation
      this.conversation.addUserMessage(transcript, speakerId);

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
      this.conversation.addUserMessage(transcript, speakerId);

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

      // Use fullStream to get both text deltas AND tool calls as they happen
      for await (const chunk of result.fullStream) {
        // Check if we're still speaking (could have been interrupted)
        if (!this.stateMachine.is(AgentState.SPEAKING)) {
          console.log(`[VoiceAgent] LLM stream cancelled`);
          break;
        }

        // Handle different chunk types based on TextStreamPart
        switch (chunk.type) {
          case 'text-delta':
            // Text content - send immediately to TTS
            this.conversation.appendToAssistantMessage(chunk.text);
            this.tts.sendText(chunk.text);
            console.log(`[VoiceAgent] 📝 Text: "${chunk.text}"`);
            break;

          case 'text-start':
            console.log(`[VoiceAgent] 📝 Text started (id: ${chunk.id})`);
            break;

          case 'text-end':
            console.log(`[VoiceAgent] 📝 Text ended (id: ${chunk.id})`);
            break;

          case 'reasoning-delta':
            // Reasoning text - could optionally send to TTS or just log
            console.log(`[VoiceAgent] 🤔 Reasoning: "${chunk.text}"`);
            break;

          case 'reasoning-start':
            console.log(`[VoiceAgent] 🤔 Reasoning started`);
            break;

          case 'reasoning-end':
            console.log(`[VoiceAgent] 🤔 Reasoning ended`);
            break;

          case 'tool-call':
            console.log(`[VoiceAgent] 🔧 Tool call: ${chunk.toolName} (id: ${chunk.toolCallId})`);
            break;

          case 'tool-result':
            console.log(`[VoiceAgent] ✅ Tool result: ${chunk.toolName}`);
            break;

          case 'tool-error':
            console.log(`[VoiceAgent] ❌ Tool error: ${chunk.toolName} - ${chunk.error}`);
            break;

          case 'tool-input-start':
            console.log(`[VoiceAgent] 🔧 Tool input starting: ${chunk.toolName}`);
            break;

          case 'tool-input-delta':
            console.log(`[VoiceAgent] 🔧 Tool input delta: ${chunk.delta}`);
            break;

          case 'tool-input-end':
            console.log(`[VoiceAgent] 🔧 Tool input complete`);
            break;

          case 'start-step':
            console.log(`[VoiceAgent] 🚀 Step started`);
            break;

          case 'finish-step':
            console.log(`[VoiceAgent] 🏁 Step finished (reason: ${chunk.finishReason})`);
            break;

          case 'start':
            console.log(`[VoiceAgent] ▶️  Stream started`);
            break;

          case 'finish':
            console.log(`[VoiceAgent] ✔️  Stream finished (reason: ${chunk.finishReason})`);
            break;

          case 'error':
            console.error(`[VoiceAgent] ❌ Stream error:`, chunk.error);
            break;

          case 'abort':
            console.log(`[VoiceAgent] ⏹️  Stream aborted`);
            break;

          case 'source':
          case 'file':
          case 'raw':
            // These types exist but we don't need to handle them for voice
            break;

          default:
            // This should never happen due to TypeScript exhaustive checking
            console.log(`[VoiceAgent] ⚠️  Unhandled chunk type:`, chunk);
        }
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
   * Get caller's phone number
   */
  public getCallerPhone(): string | undefined {
    return this.callerPhone;
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
   * Transfer the call to a human by creating a dual-call conference
   * 
   * New Architecture: Dual-Call Audio Mixing
   * 1. AI announces the transfer
   * 2. Creates a ConferenceSession
   * 3. Initiates a second call to the owner
   * 4. Both calls' audio is routed through the ConferenceSession
   * 5. Jordan (AI) can participate when directly addressed
   */
  public async transferToHuman(reason: string): Promise<void> {
    console.log(`[VoiceAgent] 🎙️  Transferring to human: ${reason}`);
    
    const ownerPhone = process.env.OWNER_PHONE_NUMBER;
    const ownerName = process.env.OWNER_NAME || "a team member";
    
    if (!ownerPhone) {
      throw new Error("OWNER_PHONE_NUMBER not configured");
    }

    // Step 1: Announce the transfer to the caller
    console.log(`[VoiceAgent] Announcing transfer to caller...`);
    this.stateMachine.transition(AgentState.SPEAKING, "Announcing transfer to human");
    
    const announcement = `One moment please, let me connect you with ${ownerName}.`;
    
    // Send announcement to TTS
    this.audio.enable();
    this.tts.sendText(announcement);
    this.tts.flush();
    
    // Wait for the announcement to be spoken
    console.log(`[VoiceAgent] Waiting for announcement to complete...`);
    await new Promise(resolve => setTimeout(resolve, 3500));
    
    // Step 2: Initiate the conference via API
    console.log(`[VoiceAgent] Initiating dual-call conference...`);
    
    const publicURL = process.env.PUBLIC_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const port = process.env.PORT || 40451;
    const isNgrok = publicURL?.includes(".ngrok-free.app");
    const url = `http://${publicURL}${isNgrok ? "" : `:${port}`}/api/initiate-conference/${this.streamSid}`;
    
    try {
      const response = await fetch(url, { 
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to initiate conference: ${response.statusText}`);
      }
      
      const data = await response.json() as { conferenceId: string };
      console.log(`[VoiceAgent] ✅ Conference ${data.conferenceId} initiated`);
      console.log(`[VoiceAgent] 🎙️  3-way call active - Jordan will respond when addressed`);
      
      // Already in LISTENING state from the announcement, no need to transition
      // The agent is now in conference mode and will delegate to ConferenceSession
      
    } catch (error) {
      console.error(`[VoiceAgent] Error initiating conference:`, error);
      // On error, ensure we're in listening state so conversation can continue
      const currentState = this.stateMachine.getState();
      if (currentState !== AgentState.LISTENING) {
        this.stateMachine.transition(AgentState.LISTENING, "Transfer failed");
      }
      throw error;
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

  /**
   * Join a conference session
   * Called when this agent becomes part of a paired conference
   */
  public joinConference(conferenceSession: any): void {
    this.conferenceSession = conferenceSession;
    console.log(`[VoiceAgent ${this.streamSid}] Joined conference as ${this.role}`);
  }

  /**
   * Leave conference session
   */
  public leaveConference(): void {
    this.conferenceSession = null;
    console.log(`[VoiceAgent ${this.streamSid}] Left conference`);
  }

  /**
   * Send raw audio directly to Twilio (used for human-to-human audio routing in conference)
   */
  public sendRawAudio(mulawBase64: string): void {
    const msg: any = {
      event: "media",
      streamSid: this.streamSid,
      media: { payload: mulawBase64 }
    };
    this.audio.ws.send(JSON.stringify(msg));
  }

  /**
   * Speak text directly (used by ConferenceSession for Jordan's responses)
   * This bypasses the LLM and sends text directly to TTS
   */
  public async speakText(text: string): Promise<void> {
    console.log(`[VoiceAgent ${this.streamSid}] Speaking Jordan's text: "${text.slice(0, 50)}..."`);
    
    // Enable audio before sending (important for conference mode)
    this.audio.enable();
    
    // Send the text to TTS and flush immediately
    this.tts.sendText(text);
    this.tts.flush();
  }

  /**
   * Flush TTS buffer (used by ConferenceSession)
   */
  public async flushTTS(): Promise<void> {
    this.tts.flush();
  }

  /**
   * Get role
   */
  public getRole(): AgentRole {
    return this.role;
  }

  /**
   * Check if in conference
   */
  public isInConference(): boolean {
    return this.conferenceSession !== null;
  }
}
