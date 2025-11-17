import { createClient, LiveTTSEvents, type SpeakLiveClient, type SpeakSchema } from "@deepgram/sdk";
import type { CallSession } from "../types/CallSession";
import type { TwilioWebsocket } from "../../lib/TwilioWebsocketTypes";

const deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

export function createTTSConnection(options: {
  model?: string;
  encoding?: SpeakSchema["encoding"]
  sampleRate?: number;
} = {}): SpeakLiveClient {
  return deepgramClient.speak.live({
    model: options.model || "aura-2-thalia-en",
    encoding: options.encoding || "mulaw",
    sample_rate: options.sampleRate || 8000
  });
}

export function setupTTSHandlers(
  tts: SpeakLiveClient,
  session: CallSession,
  streamSid: string
) {
  tts.on(LiveTTSEvents.Open, () => {
    console.log(`[${streamSid}] Deepgram TTS ready`);
  });

  tts.on(LiveTTSEvents.Audio, (audio: Uint8Array) => {
    // GATE: Only send audio if gate is open (controlled by events)
    if (session.audioGateOpen) {
      const b64 = audio.toBase64();
      const msg: TwilioWebsocket.Sendable.MediaMessage = {
        event: "media",
        streamSid: streamSid,
        media: { payload: b64 }
      };
      session.ws.send(JSON.stringify(msg));
    }
    // If gate is closed, audio is silently dropped
  });

  tts.on(LiveTTSEvents.Error, (error) => {
    console.error(`[${streamSid}] TTS Error:`, error);
  });

  tts.on(LiveTTSEvents.Close, () => {
    console.log(`[${streamSid}] TTS connection closed`);
  });

  // Listen to session events to control audio gate
  session.events.onAudioGateOpen(() => {
    console.log(`[${streamSid}] 🟢 Audio gate OPEN`);
    session.audioGateOpen = true;
  });

  session.events.onAudioGateClose(() => {
    console.log(`[${streamSid}] 🔴 Audio gate CLOSED`);
    session.audioGateOpen = false;
  });
  
  console.log(`[${streamSid}] TTS event handlers registered`);
}

// No longer need recreateTTSConnection - just keep the connection alive!
export function flushTTS(session: CallSession) {
  if (session.deepgramTTS) {
    session.deepgramTTS.flush();
  }
}
