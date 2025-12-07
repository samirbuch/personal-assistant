/**
 * Twilio WebSocket Handlers
 * 
 * Handle Twilio WebSocket messages and route to voice agents
 */

import type { TwilioWebsocket } from "../../lib/TwilioWebsocketTypes";
import { SessionManager } from "../managers/SessionManager";
import { VoiceAgent } from "../core/VoiceAgent";
import { createSTT, createTTS, setupSTTHandlers, setupTTSHandlers } from "../managers/DeepgramManager";
import { createLLMAgent, type UserContext } from "../managers/LLMManager";
import { ConferenceManager } from "../managers/ConferenceManager";
import never from "../utils/never";
import supabaseAdmin from "../lib/supabaseAdmin";

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

  // Extract appointment ID and fetch full data if present
  let userContext: UserContext | undefined = undefined;
  const appointmentIdStr = customParameters?.appointmentId as string | undefined;
  if (appointmentIdStr) {
    try {
      const appointmentId = parseInt(appointmentIdStr, 10);
      console.log(`[Twilio] 📅 Fetching appointment ${appointmentId}...`);

      const { data: appointment, error } = await supabaseAdmin
        .from("Appointments")
        .select("*, user_id(*)")
        .eq("id", appointmentId)
        .single();

      if (error) {
        console.error(`[Twilio] Failed to fetch appointment:`, error);
      } else if (appointment) {
        console.log(`[Twilio] 📅 Appointment data loaded:`, appointment);
        userContext = {
          first_name: appointment.user_id.first_name,
          last_name: appointment.user_id.last_name,
          phone: appointment.user_id.phone_number,
          email: appointment.user_id.email ?? never("Missing email in appointment user information")
        };
      }
    } catch (error) {
      console.error(`[Twilio] Failed to fetch appointment data:`, error);
    }
  }

  console.log(`\n[Twilio] ═══ CALL START ═══`);
  console.log(`  Stream: ${streamSid}`);
  console.log(`  Call: ${callSid}`);
  if (callerFrom) console.log(`  📱 From: ${callerFrom}`);
  if (callerTo) console.log(`  📱 To: ${callerTo}`);

  // Create Deepgram connections
  const stt = createSTT();
  const tts = createTTS();

  const voiceAgent = new VoiceAgent({
    ws,
    streamSid,
    callSid,
    stt,
    tts,
    callerPhone: callerFrom,
    appointmentId: appointmentIdStr ? parseInt(appointmentIdStr, 10) : undefined
  });

  // Create LLM agent with tools that reference voiceAgent and user context
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

export async function handleStop(
  message: TwilioWebsocket.StopMessage
): Promise<void> {
  console.log(`\n[Twilio] ═══ CALL END ═══ ${message.streamSid}`);
  await sessions.delete(message.streamSid);
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

