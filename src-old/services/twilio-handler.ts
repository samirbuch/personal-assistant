import type { TwilioWebsocket } from "../../lib/TwilioWebsocketTypes";
import type { CallSession } from "../types/CallSession";
import type { ModelMessage } from "ai";
import { calculateAudioEnergy, updateNoiseBaseline, hasAnyAudioActivity } from "../util/audio-tools";
import { CallSessionEvents } from "../events/CallSessionEvents";
import { streamLLMResponse } from "./llm-handler";
import { createSTTConnection, setupSTTHandlers } from "./deepgram-stt";
import { createTTSConnection, setupTTSHandlers } from "./deepgram-tts";
import { createAgent } from "./llm-handler";
import ResettableAbortController from "../util/ResettableAbortController";

export function handleInterrupt(
  streamSid: string,
  utteranceUntilInterrupt: string,
  callSessions: Map<string, CallSession>
) {
  const session = callSessions.get(streamSid);
  if (!session) {
    console.error(`No session found for streamSid: ${streamSid}`);
    return;
  }

  const conversation = session.conversation;
  let updatedConversation = [...conversation];
  const interruptedIndex = updatedConversation.findLastIndex(
    (message) =>
      message.role === "assistant" &&
      message.content &&
      typeof message.content === "string" &&
      message.content.includes(utteranceUntilInterrupt)
  );

  if (interruptedIndex !== -1) {
    const interruptedMessage = updatedConversation[interruptedIndex];
    if (!interruptedMessage) return;

    const content = typeof interruptedMessage.content === "string"
      ? interruptedMessage.content
      : "";

    const interruptPosition = content.indexOf(utteranceUntilInterrupt);
    const truncatedContent = content.substring(
      0,
      interruptPosition + utteranceUntilInterrupt.length
    );

    updatedConversation[interruptedIndex] = {
      ...interruptedMessage,
      content: truncatedContent,
    } as ModelMessage;

    updatedConversation = updatedConversation.filter(
      (message, index) =>
        !(index > interruptedIndex && message.role === "assistant")
    );
  }

  session.conversation = updatedConversation;
  callSessions.set(streamSid, session);
}

export async function handleStart(
  json: TwilioWebsocket.StartMessage,
  ws: any,
  callSessions: Map<string, CallSession>
) {
  console.log("START EVENT:", json);

  const deepgramSTT = createSTTConnection();
  const deepgramTTS = createTTSConnection();
  const abortController = new ResettableAbortController();
  const agent = createAgent(abortController);
  const events = new CallSessionEvents(); // Create event emitter for this session

  const session: CallSession = {
    ws,
    deepgramSTT,
    deepgramTTS,
    conversation: [],
    agent,
    abortController,
    events,
    isStreaming: false,
    currentAssistantMessage: "",
    noiseBaseline: 10,
    noiseSamples: [],
    audioGateOpen: false, // Controlled by events
    lastInterruptTime: 0
  };

  callSessions.set(json.streamSid, session);

  // Set up TTS handlers FIRST (includes event listeners for gate control)
  setupTTSHandlers(deepgramTTS, session, json.streamSid);
  
  // Then set up interrupt handlers
  setupInterruptHandlers(session, json.streamSid, callSessions);

  setupSTTHandlers(deepgramSTT, session, json.streamSid, async (transcript) => {
    // Only process if not already streaming
    if (!session.isStreaming) {
      session.conversation.push({
        role: "user",
        content: transcript
      });

      console.log(`[${json.streamSid}] Conversation:`, session.conversation);
      await streamLLMResponse(session, json.streamSid);
    } else {
      console.log(`[${json.streamSid}] Ignoring transcript - already streaming`);
    }
  });
}

function setupInterruptHandlers(
  session: CallSession,
  streamSid: string,
  callSessions: Map<string, CallSession>
) {
  // When interrupt event is emitted, handle it
  session.events.onInterrupt((reason) => {
    console.log(`[${streamSid}] ⚡ INTERRUPT EVENT: ${reason}`);
    
    // Close audio gate immediately
    session.events.emitAudioGateClose();
    
    // Stop streaming
    session.isStreaming = false;
    
    // Abort LLM
    session.abortController.abort(reason);
    
    // Send multiple clear commands
    const clearMsg: TwilioWebsocket.Sendable.ClearMessage = {
      event: "clear",
      streamSid: streamSid
    };
    session.ws.send(JSON.stringify(clearMsg));
    session.ws.send(JSON.stringify(clearMsg));
    session.ws.send(JSON.stringify(clearMsg));
    
    // Send mark for tracking
    const markMsg: TwilioWebsocket.Sendable.MarkMessage = {
      event: "mark",
      streamSid: streamSid,
      mark: { name: `interrupt-${Date.now()}` }
    };
    session.ws.send(JSON.stringify(markMsg));
    
    // Update conversation with partial response
    if (session.currentAssistantMessage) {
      handleInterrupt(streamSid, session.currentAssistantMessage, callSessions);
    }

    // Reset for next response
    session.abortController.reset();
    session.currentAssistantMessage = "";
    
    console.log(`[${streamSid}] Interrupt handled, ready for next input`);
  });
  
  console.log(`[${streamSid}] Interrupt handlers registered`);
}

export async function handleMedia(
  json: TwilioWebsocket.MediaMessage,
  callSessions: Map<string, CallSession>
) {
  const session = callSessions.get(json.streamSid);
  if (!session) {
    console.error(`No session found for streamSid: ${json.streamSid}`);
    return;
  }

  const energy = calculateAudioEnergy(json.media.payload);

  // Update noise baseline when NOT streaming
  if (!session.isStreaming) {
    updateNoiseBaseline(session, energy);
  }

  // ULTRA-AGGRESSIVE interruption: ANY audio activity during streaming = interrupt
  if (session.isStreaming && hasAnyAudioActivity(json.media.payload)) {
    const now = Date.now();
    
    // Prevent multiple rapid interrupts (debounce 50ms)
    if (now - session.lastInterruptTime < 50) {
      return;
    }
    
    session.lastInterruptTime = now;
    
    // Emit interrupt event - handlers will take care of the rest!
    session.events.emitInterrupt("User speech detected");
    session.events.emitUserSpeechDetected();
  }

  // Send audio to Deepgram STT
  const base64ToUint8Array = Uint8Array.fromBase64(json.media.payload);
  session.deepgramSTT.send(base64ToUint8Array.buffer);
}

export function handleStop(
  json: TwilioWebsocket.StopMessage,
  callSessions: Map<string, CallSession>
) {
  console.log(`[${json.streamSid}] User hung up!`);
  const session = callSessions.get(json.streamSid);

  if (session) {
    session.events.emitCleanup();
    session.deepgramSTT.requestClose();
    session.deepgramTTS.requestClose();
    session.abortController.abort();
    session.events.removeAllListeners(); // Clean up event listeners
    callSessions.delete(json.streamSid);
  }
}
