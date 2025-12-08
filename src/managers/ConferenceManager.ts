/**
 * Conference Manager
 * 
 * Manages Twilio conference calls, allowing the owner to join ongoing calls
 */

import Twilio from "twilio";

export interface ConferenceState {
  conferenceName: string;
  callSid: string;
  isActive: boolean;
  ownerParticipantSid?: string;
  callerParticipantSid?: string;
}

export class ConferenceManager {
  private twilioClient: Twilio.Twilio;
  private conferences: Map<string, ConferenceState> = new Map();
  private ownerPhone: string;

  constructor(ownerPhone: string) {
    this.twilioClient = Twilio(
      process.env.TWILIO_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.ownerPhone = ownerPhone;
  }

  /**
   * Create a conference call with the owner
   * 
   * ARCHITECTURE NOTES:
   * ==============================
   * 1. Original call has a media stream attached (AI is working)
   * 2. AI announces the transfer and prepares to disconnect
   * 3. We dial the owner into a new Twilio conference
   * 4. We update the original call's TwiML to join that conference
   * 5. **The media stream WILL permanently disconnect** - this is expected Twilio behavior
   * 6. Caller and owner continue in conference WITHOUT the AI
   * 
   * 
   * @param callSid The current call SID
   * @param streamSid The stream SID (used for conference naming)
   * @returns Conference state
   */
  public async createConferenceAndAddOwner(
    callSid: string,
    streamSid: string
  ): Promise<ConferenceState> {
    const conferenceName = `conf-${streamSid}`;

    console.log(`\n[Conference] ═══ CREATING CONFERENCE ═══`);
    console.log(`[Conference] Conference name: ${conferenceName}`);
    console.log(`[Conference] Original call SID: ${callSid}`);

    try {
      // Step 1: Dial the owner into a conference (this creates it)
      console.log(`[Conference] Step 1: Dialing owner at ${this.ownerPhone}...`);
      const ownerCall = await this.twilioClient.calls.create({
        from: process.env.TWILIO_PHONE_NUMBER!,
        to: this.ownerPhone,
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Say>Connecting you to the call.</Say>
            <Dial>
              <Conference
                beep="false"
                startConferenceOnEnter="true"
                endConferenceOnExit="true"
                statusCallback="${this.getStatusCallbackUrl()}"
                statusCallbackEvent="join leave"
              >${conferenceName}</Conference>
            </Dial>
          </Response>`
      });

      console.log(`[Conference] Owner call initiated: ${ownerCall.sid}`);

      // Step 2: Wait for conference to be created
      console.log(`[Conference] Step 2: Waiting for conference to initialize...`);
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Step 3: Move the original call into the conference
      // This will cause the media stream to disconnect permanently (expected for Option 2)
      console.log(`[Conference] Step 3: Moving original call to conference...`);
      console.log(`[Conference] ⚠️  AI media stream will disconnect (this is expected)`);
      
      await this.twilioClient.calls(callSid).update({
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Dial>
              <Conference
                beep="false"
                startConferenceOnEnter="false"
                statusCallback="${this.getStatusCallbackUrl()}"
                statusCallbackEvent="join leave"
              >${conferenceName}</Conference>
            </Dial>
          </Response>`
      });

      console.log(`[Conference] ✅ Original call moved to conference`);
      console.log(`[Conference] ✅ Caller and owner now in conference (AI disconnected)`);

      const state: ConferenceState = {
        conferenceName,
        callSid,
        isActive: true,
        ownerParticipantSid: ownerCall.sid,
        callerParticipantSid: callSid
      };

      this.conferences.set(streamSid, state);
      
      return state;
    } catch (error) {
      console.error(`[Conference] ❌ Error creating conference:`, error);
      throw error;
    }
  }

  /**
   * End a conference
   */
  public async endConference(streamSid: string): Promise<void> {
    const state = this.conferences.get(streamSid);
    if (!state) {
      console.warn(`[Conference] No conference found for ${streamSid}`);
      return;
    }

    try {
      // End the owner's call
      if (state.ownerParticipantSid) {
        await this.twilioClient.calls(state.ownerParticipantSid).update({
          status: 'completed'
        });
      }

      state.isActive = false;
      this.conferences.delete(streamSid);
      console.log(`[Conference] Conference ended: ${state.conferenceName}`);
    } catch (error) {
      console.error(`[Conference] Error ending conference:`, error);
    }
  }

  /**
   * Check if a conference is active
   */
  public isConferenceActive(streamSid: string): boolean {
    const state = this.conferences.get(streamSid);
    return state?.isActive ?? false;
  }

  /**
   * Get conference state
   */
  public getConferenceState(streamSid: string): ConferenceState | undefined {
    return this.conferences.get(streamSid);
  }

  /**
   * Get status callback URL for conference events
   */
  private getStatusCallbackUrl(): string {
    const publicURL = process.env.PUBLIC_URL?.replace(/^https?:\/\//, "").replace(/\/$/, "");
    const port = process.env.PORT || 40451;
    const isNgrok = publicURL?.includes(".ngrok-free.app");
    return `http://${publicURL}${isNgrok ? "" : `:${port}`}/api/conference-status`;
  }
}
