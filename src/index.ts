/**
 * Personal Assistant Voice Agent Server
 * 
 * Clean, simple architecture with proper state management
 */

import Twilio from "twilio";
import * as Bun from "bun";
import { TwilioWebsocket } from "../lib/TwilioWebsocketTypes";
import { handleStart, handleMedia, handleStop } from "./handlers/TwilioHandler";

const PORT = process.env.PORT || 40451;

console.log(`
╔═══════════════════════════════════════╗
║   Personal Assistant Voice Agent      ║
║   Port: ${PORT}                     ║
╚═══════════════════════════════════════╝
`);

const twilioClient = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Utility to clean public URL
function cleanPublicURL(url: string | undefined): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

Bun.serve({
  port: PORT,
  
  routes: {
    // API: Initiate outbound call
    "/api/calls/:number": async (req) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const from = process.env.TWILIO_PHONE_NUMBER;
      if (!from) {
        return new Response("Missing TWILIO_PHONE_NUMBER", { status: 500 });
      }

      const publicURL = cleanPublicURL(process.env.PUBLIC_URL);
      if (!publicURL) {
        return new Response("Missing or invalid PUBLIC_URL", { status: 500 });
      }

      const isNgrok = publicURL.includes(".ngrok-free.app");
      const callbackURL = `http://${publicURL}${isNgrok ? "" : `:${PORT}`}/api/twilio-gateway`;

      try {
        const call = await twilioClient.calls.create({
          from,
          to: req.params.number,
          url: callbackURL
        });

        console.log(`[API] Initiated call to ${req.params.number}: ${call.sid}`);
        return new Response(JSON.stringify(call.toJSON()), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("[API] Error creating call:", error);
        return new Response("Error creating call", { status: 500 });
      }
    },

    // Twilio Gateway: Return TwiML to connect stream
    "/api/twilio-gateway": async (req) => {
      const publicURL = cleanPublicURL(process.env.PUBLIC_URL);
      if (!publicURL) {
        return new Response("Missing or invalid PUBLIC_URL", { status: 500 });
      }

      const isNgrok = publicURL.includes(".ngrok-free.app");
      const wsURL = `wss://${publicURL}${isNgrok ? "" : `:${PORT}`}/twilio-ws`;

      const response = new Twilio.twiml.VoiceResponse();
      const connect = response.connect();
      connect.stream({
        name: "Voice Agent Stream",
        url: wsURL
      });

      console.log(`[Twilio] Forwarding call to WebSocket: ${wsURL}`);

      return new Response(response.toString(), {
        headers: { "Content-Type": "text/xml" }
      });
    }
  },

  // Regular HTTP requests
  fetch(req, server) {
    const url = new URL(req.url);
    
    // WebSocket upgrade
    if (url.pathname === "/twilio-ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 400 });
      }
      return; // WebSocket takes over
    }

    // Health check
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", port: PORT }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not found", { status: 404 });
  },

  // WebSocket handlers
  websocket: {
    open(ws) {
      console.log("[WebSocket] Connection established");
    },

    async message(ws, message) {
      try {
        const msg: TwilioWebsocket.Message = JSON.parse(message as string);

        switch (msg.event) {
          case "start":
            await handleStart(msg, ws);
            break;
          
          case "media":
            await handleMedia(msg);
            break;
          
          case "stop":
            handleStop(msg);
            break;
          
          case "connected":
            console.log("[WebSocket] Twilio connected");
            break;
          
          default:
            console.log(`[WebSocket] Unknown event: ${msg.event}`);
        }
      } catch (error) {
        console.error("[WebSocket] Error handling message:", error);
      }
    },

    close(ws) {
      console.log("[WebSocket] Connection closed");
    }
  }
});

console.log(`✅ Server running on port ${PORT}`);
console.log(`📞 Ready to handle voice calls\n`);
