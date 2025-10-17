/**
 * Twilio WebSocket Handlers
 * 
 * Handle Twilio WebSocket messages and route to voice agents
 */

import type { TwilioWebsocket } from "../../lib/TwilioWebsocketTypes";
import { SessionManager } from "../managers/SessionManager";
import { VoiceAgent } from "../core/VoiceAgent";
import { createSTT, createTTS, setupSTTHandlers, setupTTSHandlers } from "../managers/DeepgramManager";
import { createLLMAgent } from "../managers/LLMManager";
import { ConferenceManager } from "../managers/ConferenceManager";

const sessions = new SessionManager();
let conferenceManager: ConferenceManager | null = null;

// Initialize conference manager if owner phone is configured
if (process.env.OWNER_PHONE_NUMBER) {
  conferenceManager = new ConferenceManager(process.env.OWNER_PHONE_NUMBER);
}

export async function handleStart(
  message: TwilioWebsocket.StartMessage,
  ws: any
): Promise<void> {
  const { streamSid, start } = message;
  const { callSid, customParameters } = start;
  
  // Extract caller information from custom parameters
  const callerFrom = customParameters?.from as string | undefined;
  const callerTo = customParameters?.to as string | undefined;
  
  console.log(`\n[Twilio] ═══ CALL START ═══`);
  console.log(`  Stream: ${streamSid}`);
  console.log(`  Call: ${callSid}`);
  if (callerFrom) console.log(`  📱 From: ${callerFrom}`);
  if (callerTo) console.log(`  📱 To: ${callerTo}`);

  // Create Deepgram connections
  // Enable diarization for potential future use (doesn't hurt in single-speaker mode)
  const stt = createSTT(true);
  const tts = createTTS();

  // Create voice agent first (without LLM agent)
  const voiceAgent = new VoiceAgent({
    ws,
    streamSid,
    callSid,
    stt,
    tts,
    callerPhone: callerFrom
  });

  // Now create LLM agent with tools that reference voiceAgent
  const agent = await createLLMAgent(voiceAgent);
  voiceAgent.setAgent(agent);

  // Set up handlers
  setupSTTHandlers(stt, voiceAgent, streamSid, true);
  setupTTSHandlers(tts, voiceAgent, streamSid);

  // Register session
  sessions.create(streamSid, voiceAgent);

  // Initialize
  await voiceAgent.initialize();

  console.log(`[Twilio] Agent ready for ${streamSid}`);
}

export async function handleMedia(
  message: TwilioWebsocket.MediaMessage
): Promise<void> {
  const agent = sessions.get(message.streamSid);
  
  if (!agent) {
    console.warn(`[Twilio] No agent found for ${message.streamSid}`);
    return;
  }

  // Pass audio to agent
  await agent.handleIncomingAudio(message.media.payload);
}

export function handleStop(
  message: TwilioWebsocket.StopMessage
): void {
  console.log(`\n[Twilio] ═══ CALL END ═══ ${message.streamSid}`);
  sessions.delete(message.streamSid);
}

export function getSessionCount(): number {
  return sessions.getCount();
}

export function getSession(streamSid: string): VoiceAgent | undefined {
  return sessions.get(streamSid);
}

export function getSessionManager(): SessionManager {
  return sessions;
}

export function getConferenceManager(): ConferenceManager | null {
  return conferenceManager;
}

export async function createConference(streamSid: string, reason: string): Promise<void> {
  const agent = sessions.get(streamSid);
  
  if (!agent) {
    throw new Error(`No agent found for ${streamSid}`);
  }

  if (!conferenceManager) {
    throw new Error("Conference manager not initialized - OWNER_PHONE_NUMBER not set");
  }

  const callSid = agent.getCallSid();
  
  console.log(`[Twilio] Creating conference for ${streamSid} - Reason: ${reason}`);
  
  // Create conference and add owner
  // Note: This will disconnect the AI's media stream (expected for Option 2)
  await conferenceManager.createConferenceAndAddOwner(callSid, streamSid);
  
  console.log(`[Twilio] Conference created - caller and owner will continue without AI`);
}
