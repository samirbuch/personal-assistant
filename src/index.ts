import Twilio from "twilio";
import * as Bun from "bun";
import { createClient, LiveTranscriptionEvents } from "@deepgram/sdk";
import cleanPublicURL from "./util/cleanPublicURL";
import { TwilioWebsocket } from "../lib/TwilioWebsocketTypes";
import { mulaw } from "alawmulaw";

const PORT = process.env.PORT || 40451

console.log("Hello via Bun!");

const client = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

const deepgramConnection = deepgramClient.listen.live({
  model: "nova-3",
  encoding: "mulaw",
  sample_rate: 8000,
  interim_results: true
})

deepgramConnection.on(LiveTranscriptionEvents.Open, () => {
  console.log("Deepgram connection ready");

  deepgramConnection.on(LiveTranscriptionEvents.Transcript, (data) => {
    console.log("NEW TRANSCRIPT DATA:", 
      data.is_final,
      data.speech_final,
      data.channel
    );
  });
})

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
      // console.log("New message:", message);
      const json: TwilioWebsocket.Message = JSON.parse(message as string);

      switch (json.event) {
        case "media": {
          // Echo back to the user
          const send: TwilioWebsocket.Sendable.MediaMessage = {
            streamSid: json.streamSid,
            event: "media",
            media: { payload: json.media.payload }
          }
          ws.send(JSON.stringify(send));

          const base64ToUint8Array = Uint8Array.fromBase64(json.media.payload);
          deepgramConnection.send(base64ToUint8Array.buffer);

          break;
        }

        case "stop": {
          console.log("User hung up!");
          break;
        }
      }
    }
  }
})