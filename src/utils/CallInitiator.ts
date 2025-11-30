/**
 * Call Initiator
 * 
 * Utilities for initiating outbound calls via Twilio
 */

import Twilio from "twilio";

export interface CallInfo {
  callSid: string;
  to: string;
  from: string;
  status: string;
}

/**
 * Initiate a call to the owner
 * 
 * @param ownerPhone Owner's phone number
 * @returns Call information
 */
export async function initiateOwnerCall(
  ownerPhone: string
): Promise<CallInfo> {
  const twilioClient = Twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  const publicURL = process.env.PUBLIC_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const port = process.env.PORT || 40451;
  const isNgrok = publicURL?.includes(".ngrok-free.app");
  const wsUrl = `wss://${publicURL}${isNgrok ? "" : `:${port}`}/twilio-ws`;

  console.log(`[CallInitiator] Initiating call to owner: ${ownerPhone}`);
  console.log(`[CallInitiator] WebSocket URL: ${wsUrl}`);

  try {
    // Create TwiML that connects to our WebSocket with conference metadata
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Connect>
          <Stream url="${wsUrl}">
            <Parameter name="role" value="owner" />
          </Stream>
        </Connect>
      </Response>`;

    const call = await twilioClient.calls.create({
      from: process.env.TWILIO_PHONE_NUMBER!,
      to: ownerPhone,
      twiml
    });

    console.log(`[CallInitiator] ✅ Owner call initiated: ${call.sid}`);
    console.log(`[CallInitiator] Status: ${call.status}`);

    return {
      callSid: call.sid,
      to: call.to,
      from: call.from,
      status: call.status
    };
  } catch (error) {
    console.error(`[CallInitiator] ❌ Error initiating owner call:`, error);
    throw error;
  }
}

/**
 * Hang up a call
 */
export async function hangUpCall(callSid: string): Promise<void> {
  const twilioClient = Twilio(
    process.env.TWILIO_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    await twilioClient.calls(callSid).update({ status: 'completed' });
    console.log(`[CallInitiator] ✅ Call hung up: ${callSid}`);
  } catch (error) {
    console.error(`[CallInitiator] ❌ Error hanging up call ${callSid}:`, error);
    throw error;
  }
}
