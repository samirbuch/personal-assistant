import twilio from "twilio";
import * as Bun from "bun";

console.log("Hello via Bun!");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

Bun.serve({
  port: 40451,
  fetch(req, server) {
    // upgrade the request to a WebSocket
    if (server.upgrade(req)) {
      return; // do not return a Response
    }
    return new Response("Upgrade failed", { status: 500 });
  },
  websocket: {
    message(ws, message) {

    }
  }
})