# personal-assistant

An AI-powered voice assistant that makes phone calls on your behalf and can seamlessly transfer to a human when needed.

## Features

- 🤖 **AI Voice Agent**: Automated voice assistant for making calls and scheduling appointments
- 📞 **Conference Calling**: Seamlessly bring yourself into calls as a 3-way conference
- 🎯 **Smart Response Gating**: AI intelligently determines when to speak in conference mode
- 👥 **Speaker Diarization**: Distinguishes between different speakers in conversation
- 📅 **Calendar Integration**: Checks availability and schedules appointments via Outlook
- 🔢 **DTMF Navigation**: Can navigate phone menus automatically

## Quick Start

To install dependencies:

```bash
bun install
```

Configure environment variables (create `.env`):
```bash
TWILIO_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_auth
TWILIO_PHONE_NUMBER=your_twilio_phone
DEEPGRAM_ACCESS_TOKEN=your_deepgram_token
PUBLIC_URL=your_public_url
OWNER_PHONE_NUMBER=+1XXXXXXXXXX  # For conference calling
```

To run:

```bash
bun run index.ts
```

## Conference Call Feature

See [Conference Feature Documentation](docs/CONFERENCE_FEATURE.md) for detailed information.

**Quick usage**: During any call, the caller can say "I'd like to speak with a human" and the AI will add you to the call as a 3-way conference. The AI then intelligently stays silent during human-to-human conversation but responds when directly addressed.

See [Quick Start Guide](docs/CONFERENCE_QUICK_START.md) for setup and usage.

## Documentation

- [Conference Feature Documentation](docs/CONFERENCE_FEATURE.md) - Detailed conference calling documentation
- [Conference Quick Start](docs/CONFERENCE_QUICK_START.md) - Quick setup guide
- [Project Structure](docs/PROJECT_STRUCTURE.md) - Code organization
- [Outlook Setup](docs/OUTLOOK_SETUP.md) - Calendar integration setup

This project was created using `bun init` in bun v1.3.0. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
