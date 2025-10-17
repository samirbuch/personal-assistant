/**
 * Deepgram Integration
 * 
 * Creates and configures Deepgram STT/TTS connections
 */

import { createClient, LiveTranscriptionEvents, LiveTTSEvents, type LiveClient, type SpeakLiveClient } from "@deepgram/sdk";
import type { VoiceAgent } from "../core/VoiceAgent";

const deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

// Track accumulated transcripts per stream
const transcriptAccumulators = new Map<string, string[]>();

export function createSTT(): LiveClient {
  return deepgramClient.listen.live({
    model: "nova-3",
    encoding: "mulaw",
    sample_rate: 8000,
    interim_results: false, // Only final transcripts
    endpointing: 500, // Wait longer before ending utterance for more natural pauses
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
  // Initialize accumulator for this stream
  transcriptAccumulators.set(streamSid, []);
  
  stt.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[STT ${streamSid}] Connected`);
  });

  stt.on(LiveTranscriptionEvents.Transcript, (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;
    
    // Log all transcript events to debug what's happening
    if (transcript && transcript.trim()) {
      console.log(`[STT ${streamSid}] Transcript: is_final=${data.is_final}, speech_final=${data.speech_final}, text="${transcript}"`);
    }
    
    // Accumulate final transcripts until speech is complete
    if (data.is_final && transcript && transcript.trim()) {
      const accumulator = transcriptAccumulators.get(streamSid) || [];
      accumulator.push(transcript.trim());
      transcriptAccumulators.set(streamSid, accumulator);
      
      // When speech is final, send all accumulated text
      if (data.speech_final) {
        const fullTranscript = accumulator.join(' ');
        console.log(`[STT ${streamSid}] ✅ Processing complete utterance: "${fullTranscript}"`);
        
        // Clear accumulator for next utterance
        transcriptAccumulators.set(streamSid, []);
        
        // Send to agent
        agent.handleTranscript(fullTranscript);
      }
    }
  });

  stt.on(LiveTranscriptionEvents.Error, (error) => {
    console.error(`[STT ${streamSid}] Error:`, error);
  });

  stt.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[STT ${streamSid}] Closed`);
    // Clean up accumulator
    transcriptAccumulators.delete(streamSid);
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
