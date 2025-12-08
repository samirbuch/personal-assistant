# Personal Voice Assistant

**Keywords:** TypeScript, Node.js/Bun, Voice AI, Real-time Communication, Twilio, Deepgram, LLMs, WebSocket, State Machine Architecture

## Project Abstract

This project implements an AI-powered voice assistant that makes phone calls on behalf of a user. The system handles appointment scheduling, calendar integration, and can seamlessly transfer calls to a human when needed through an innovative 3-way conference calling architecture.

**Key Features:**
- **Autonomous Calling:** AI places calls to businesses and navigates phone menus (DTMF)
- **Natural Conversation:** Real-time speech-to-text (STT) and text-to-speech (TTS) with interruption handling
- **Calendar Integration:** Checks availability via Microsoft Outlook
- **Human Handoff:** Intelligent handoff conference calling when human intervention is needed

### High Level Requirements

1. User triggers outbound calls via API to any phone number
2. AI conducts autonomous conversations for appointment scheduling and inquiries
3. Calendar integration for checking availability and booking appointments
4. DTMF navigation for automated phone menus
5. Seamless conference calling when human intervention is needed
6. Sub-200ms interruption detection and response
7. Real-time audio streaming with minimal latency

### Conceptual Design

**Architecture:** Event-driven system with state machine pattern (IDLE → LISTENING → THINKING → SPEAKING → INTERRUPTED)

**Technology Stack:**
- **Runtime:** Bun v1.3.0+ (JavaScript runtime)
- **Language:** TypeScript v5+ with strict mode
- **External APIs:** Twilio (voice calls), Deepgram (STT/TTS), Anthropic Claude (LLM), Microsoft Graph (calendar)
- **Communication:** WebSocket for real-time audio streaming
- **Audio:** μ-law encoding for telephony

**Key Components:**
- VoiceAgent: Main orchestrator
- StateMachine: State management
- AudioController: Audio gating for interruptions
- ConversationManager: History and speaker tracking
- ConferenceManager: 3-way calling coordination

## Proof of Concept

**GitHub Repository:** https://github.com/samirbuch/personal-assistant

## Background

Traditional appointment scheduling and phone-based tasks are time-consuming and require human attention. Existing solutions fall into two categories: expensive commercial products like Google Duplex (closed-source, limited availability) or open-source frameworks like Rasa and Asterisk (require extensive manual setup and lack modern AI capabilities). This project bridges the gap by creating an open-source, cost-effective voice AI assistant using modern LLMs and cloud APIs. The system is built from scratch with original architecture, leveraging Twilio for telephony, Deepgram for speech processing, Anthropic Claude for conversation intelligence, and Microsoft Graph for calendar integration. Novel contributions include a dual-call conference architecture for seamless human handoff and adaptive interruption detection with sub-200ms response times.

## Required Resources

**Hardware:** Standard laptop/desktop with internet connection (no special equipment required)

**Software & APIs:**
- Bun runtime (free)
- Twilio account (~$20-50/month: phone number, voice minutes, conference hosting)
- Deepgram API (pay-as-you-go, free tier available)
- Anthropic API (pay-as-you-go, free credits for new accounts)
<!-- - Microsoft Azure app registration (free tier available) -->
- ngrok for local webhook testing (free)
