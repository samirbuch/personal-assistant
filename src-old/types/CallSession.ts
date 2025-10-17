import type { Experimental_Agent as Agent, ModelMessage } from "ai";
import type { LiveClient, SpeakLiveClient } from "@deepgram/sdk";
import type Bun from "bun";
import type ResettableAbortController from "../util/ResettableAbortController";
import type { CallSessionEvents } from "../events/CallSessionEvents";

export interface CallSession {
  ws: Bun.ServerWebSocket;
  deepgramSTT: LiveClient;
  deepgramTTS: SpeakLiveClient;
  conversation: ModelMessage[];
  agent: Agent<{}, never, never>;
  abortController: ResettableAbortController;
  events: CallSessionEvents; // Event emitter for this session
  isStreaming: boolean;
  currentAssistantMessage: string;
  noiseBaseline: number;
  noiseSamples: number[];
  audioGateOpen: boolean;
  lastInterruptTime: number; // For debouncing
}
