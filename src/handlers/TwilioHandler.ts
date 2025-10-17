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

const sessions = new SessionManager();

export async function handleStart(
  message: TwilioWebsocket.StartMessage,
  ws: any
): Promise<void> {
  const { streamSid } = message;
  console.log(`\n[Twilio] ═══ CALL START ═══ ${streamSid}`);

  // Create Deepgram connections
  const stt = createSTT();
  const tts = createTTS();
  const agent = createLLMAgent();

  // Create voice agent
  const voiceAgent = new VoiceAgent({
    ws,
    streamSid,
    stt,
    tts,
    agent
  });

  // Set up handlers
  setupSTTHandlers(stt, voiceAgent, streamSid);
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
