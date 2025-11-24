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
import { getProfile } from "../../frontend/supabase";

const sessions = new SessionManager();

export async function handleStart(
  message: TwilioWebsocket.StartMessage,
  ws: any
): Promise<void> {
  const { streamSid, start } = message;
  const { callSid, customParameters } = start;
  
  // Extract caller information
  const callerFrom = customParameters?.from as string | undefined;
  const callerTo = customParameters?.to as string | undefined;
  
  console.log(`\n[Twilio] ═══ CALL START ═══`);
  console.log(`  Stream: ${streamSid}`);
  console.log(`  Call: ${callSid}`);
  if (callerFrom) console.log(`  📱 From: ${callerFrom}`);
  if (callerTo) console.log(`  📱 To: ${callerTo}`);
  if (conferenceId) console.log(`  🎙️  Conference: ${conferenceId}`);
  if (role) console.log(`  👤 Role: ${role}`);

  //user data
  let userContext = undefined;
  if(userID){
    console.log('twillio fetching userID for ${userID}');
    const profile = await getProfile(userID);
    if(profile){
      userContext = {
        first_name: profile.first_name,
        last_name: profile.last_name || "",
        phone: profile.phone_number,
        email: profile.email
      };
    }
  }

  // Create Deepgram connections
  const stt = createSTT();
  const tts = createTTS();
  
  const voiceAgent = new VoiceAgent({
    ws,
    streamSid,
    callSid,
    stt,
    tts,
    callerPhone: callerFrom
  });

  // Create LLM agent with tools that reference voiceAgent
  const agent = await createLLMAgent(voiceAgent, userContext);
  voiceAgent.setAgent(agent);

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
  const agent = sessions.getAgent(message.streamSid);
  
  if (!agent) {
    console.warn(`[Twilio] No agent found for ${message.streamSid}`);
    return;
  }

  // Pass audio directly to the agent
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

export function getSessionManager(): SessionManager {
  return sessions;
}

/**
 * Initiate a native Twilio conference (called by transferToHuman tool)
 */
export async function initiateConference(
  callerStreamSid: string, 
  callSid: string,
  reason: string
): Promise<string> {
  if (!process.env.OWNER_PHONE_NUMBER) {
    throw new Error("OWNER_PHONE_NUMBER not configured");
  }

  console.log(`[Twilio] 🎙️  Initiating native conference for ${callerStreamSid} - Reason: ${reason}`);
  
  // Create ConferenceManager instance
  const conferenceManager = new ConferenceManager(
    process.env.OWNER_PHONE_NUMBER
  );
  
  // Use the native Twilio conference method
  await conferenceManager.createConferenceAndAddOwner(callSid, callerStreamSid);
  
  console.log(`[Twilio] ✅ Native Twilio conference created`);
  console.log(`[Twilio] 📞 Owner has been called to join`);
  
  return callerStreamSid;
}

