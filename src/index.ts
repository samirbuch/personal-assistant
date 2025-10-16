import twilio from "twilio";
import * as Bun from "bun";

const PORT = process.env.PORT || 40451

console.log("Hello via Bun!");

const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

Bun.serve({
  port: PORT,
  routes: {
    "/api/twilio-gateway": async req => {
      let publicURL = process.env.PUBLIC_URL;
      if (!publicURL) return new Response("Error 500: Missing PUBLIC_URL", { status: 500 });

      if (/^https?:\/\//.test(publicURL)) {
        // Remove a http:// or https://
        publicURL = publicURL.split(/^https?:\/\//)[1];
        if (!publicURL) return new Response("Error 500: Malformed PUBLIC_URL", { status: 500 });
      }

      const isNgrok = publicURL.includes(".ngrok-free.app");
      if (isNgrok && publicURL.includes(":")) {
        console.warn("PUBLIC_URL contains a PORT. This should be automatically forwarded by ngrok.");
        console.warn("Cleaning URL...");
        const portMatch = publicURL.match(/:\d{1,5}/)![0];
        const indexOfPort = publicURL.indexOf(portMatch);
        publicURL = publicURL.slice(0, indexOfPort) + publicURL.slice(indexOfPort + portMatch.length, publicURL.length);
      }

      return new Response(`ws://${publicURL}${isNgrok ? "" : `:${PORT}`}/twilio-ws`);
    }
  },

  fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/twilio-ws") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("Upgrade failed", { status: 400 });
      }
    }
    return new Response("Hello World");
  },
  websocket: {
    message(ws, message) {

    }
  }
})