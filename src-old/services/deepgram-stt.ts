import { createClient, LiveTranscriptionEvents, type LiveClient } from "@deepgram/sdk";
import type { CallSession } from "../types/CallSession";

const deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

export function createSTTConnection(options: {
  model?: string;
  encoding?: string;
  sampleRate?: number;
  interimResults?: boolean;
} = {}): LiveClient {
  return deepgramClient.listen.live({
    model: options.model || "nova-3",
    encoding: options.encoding || "mulaw",
    sample_rate: options.sampleRate || 8000,
    interim_results: options.interimResults ?? true
  });
}

export function setupSTTHandlers(
  stt: LiveClient,
  session: CallSession,
  streamSid: string,
  onTranscript: (transcript: string) => void
) {
  stt.on(LiveTranscriptionEvents.Open, () => {
    console.log(`[${streamSid}] Deepgram STT ready`);
  });

  stt.on(LiveTranscriptionEvents.Transcript, async (data) => {
    const transcript = data.channel?.alternatives?.[0]?.transcript;

    // Handle final transcripts
    if (data.is_final && data.speech_final && transcript) {
      console.log(`[${streamSid}] Transcript: ${transcript}`);
      onTranscript(transcript);
    }
  });

  stt.on(LiveTranscriptionEvents.Error, (error) => {
    console.error(`[${streamSid}] STT Error:`, error);
  });

  stt.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[${streamSid}] STT connection closed`);
    session.abortController.abort();
  });
}
