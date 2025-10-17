# Conference Call Feature

This document describes the conference call feature that allows you (the owner) to be added into an ongoing call between your AI assistant and a caller.

## Overview

When a caller requests to speak with a human or when the AI determines it needs human assistance, it can initiate a 3-way conference call. This seamlessly brings you into the ongoing conversation while maintaining the same call session.

## How It Works

### 1. **Transfer Initiation**
The AI assistant uses the `transferToHuman` tool when:
- The caller explicitly asks to speak with a human
- The caller asks to speak with you (Samir) directly
- The situation is too complex for the AI to handle alone
- You can also manually trigger this via the API

### 2. **Conference Creation**
When transfer is initiated:
1. A Twilio conference is created
2. You receive a call on your phone (configured via `OWNER_PHONE_NUMBER`)
3. The original caller's call is moved to the conference
4. **Stream Reconnection** (expected behavior):
   - The media stream disconnects and reconnects (~1-2 seconds)
   - New STT/TTS connections are created
   - All conversation history and state are preserved
   - The reconnection is detected automatically and handled gracefully
5. The AI assistant remains in the call but becomes more selective about when to speak

### 3. **Speaker Diarization**
Speaker diarization is **always enabled** from the start of every call:
- Minimal performance overhead
- No need to reconnect when entering conference mode
- Once in conference, the system distinguishes between you and the caller
- Transcripts are tagged with speaker labels (CALLER vs OWNER)

### 4. **Smart Response Gating**
A secondary AI agent (ResponseGatekeeper) analyzes each utterance to determine if the main assistant should respond:
- **Responds when**: You or the caller directly address the assistant, ask it questions, or request it to perform tasks
- **Stays silent when**: You and the caller are having a human-to-human conversation

## Configuration

### Environment Variables

Add this to your `.env` file:

```bash
# Owner's phone number for conference calls
# Format: E.164 format (e.g., +12676253752)
OWNER_PHONE_NUMBER=+1XXXXXXXXXX
```

### Example Usage

**Scenario 1: Caller Requests Human**
```
Caller: "Can I speak with a real person?"
AI: "Of course! Let me connect you with Samir. One moment please."
[AI uses transferToHuman tool]
[Conference call is created]
[You receive a call and join]
AI: "Hi Samir, I've connected you with the caller."
```

**Scenario 2: During Conference**
```
You: "Hey there! How can I help you today?"
Caller: "Hi! I was trying to book an appointment..."
You: "Jordan, can you check my calendar for next week?"
AI: "Sure! I'll check your availability for next week..."
[AI responds because directly addressed]
```

## Architecture

### New Components

1. **ConferenceManager** (`src/managers/ConferenceManager.ts`)
   - Manages Twilio conference creation
   - Tracks conference state
   - Handles adding participants

2. **ResponseGatekeeper** (`src/managers/ResponseGatekeeper.ts`)
   - AI agent that decides when to respond in conference mode
   - Uses Claude to analyze conversation context
   - Returns confidence scores with decisions

3. **Enhanced ConversationManager** (`src/core/ConversationManager.ts`)
   - Tracks speaker identities (CALLER, OWNER, ASSISTANT)
   - Formats messages with speaker labels for LLM context
   - Manages multi-speaker conversation history

4. **Conference Mode in VoiceAgent** (`src/core/VoiceAgent.ts`)
   - Enables/disables conference mode
   - Integrates with ResponseGatekeeper
   - Handles diarized transcripts

### API Endpoints

#### Create Conference
```
POST /api/create-conference/:streamSid
Body: { "reason": "Caller requested human assistance" }
```

#### Conference Status Callback
```
POST /api/conference-status
```
Receives webhooks from Twilio about conference events (participant join/leave).

## Technical Details

### Stream Reconnection (The Key Insight)

**Why does the stream reconnect?**
- Twilio media streams are attached to a specific call's TwiML
- When we move a call to a conference, we update its TwiML
- This causes Twilio to disconnect and reconnect the media stream
- **This is expected Twilio behavior, not a bug**

**How we handle it gracefully:**
1. TwilioHandler detects the reconnection (new "start" message with existing streamSid)
2. Creates new STT/TTS connections
3. Updates the existing VoiceAgent's connections
4. Preserves all state: conversation history, conference mode flag, speaker mappings
5. Total interruption: ~1-2 seconds

**What's preserved during reconnection:**
- ✅ Full conversation history
- ✅ Conference mode flag
- ✅ Speaker identification (caller vs owner)
- ✅ Agent state
- ✅ All LLM context

### Speaker Diarization
- Enabled automatically from the start of every call (no performance impact)
- Uses Deepgram's `diarize: true` option
- Each transcript includes a speaker ID (0, 1, 2, etc.)
- System learns which speaker ID corresponds to caller vs owner during conference

### State Management
- Conference mode is a flag on the VoiceAgent
- ConversationManager maintains speaker mappings
- First speaker in call is assumed to be caller
- Second speaker is assumed to be owner
- When stream reconnects (during conference setup), existing session is detected and preserved
- STT/TTS connections are gracefully replaced without losing conversation history

### Response Decision Flow
```
1. Transcript received with speaker ID
2. Add to conversation with speaker label
3. If in conference mode:
   a. Get last speaker (CALLER or OWNER)
   b. Call ResponseGatekeeper.shouldAssistantRespond()
   c. If shouldRespond = false: Stay silent
   d. If shouldRespond = true: Generate and speak response
```

## Testing

### Manual Test Procedure

1. Start the server with `OWNER_PHONE_NUMBER` configured
2. Initiate a call to your assistant
3. During the call, say: "I'd like to speak with a human"
4. You should receive a call on your configured phone
5. Answer the call and verify you're in a 3-way conference
6. Test the following scenarios:
   - Talk directly to the caller (AI should stay silent)
   - Ask the AI a question (AI should respond)
   - Ask the caller something (AI should stay silent)
   - Ask the AI to check the calendar (AI should respond)

### Debugging

Enable verbose logging by checking console output:
```
[Conference] Creating conference: conf-MZ...
[STT MZ...] Connected (Diarization enabled)
[STT MZ...] Transcript: speaker=0, text="..."
[Conversation] Caller identified as Speaker 0
[Gatekeeper] Decision: SILENT (confidence: 0.9) - Humans talking to each other
```

## Limitations & Future Improvements

### Current Limitations
- Owner phone number must be configured in advance (single owner)
- Conference billing rates apply from Twilio
- Diarization is always enabled (minimal overhead)

### Future Improvements
- Multiple owner support
- Analytics on conference usage
- Recording conferences for quality assurance
- WebRTC-based owner connection (no phone call needed)
- Dynamic diarization toggling (currently always on)

## Cost Considerations

Conference calls incur additional Twilio charges:
- Conference hosting: ~$0.0025/minute/participant
- Additional phone call to owner: Standard rates apply
- Deepgram diarization: Included in standard rates

## Security

- Only configured owner phone can be added to conference
- Conference names are unique per stream (unpredictable)
- Status callbacks can be secured with webhook authentication (not yet implemented)

## Support

For issues or questions about this feature:
- Check server logs for detailed trace
- Verify `OWNER_PHONE_NUMBER` is in correct format
- Ensure Twilio account has conference calling enabled
