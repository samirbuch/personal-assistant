/**
 * Deepgram Integration
 * 
 * Creates and configures Deepgram STT/TTS connections
 */

import { createClient, LiveTranscriptionEvents, LiveTTSEvents, type LiveClient, type SpeakLiveClient } from "@deepgram/sdk";
import type { VoiceAgent } from "../core/VoiceAgent";

const deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

export function createSTT(): LiveClient {
  return deepgramClient.listen.live({
    model: "nova-3",
    encoding: "mulaw",
    sample_rate: 8000,
    interim_results: false, // Only final transcripts
    endpointing: 300, // End utterance after 300ms of silence
    smart_format: false
  });
}

export function createTTS(): SpeakLiveClient {
  return deepgramClient.speak.live({
    model: "aura-2-thalia-en",
    encoding: "mulaw",
    sample_rate: 8000
  });
}

export function setupSTTHandlers(stt: LiveClient, agent: VoiceAgent, streamSid: string): void {
  stt.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[STT ${streamSid}] Connected`);
  });

  stt.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    
    // Only process final, speech-complete transcripts
    if (data.is_final && data.speech_final && transcript && transcript.trim()) {
      agent.handleTranscript(transcript.trim());
    }
  });

  stt.on(LiveTranscriptionEvents.Error, (error) => {
    console.error(`[STT ${streamSid}] Error:`, error);
  });

  stt.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[STT ${streamSid}] Closed`);
  });
}

export function setupTTSHandlers(tts: SpeakLiveClient, agent: VoiceAgent, streamSid: string): void {
  tts.on(LiveTTSEvents.Open, () => {
    console.log(`[TTS ${streamSid}] Connected`);
  });

  tts.on(LiveTTSEvents.Audio, (audio: Uint8Array) => {
    // Pass audio to agent - it will decide whether to send
    const b64 = audio.toBase64();
    agent.handleTTSAudio(b64);
  });

  tts.on(LiveTTSEvents.Flushed, () => {
    // TTS has finished sending all audio
    console.log(`[TTS ${streamSid}] Flushed - all audio sent`);
    agent.handleTTSFlushed();
  });

  tts.on(LiveTTSEvents.Error, (error) => {
    console.error(`[TTS ${streamSid}] Error:`, error);
  });

  tts.on(LiveTTSEvents.Close, () => {
    console.log(`[TTS ${streamSid}] Closed`);
  });
}
