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
import { AudioRouter } from "./AudioRouter";
import { createLLMAgent } from "../managers/LLMManager";
import { createClient, LiveTTSEvents } from "@deepgram/sdk";
import type { LiveClient, SpeakLiveClient } from "@deepgram/sdk";

export class ConferenceSession {
  private callerAgent: VoiceAgent | null = null;
  private ownerAgent: VoiceAgent | null = null;
  private conversation: ConversationManager;
  private router: AudioRouter;
  private llmAgent: Agent<{}, never, never> | null = null;
  private tts: SpeakLiveClient | null = null; // Deepgram TTS connection
  private ttsReady: boolean = false; // Track if TTS connection is open
  private isActive: boolean = true;
  private abortController: AbortController | null = null;

  constructor() {
    this.conversation = new ConversationManager();
    this.conversation.enableConferenceMode(); // Enable multi-speaker tracking
    this.router = new AudioRouter();

    // Don't create TTS yet - will be created when Jordan first speaks

    console.log(`[ConferenceSession] Created new conference session`);
  }

  /**
   * Setup Deepgram TTS for Jordan's voice (single TTS, fanout to both calls)
   * Called lazily when Jordan first needs to speak
   */
  private setupJordanTTS(): void {
    if (this.tts) {
      return; // Already setup
    }

    console.log(`[ConferenceSession] 🎙️  Setting up Jordan's TTS connection...`);

    const deepgram = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

    this.tts = deepgram.speak.live({
      model: "aura-2-thalia-en",
      encoding: "mulaw",
      sample_rate: 8000
    });

    this.tts.on(LiveTTSEvents.Open, () => {
      console.log(`[ConferenceSession] 🎙️  Jordan's TTS connected`);
      this.ttsReady = true;
    });

    this.tts.on(LiveTTSEvents.Audio, (audio: Uint8Array) => {
      // Send the SAME audio chunk DIRECTLY to BOTH Twilio WebSockets
      // Bypass AudioController to avoid gate interference
      const b64 = audio.toBase64();

      console.log(`[ConferenceSession] 🔊 Jordan audio chunk: ${b64.length} bytes -> sending directly to both WebSockets`);

      // Send to caller's Twilio WebSocket
      if (this.callerAgent) {
        const callerMsg = {
          event: "media",
          streamSid: this.callerAgent.getStreamSid(),
          media: { payload: b64 }
        };
        this.callerAgent.getWebSocket().send(JSON.stringify(callerMsg));
      }

      // Send to owner's Twilio WebSocket
      if (this.ownerAgent) {
        const ownerMsg = {
          event: "media",
          streamSid: this.ownerAgent.getStreamSid(),
          media: { payload: b64 }
        };
        this.ownerAgent.getWebSocket().send(JSON.stringify(ownerMsg));
      }
    });

    this.tts.on(LiveTTSEvents.Flushed, () => {
      console.log(`[ConferenceSession] 🎙️  Jordan's TTS flushed`);
    });

    this.tts.on(LiveTTSEvents.Error, (error: any) => {
      console.error(`[ConferenceSession] TTS error:`, error);
    });

    this.tts.on(LiveTTSEvents.Close, () => {
      console.log(`[ConferenceSession] 🎙️  Jordan's TTS closed`);
      this.ttsReady = false;
    });
  }

  /**
   * Wait for TTS connection to be ready
   */
  private async waitForTTSReady(timeoutMs: number = 5000): Promise<boolean> {
    const startTime = Date.now();

    while (!this.ttsReady && Date.now() - startTime < timeoutMs) {
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms
    }

    return this.ttsReady;
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

    // Setup TTS if not already setup (lazy initialization)
    this.setupJordanTTS();

    if (!this.tts) {
      console.warn(`[ConferenceSession] Cannot generate response - TTS setup failed`);
      return;
    }

    // Wait for TTS connection to be ready
    console.log(`[ConferenceSession] ⏳ Waiting for TTS connection...`);
    const ready = await this.waitForTTSReady();
    if (!ready) {
      console.error(`[ConferenceSession] TTS connection timeout - cannot generate response`);
      return;
    }
    console.log(`[ConferenceSession] ✅ TTS ready`);

    try {
      console.log(`[ConferenceSession] 🤖 Jordan generating response...`);

      this.abortController = new AbortController();
      this.conversation.startAssistantMessage();

      const result = await this.llmAgent.stream({
        prompt: this.conversation.getMessages()
      });

      // ACCUMULATE the full response first (don't stream to TTS yet)
      let fullResponse = "";
      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          const text = chunk.text;
          fullResponse += text;
          this.conversation.appendToAssistantMessage(text);
          console.log(`[ConferenceSession] 🤖 Jordan: "${text}"`);
        }
      }

      // Complete the partial message tracking
      this.conversation.completeAssistantMessage();

      // Add the FULL response (including tool calls/results) to conversation
      // This ensures tool calls are properly tracked in conversation history
      const response = await result.response;
      this.conversation.addAssistantMessage(response.messages[0] as AssistantModelMessage);

      // NOW send the COMPLETE response to TTS all at once
      console.log(`[ConferenceSession] 📤 Sending complete response to TTS: "${fullResponse}"`);
      this.tts.sendText(fullResponse);

      // Flush the SINGLE TTS (audio will go to both calls)
      console.log(`[ConferenceSession] 🤖 Flushing Jordan's TTS`);
      this.tts.flush();

      console.log(`[ConferenceSession] 🤖 Jordan response complete`);

    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log(`[ConferenceSession] Jordan response aborted`);
        } else {
          console.error(`[ConferenceSession] Error generating Jordan response:`, error);
        }
      } else {
        console.error("Unknown ConferenceSession error:", error);
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

    // Close the shared TTS connection
    if (this.tts) {
      this.tts.requestClose();
      this.tts = null;
    }

    // Note: We don't cleanup the individual agents here
    // That's handled by SessionManager when calls end
  }
}
