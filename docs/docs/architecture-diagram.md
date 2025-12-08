---
sidebar_position: 2
title: Architecture Diagram
description: Class diagram showing the flow of information in the Personal Assistant Voice Agent system
---

# Architecture Diagram

This diagram illustrates the core architecture and information flow of the Personal Assistant Voice Agent system.

```mermaid
---
config: 
  layout: elk
---
classDiagram
    %% Entry Point
    class Server {
        +PORT
        +twilioClient
        +appointmentListener
        +handleStart()
        +handleMedia()
        +handleStop()
        +initiateCall()
    }

    %% Handlers
    class TwilioHandler {
        +handleStart()
        +handleMedia()
        +handleStop()
        +initiateConference()
        +getSessionManager()
    }

    %% Managers
    class SessionManager {
        -agents: Map~string, VoiceAgent~
        +create(streamSid, agent)
        +getAgent(streamSid)
        +delete(streamSid)
        +getAllAgents()
    }

    class DatabaseAppointmentListener {
        -channel: RealtimeChannel
        +on(event, callback)
        -handleInsert()
        -handleUpdate()
    }

    class DeepgramManager {
        +createSTT()
        +createTTS()
        +setupSTTHandlers()
        +setupTTSHandlers()
    }

    class LLMManager {
        +createLLMAgent(voiceAgent, userContext)
        +tools: getCalendarAvailability
        +tools: getCalendarEvents
        +tools: transferToHuman
        +tools: updateAppointmentNotes
    }

    class OutlookManager {
        -msalClient
        +getAvailableSlots(start, end, minDuration)
        +getEvents(start, end)
        +createEvent()
    }

    class ConferenceManager {
        -twilioClient
        -conferences: Map
        +createConferenceAndAddOwner(callSid, streamSid)
        +getConferenceState()
        +endConference()
    }

    %% Core Components
    class VoiceAgent {
        -streamSid: string
        -callSid: string
        -stateMachine: VoiceAgentStateMachine
        -audio: AudioController
        -conversation: ConversationManager
        -interruption: InterruptionDetector
        -stt: LiveClient
        -tts: SpeakLiveClient
        -agent: Agent
        +initialize()
        +handleIncomingAudio(mulawBase64)
        +handleTranscript(transcript)
        +handleTTSAudio(audioBase64)
        +processUserInput()
        +speak(text)
        +cleanup()
    }

    class VoiceAgentStateMachine {
        -currentState: AgentState
        -transitions: StateTransition[]
        +getState()
        +transition(to, reason)
        +canTransitionTo(newState)
        +onStateChange(listener)
    }

    class AudioController {
        -enabled: boolean
        -ws: WebSocket
        -streamSid: string
        +enable()
        +disable()
        +isEnabled()
        +sendAudio(audioBase64)
        +clearBuffer()
        +stopImmediately()
    }

    class ConversationManager {
        -messages: ModelMessage[]
        -currentAssistantMessage: string
        -conferenceMode: boolean
        +addUserMessage(content, speaker)
        +addAssistantMessage(content)
        +appendAssistantDelta(delta)
        +handleInterruption()
        +getMessages()
        +enableConferenceMode()
    }

    class InterruptionDetector {
        -lastDetectionTime: number
        -detectionCount: number
        +detectActivity(mulawBase64)
        +shouldInterrupt(mulawBase64)
    }

    %% External Services
    class Deepgram {
        <<external>>
        +LiveClient (STT)
        +SpeakLiveClient (TTS)
    }

    class Twilio {
        <<external>>
        +WebSocket
        +Calls API
        +Conference API
    }

    class Claude {
        <<external>>
        +AI Agent
        +Tool Calling
    }

    class Supabase {
        <<external>>
        +Database
        +Realtime Subscriptions
    }

    class Outlook {
        <<external>>
        +Calendar API
        +Events API
    }

    %% Relationships - Entry & Setup
    Server --> TwilioHandler : uses
    Server --> DatabaseAppointmentListener : listens to
    TwilioHandler --> SessionManager : manages sessions
    TwilioHandler --> DeepgramManager : creates STT/TTS
    TwilioHandler --> LLMManager : creates agent
    TwilioHandler --> VoiceAgent : creates & routes

    %% Relationships - Voice Agent Core
    VoiceAgent --> VoiceAgentStateMachine : manages state
    VoiceAgent --> AudioController : controls audio
    VoiceAgent --> ConversationManager : tracks conversation
    VoiceAgent --> InterruptionDetector : detects interruptions
    VoiceAgent --> Deepgram : sends/receives audio
    VoiceAgent --> Claude : generates responses

    %% Relationships - Managers
    LLMManager --> OutlookManager : calendar tools
    LLMManager --> ConferenceManager : transfer tool
    SessionManager --> VoiceAgent : stores/retrieves
    DatabaseAppointmentListener --> Supabase : subscribes to
    OutlookManager --> Outlook : queries calendar

    %% Relationships - External Services
    DeepgramManager --> Deepgram : creates clients
    ConferenceManager --> Twilio : manages conferences
    Server --> Twilio : initiates calls
    AudioController --> Twilio : sends audio

    %% Data Flow Annotations
    note for VoiceAgent "Central orchestrator: 1. Receives audio from Twilio, 2. Transcribes via Deepgram STT, 3. Processes with Claude LLM, 4. Synthesizes via Deepgram TTS, 5. Sends audio back to Twilio"

    note for VoiceAgentStateMachine "States: IDLE → LISTENING → THINKING → SPEAKING →  INTERRUPTED"

    note for DatabaseAppointmentListener "Triggers outbound calls when new appointments are created"
```

## Information Flow

### Inbound Call Flow

1. **Call Initiation**: Twilio receives incoming call and opens WebSocket connection
2. **Session Setup**: `TwilioHandler.handleStart()` creates:
   - Deepgram STT/TTS clients via `DeepgramManager`
   - LLM Agent with tools via `LLMManager`
   - `VoiceAgent` instance with all dependencies
3. **Registration**: `SessionManager` stores the VoiceAgent by streamSid
4. **Audio Loop**:
   - Twilio → `VoiceAgent.handleIncomingAudio()` → Deepgram STT
   - Deepgram STT → `VoiceAgent.handleTranscript()` → State transition to THINKING
   - `VoiceAgent.processUserInput()` → Claude LLM (with calendar tools)
   - LLM response → `VoiceAgent.speak()` → Deepgram TTS
   - Deepgram TTS → `VoiceAgent.handleTTSAudio()` → AudioController → Twilio

### Outbound Call Flow

1. **Appointment Created**: User creates appointment via web frontend
2. **Database Trigger**: Supabase realtime event fires
3. **Listener Notification**: `DatabaseAppointmentListener` receives event
4. **Call Initiation**: Server calls API endpoint `/api/calls/:number`
5. **Same as Inbound**: Once connected, follows same audio loop

### State Management

The `VoiceAgentStateMachine` enforces valid state transitions:

- **IDLE** → **LISTENING**: Call starts
- **LISTENING** → **THINKING**: User finishes speaking (transcript received)
- **THINKING** → **SPEAKING**: LLM generates response, TTS begins
- **SPEAKING** → **INTERRUPTED**: User speaks during agent speech
- **SPEAKING** → **LISTENING**: Agent finishes speaking
- **INTERRUPTED** → **LISTENING**: Interrupt handled, ready for user

### Conference/Transfer Flow

1. User requests human via LLM tool `transferToHuman()`
2. `ConferenceManager.createConferenceAndAddOwner()` is called
3. Twilio Conference created and owner is dialed in
4. Original call moved to conference
5. AI disconnects, caller and owner continue directly

## Key Design Patterns

### Component Separation
- **Core**: Business logic (VoiceAgent, StateMachine, ConversationManager)
- **Managers**: External service integration (Deepgram, LLM, Outlook)
- **Handlers**: Protocol/API handling (TwilioHandler)
- **Utils**: Shared utilities

### Single Responsibility
- Each class has one clear purpose
- VoiceAgent orchestrates but delegates to specialists
- State management separated from audio/conversation logic

### Event-Driven Architecture
- Database changes trigger appointments via EventEmitter
- State transitions notify listeners
- Deepgram events drive audio pipeline
