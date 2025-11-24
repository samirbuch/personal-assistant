/**
 * Twilio WebSocket Handlers
 * 
 * Handle Twilio WebSocket messages and route to voice agents
 * Supports both solo calls and dual-call conferences
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


  //userid get
  const userID = customParameters?.userID as string | undefined;
  
  // Extract caller information and conference metadata from custom parameters
  const callerFrom = customParameters?.from as string | undefined;
  const callerTo = customParameters?.to as string | undefined;
  const conferenceId = customParameters?.conferenceId as string | undefined;
  const role = customParameters?.role as string | undefined;
  
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
  // Enable diarization (important for conference calls)
  const stt = createSTT(true);
  const tts = createTTS();

  // Check if this is an owner joining a conference
  if (conferenceId && role === "owner") {
    console.log(`[Twilio] 🎙️  Owner joining conference ${conferenceId}`);
    
    const conference = sessions.getConference(conferenceId);
    if (!conference) {
      console.error(`[Twilio] ❌ Conference ${conferenceId} not found!`);
      return;
    }

    // Create owner voice agent
    const ownerAgent = new VoiceAgent({
      ws,
      streamSid,
      callSid,
      stt,
      tts,
      role: "owner"
    });

    // Set up handlers
    setupSTTHandlers(stt, ownerAgent, streamSid, true);
    setupTTSHandlers(tts, ownerAgent, streamSid);

    // Add to conference
    sessions.addToConference(streamSid, ownerAgent, conference, "owner");
    
    // Initialize the owner agent
    await ownerAgent.initialize();
    await conference.setOwnerAgent(ownerAgent);

    console.log(`[Twilio] ✅ Owner agent ready and added to conference`);
    return;
  }

  // Regular solo call (not part of a conference yet)
  console.log(`[Twilio] Regular solo call`);
  
  const voiceAgent = new VoiceAgent({
    ws,
    streamSid,
    callSid,
    stt,
    tts,
    callerPhone: callerFrom,
    role: "caller" // Default role for initial caller
  });

  // Create LLM agent with tools that reference voiceAgent
  const agent = await createLLMAgent(voiceAgent, userContext);
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
 * Initiate a conference (called by transferToHuman tool)
 */
export async function initiateConference(callerStreamSid: string, reason: string): Promise<string> {
  const agent = sessions.getAgent(callerStreamSid);
  
  if (!agent) {
    throw new Error(`No agent found for ${callerStreamSid}`);
  }

  if (!process.env.OWNER_PHONE_NUMBER) {
    throw new Error("OWNER_PHONE_NUMBER not configured");
  }

  console.log(`[Twilio] 🎙️  Initiating conference for ${callerStreamSid} - Reason: ${reason}`);
  
  // Generate unique conference ID
  const conferenceId = `conf-${Date.now()}-${callerStreamSid.slice(-8)}`;
  
  // Create the conference session
  const conference = sessions.createConference(conferenceId);
  
  // Move the caller agent to the conference
  sessions.addToConference(callerStreamSid, agent, conference, "caller");
  
  console.log(`[Twilio] ✅ Conference ${conferenceId} created, caller added`);
  console.log(`[Twilio] 📞 Now calling owner to join...`);
  
  return conferenceId;
}

