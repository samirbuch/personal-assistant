import Twilio from "twilio";
import * as Bun from "bun";
import { createClient, LiveTranscriptionEvents, LiveTTSEvents, LiveClient, SpeakLiveClient } from "@deepgram/sdk";
import cleanPublicURL from "./util/cleanPublicURL";
import { TwilioWebsocket, Base64Schema } from "../lib/TwilioWebsocketTypes";

const PORT = process.env.PORT || 40451

console.log("Hello via Bun!");

interface LLMPromptMessage {
  role: "user" | "assistant" | "tool",
  content: string
}

interface CallSession {
  ws: Bun.ServerWebSocket;
  deepgramSTT: LiveClient;
  deepgramTTS: SpeakLiveClient;
  conversation: LLMPromptMessage[];
}

const callSessions = new Map<string, CallSession>();

const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

Bun.serve({
  port: PORT,
  routes: {
    "/api/calls/:number": async req => {
      if (req.method !== "POST") {
        return new Response("Error 405: Method not allowed", { status: 405 });
      }

      const from = process.env.TWILIO_PHONE_NUMBER;
      if (!from) return new Response("Error 500: Missing TWILIO_PHONE_NUMBER", { status: 500 });

      const publicURL = cleanPublicURL(process.env.PUBLIC_URL);
      if (!publicURL) return new Response("Error 500: Missing or malformed PUBLIC_URL", { status: 500 });

      const isNgrok = publicURL.includes(".ngrok-free.app");
      const url = `http://${publicURL}${isNgrok ? "" : `:${PORT}`}/api/twilio-gateway`;

      console.log(`Calling ${from}`);
      const call = await client.calls.create({
        from,
        to: req.params.number,
        url: url
      });

      console.log("Call!", call);

      return new Response(JSON.stringify(call.toJSON()));
    },
    "/api/twilio-gateway": async req => {
      const publicURL = cleanPublicURL(process.env.PUBLIC_URL);
      if (!publicURL) return new Response("Error 500: Missing or malformed PUBLIC_URL", { status: 500 });

      const isNgrok = publicURL.includes(".ngrok-free.app");
      const ws = `wss://${publicURL}${isNgrok ? "" : `:${PORT}`}/twilio-ws`;

      const response = new Twilio.twiml.VoiceResponse();
      const connect = response.connect();
      connect.stream({
        name: "Inbound Audio Stream",
        url: ws
      });
      console.log("Forwarding twilio call stream to:", ws);

      return new Response(
        response.toString(),
        {
          headers: {
            "Content-Type": "text/xml"
          }
        }
      );
    }
  },

  fetch(req, server) {
    const url = new URL(req.url);
    console.log(url);
    if (url.pathname === "/twilio-ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("Upgrade failed", { status: 400 });
      }
    }
    // return new Response("Hello World");
  },
  websocket: {
    open(ws) {
      console.log("Websocket connection opened!");
    },
    message(ws, message) {
      const json: TwilioWebsocket.Message = JSON.parse(message as string);

      switch (json.event) {
        case "start": {
          console.log("START EVENT:", json);

          // Create dedicated Deepgram connections for this call
          const deepgramSTT = deepgramClient.listen.live({
            model: "nova-3",
            encoding: "mulaw",
            sample_rate: 8000,
            interim_results: true
          });

          const deepgramTTS = deepgramClient.speak.live({
            model: "aura-2-thalia-en",
            encoding: "mulaw",
            sample_rate: 8000
          });

          // Create session for this call
          const session: CallSession = {
            ws,
            deepgramSTT,
            deepgramTTS,
            conversation: []
          };

          callSessions.set(json.streamSid, session);

          // Set up STT event handlers for this specific call
          deepgramSTT.on(LiveTranscriptionEvents.Open, () => {
            console.log(`[${json.streamSid}] Deepgram STT ready`);
          });

          deepgramSTT.on(LiveTranscriptionEvents.Transcript, (data) => {
            console.log(`[${json.streamSid}] Transcript:`,
              data.is_final,
              data.speech_final,
              data.channel?.alternatives?.[0]?.transcript
            );

            // Now we can safely associate this transcript with the correct call
            if (data.is_final && data.speech_final) {
              const transcript = data.channel?.alternatives?.[0]?.transcript;
              if (transcript) {
                session.conversation.push({
                  role: "user",
                  content: transcript
                });
                // TODO: Send to LLM and handle response
                console.log(`[${json.streamSid}] Conversation:`, session.conversation);
              }
            }
          });

          deepgramSTT.on(LiveTranscriptionEvents.Error, (error) => {
            console.error(`[${json.streamSid}] STT Error:`, error);
          });

          deepgramSTT.on(LiveTranscriptionEvents.Close, () => {
            console.log(`[${json.streamSid}] STT connection closed`);
          });

          // Set up TTS event handlers for this specific call
          deepgramTTS.on(LiveTTSEvents.Open, () => {
            console.log(`[${json.streamSid}] Deepgram TTS ready`);
          });

          deepgramTTS.on(LiveTTSEvents.Audio, (audio) => {
            console.log(`[${json.streamSid}] Received TTS audio:`, audio.byteLength, "bytes");
          });

          deepgramTTS.on(LiveTTSEvents.Error, (error) => {
            console.error(`[${json.streamSid}] TTS Error:`, error);
          });

          deepgramTTS.on(LiveTTSEvents.Close, () => {
            console.log(`[${json.streamSid}] TTS connection closed`);
          });

          break;
        }
        case "media": {
          const session = callSessions.get(json.streamSid);
          if (!session) {
            console.error(`No session found for streamSid: ${json.streamSid}`);
            break;
          }

          // Send audio to Deepgram STT for this specific call
          const base64ToUint8Array = Uint8Array.fromBase64(json.media.payload);
          session.deepgramSTT.send(base64ToUint8Array.buffer);

          // Echo back to user
          const msg: TwilioWebsocket.Sendable.MediaMessage = {
            event: "media",
            streamSid: json.streamSid,
            media: { payload: json.media.payload }
          }
          ws.send(JSON.stringify(msg));

          break;
        }

        case "stop": {
          console.log(`[${json.streamSid}] User hung up!`);
          const session = callSessions.get(json.streamSid);

          if (session) {
            // Clean up Deepgram connections
            session.deepgramSTT.requestClose();
            session.deepgramTTS.requestClose();
            callSessions.delete(json.streamSid);
          }

          break;
        }
      }
    }
  }
})