# Conference Call Quick Start

## Setup

1. Add your phone number to `.env`:
```bash
OWNER_PHONE_NUMBER=+12676253752  # Your phone in E.164 format
```

2. Restart the server

## Usage

### As a Caller
Simply ask during a call:
- "Can I speak with a human?"
- "I'd like to talk to Samir"
- "Can I speak with someone?"

### As the Owner (You)
When you receive a conference call:
1. Answer your phone
2. You'll hear: "You have an incoming call. Connecting you now."
3. You'll join the 3-way call with the caller and AI

### Interacting with the AI in Conference
The AI will intelligently decide when to speak:

**AI will respond when:**
- You directly address it: "Jordan, check my calendar"
- Caller asks it a question: "What times are available?"
- You ask it to do something: "Can you look that up?"

**AI stays silent when:**
- You're talking to the caller
- Caller is responding to you
- Natural back-and-forth conversation

## API Usage

### Programmatically Create Conference
```bash
curl -X POST http://localhost:40451/api/create-conference/{streamSid} \
  -H "Content-Type: application/json" \
  -d '{"reason": "Manual transfer requested"}'
```

## How It Works

```
┌─────────────┐
│   Caller    │ ─────┐
└─────────────┘      │
                     ├──> Conference Call
┌─────────────┐      │
│  AI Agent   │ ─────┤
└─────────────┘      │    • Speaker diarization ON
                     │    • ResponseGatekeeper active
┌─────────────┐      │    • Smart response filtering
│ You (Owner) │ ─────┘
└─────────────┘
```

## Example Conversation

```
Caller:  "Can I speak with a real person?"
AI:      "Of course! Let me connect you with Samir."
         [Conference initiated, you receive call]

You:     "Hello! How can I help you?"
Caller:  "Hi! I need to schedule an appointment."
You:     "Sure! Jordan, what does my schedule look like tomorrow?"
AI:      "You're available from 2pm to 5pm tomorrow."
You:     "Perfect. Let's book 3pm. Thanks Jordan."
AI:      [Stays silent - conversation is between humans]
```

## Troubleshooting

**Conference not working?**
- Check `OWNER_PHONE_NUMBER` is set
- Verify phone number format: `+1XXXXXXXXXX`
- Check console logs for errors

**AI responding too much?**
- Check logs for `[Gatekeeper]` decisions
- Response gatekeeper may need tuning

**AI not responding when addressed?**
- Ensure you use the AI's name "Jordan"
- Or be explicit: "Jordan, can you..."

## Technical Notes

- Diarization identifies speakers as 0, 1, 2, etc.
- System maps first speaker → Caller, second speaker → Owner
- ResponseGatekeeper uses Claude Haiku for fast decisions
- Conference mode persists for entire call duration
