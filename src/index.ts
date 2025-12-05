/**
 * Personal Assistant Voice Agent Server
 * 
 * Clean, simple architecture with proper state management
 */

import Twilio from "twilio";
import * as Bun from "bun";
import { TwilioWebsocket } from "../lib/TwilioWebsocketTypes";
import { handleStart, handleMedia, handleStop, initiateConference } from "./handlers/TwilioHandler";
import DatabaseAppointmentListener, { APPOINTMENT_EVENTS } from "./managers/DatabaseAppointmentListener";
import type { Tables } from "../lib/supabase.types";

const PORT = process.env.PORT || 40451;

console.log(`
Personal Assistant Voice Agent
Port: ${PORT}
`);

const twilioClient = Twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// Initialize database appointment listener
const appointmentListener = new DatabaseAppointmentListener();

// Listen for new appointments and automatically call the business
appointmentListener.on(APPOINTMENT_EVENTS.CREATED, async (appointment: Tables<"Appointments">) => {
  console.log(`[AppointmentDispatcher] New appointment created:`, appointment);
  
  // Call the business using the existing API endpoint
  const publicURL = cleanPublicURL(process.env.PUBLIC_URL);
  if (!publicURL) {
    console.error(`[AppointmentDispatcher] PUBLIC_URL not configured, cannot initiate call`);
    return;
  }
  
  const isNgrok = publicURL.includes(".ngrok-free.app");
  const url = `http://${publicURL}${isNgrok ? "" : `:${PORT}`}/api/calls/${encodeURIComponent(appointment.phone_number)}`;
  
  try {
    console.log(`[AppointmentDispatcher] 📞 Calling business at ${appointment.phone_number}...`);
    const response = await fetch(url, { method: "POST" });
    
    if (response.ok) {
      const callInfo = await response.json();
      console.log(`[AppointmentDispatcher] Call initiated successfully:`, callInfo);
    } else {
      console.error(`[AppointmentDispatcher] Failed to initiate call: ${response.statusText}`);
    }
  } catch (error) {
    console.error(`[AppointmentDispatcher] Error calling business:`, error);
  }
});

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

    // API: Hang up active call
    "/api/hangup/:streamSid": async (req) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const streamSid = req.params.streamSid;
      if (!streamSid) {
        return new Response("Missing streamSid", { status: 400 });
      }

      // For now, just return success - the WebSocket closing will handle cleanup
      console.log(`[API] Hangup requested for stream ${streamSid}`);

      return new Response(JSON.stringify({
        success: true,
        streamSid,
        message: "Hangup initiated"
      }), {
        headers: { "Content-Type": "application/json" }
      });
    },

    // API: Initiate conference (dual-call mode)
    "/api/initiate-conference/:streamSid": async (req) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      const streamSid = req.params.streamSid;
      if (!streamSid) {
        return new Response("Missing streamSid", { status: 400 });
      }

      if (!process.env.OWNER_PHONE_NUMBER) {
        return new Response("OWNER_PHONE_NUMBER not configured", { status: 500 });
      }

      try {
        const body = await req.json() as { reason?: string; callSid?: string };
        const reason = body.reason || "User requested human assistance";
        const callSid = body.callSid;

        if (!callSid) {
          return new Response("Missing callSid", { status: 400 });
        }

        // Use native Twilio conference (AI will disconnect)
        const conferenceName = await initiateConference(streamSid, callSid, reason);

        console.log(`[API] Native conference created for ${streamSid}`);

        return new Response(JSON.stringify({
          success: true,
          conferenceName,
          streamSid,
          message: "Native Twilio conference initiated"
        }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error: unknown) {
        console.error(`[API] Error initiating conference for ${streamSid}:`, error);
        if (error instanceof Error) {
          return new Response(JSON.stringify({
            success: false,
            error: error.message || "Error initiating conference"
          }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
          });
        } else {
          console.error("Unknown error type");
        }
      }
    },

    // API: Conference status callback (for tracking when participants join/leave)
    "/api/conference-status": async (req) => {
      if (req.method !== "POST") {
        return new Response("Method not allowed", { status: 405 });
      }

      try {
        const formData = await req.formData();
        const event = formData.get('StatusCallbackEvent');
        const conferenceSid = formData.get('ConferenceSid');
        const participantLabel = formData.get('ParticipantLabel');

        console.log(`[Conference] Event: ${event}, Conference: ${conferenceSid}, Participant: ${participantLabel}`);

        return new Response("OK");
      } catch (error) {
        console.error(`[API] Error handling conference status:`, error);
        return new Response("Error", { status: 500 });
      }
    },

    // Twilio Gateway: Return TwiML to connect stream
    "/api/twilio-gateway": async (req) => {
      const publicURL = cleanPublicURL(process.env.PUBLIC_URL);
      if (!publicURL) {
        return new Response("Missing or invalid PUBLIC_URL", { status: 500 });
      }

      // Parse Twilio's URL query parameters to get call info
      const url = new URL(req.url);
      const from = url.searchParams.get('From') || '';
      const to = url.searchParams.get('To') || '';
      const callSid = url.searchParams.get('CallSid') || '';
      const fromCity = url.searchParams.get('FromCity') || '';
      const fromState = url.searchParams.get('FromState') || '';

      console.log(`[Twilio] 📞 Incoming call:`);
      console.log(`  From: ${from} (${fromCity}, ${fromState})`);
      console.log(`  To: ${to}`);
      console.log(`  CallSid: ${callSid}`);

      const isNgrok = publicURL.includes(".ngrok-free.app");
      const wsURL = `wss://${publicURL}${isNgrok ? "" : `:${PORT}`}/twilio-ws`;

      console.log(`[Twilio] Forwarding call to WebSocket: ${wsURL}`);

      // Create TwiML response with media stream
      // NOTE: When conference mode is activated, this call will be moved to a conference
      // The stream will reconnect with a new "start" message - this is expected behavior
      const response = new Twilio.twiml.VoiceResponse();
      const connect = response.connect();
      const stream = connect.stream({
        name: "Voice Agent Stream",
        url: wsURL
      });

      // Add custom parameters to pass caller info to WebSocket
      stream.parameter({ name: 'from', value: from });
      stream.parameter({ name: 'to', value: to });
      stream.parameter({ name: 'fromCity', value: fromCity });
      stream.parameter({ name: 'fromState', value: fromState });

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
console.log(`📞 Ready to handle voice calls`);
console.log(`📅 Database appointment listener active\n`);

// Cleanup on exit
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  appointmentListener.cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Server] Shutting down...");
  appointmentListener.cleanup();
  process.exit(0);
});
