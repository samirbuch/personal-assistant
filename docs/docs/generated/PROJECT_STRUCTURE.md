# Project Structure - Voice Agent Architecture

This project is a complete rewrite with a clean, event-driven architecture for handling phone-based AI voice conversations with instant interruption support.

## 🏗️ File Structure

```
src/
├── index.ts                                # Main Bun server entry point
│
├── core/                                   # Core business logic components
│   ├── VoiceAgent.ts                      # Main orchestrator - coordinates all components
│   ├── StateMachine.ts                    # State management (IDLE → LISTENING → SPEAKING → INTERRUPTING)
│   ├── AudioController.ts                 # Audio gate with instant on/off control
│   ├── InterruptionDetector.ts            # Smart interruption detection with adaptive thresholds
│   └── ConversationManager.ts             # Conversation history and context management
│
├── managers/                               # Service managers
│   ├── SessionManager.ts                  # Session lifecycle and cleanup
│   ├── DeepgramManager.ts                 # Deepgram STT/TTS with connection pooling
│   └── LLMManager.ts                      # Claude streaming with abort handling
│
└── handlers/                               # External service handlers
    └── TwilioHandler.ts                   # Twilio WebSocket message handling
```

## 📋 Component Responsibilities

### **Core Components**

#### `VoiceAgent.ts` - Main Orchestrator
**Purpose:** Coordinates all components and manages the voice agent lifecycle

**Key Methods:**
- `handleIncomingAudio(audio)` - Process incoming user audio
- `handleTranscript(text)` - Process user transcripts
- `generateResponse()` - Generate and stream LLM responses
- `interrupt()` - Handle interruptions
- `cleanup()` - Clean shutdown

**Responsibilities:**
- Coordinates between all managers and core components
- Owns the state machine
- Handles the main event loop
- Manages interruption flow

#### `StateMachine.ts` - State Management
**Purpose:** Clean state transitions without flag hell

**States:**
```typescript
enum State {
  IDLE,          // Waiting for user input
  LISTENING,     // User is speaking
  SPEAKING,      // Agent is responding
  INTERRUPTING,  // Interrupt in progress
  ERROR          // Error state
}
```

**Transitions:**
- `IDLE → LISTENING` - User starts speaking
- `LISTENING → SPEAKING` - User finishes, agent responds
- `SPEAKING → INTERRUPTING` - User interrupts
- `INTERRUPTING → LISTENING` - Ready for new input

**Benefits:**
- No conflicting flags
- Clear state transitions
- Easy to debug
- Prevents race conditions

#### `AudioController.ts` - Audio Gate
**Purpose:** Instant control over audio flow to Twilio

**Key Features:**
- `open()` - Allow audio to flow
- `close()` - Stop audio immediately
- `shouldSendAudio()` - Check if audio should be sent
- Gate state managed by state machine

**How It Works:**
- TTS generates audio continuously
- AudioController decides what gets sent to Twilio
- Closing the gate = instant silence
- No more waiting for buffers to clear

#### `InterruptionDetector.ts` - Smart Detection
**Purpose:** Detect user interruptions with adaptive thresholds

**Features:**
- **Adaptive noise baseline** - Learns ambient noise over time
- **Energy-based detection** - Calculates audio energy from mulaw samples
- **Configurable sensitivity** - Adjustable threshold multiplier
- **Debouncing** - Prevents rapid re-triggers

**Key Methods:**
- `processAudioChunk(audio)` - Analyze incoming audio
- `updateBaseline(energy)` - Update rolling noise average
- `isInterruption()` - Detect if current audio is interruption

**Algorithm:**
```typescript
energy = calculateEnergy(audioChunk)
if (state === SPEAKING && energy > baseline * threshold) {
  return INTERRUPT
}
```

#### `ConversationManager.ts` - Context Management
**Purpose:** Manage conversation history and handle truncation on interrupts

**Key Methods:**
- `addMessage(role, content)` - Add to conversation history
- `getHistory()` - Retrieve full conversation
- `truncateToPartial(partialText)` - Handle interrupted responses
- `clear()` - Reset conversation

**Features:**
- Maintains typed message history
- Handles partial message truncation on interrupt
- Provides context for LLM
- Memory efficient

---

### **Managers**

#### `SessionManager.ts` - Session Lifecycle
**Purpose:** Manage individual call sessions

**Key Methods:**
- `createSession(streamSid, ws)` - Initialize new session
- `getSession(streamSid)` - Retrieve session
- `deleteSession(streamSid)` - Clean up session
- `getAllSessions()` - Get all active sessions

**Features:**
- Maps streamSid to VoiceAgent instances
- Handles session cleanup
- Manages multiple concurrent calls
- Prevents memory leaks

#### `DeepgramManager.ts` - Deepgram Integration
**Purpose:** Manage Deepgram STT and TTS connections with pooling

**Key Features:**
- **Connection pooling** - Reuse connections, avoid rate limits
- **STT Management** - Speech-to-Text with event handlers
- **TTS Management** - Text-to-Speech streaming
- **Error handling** - Automatic reconnection on failures

**Key Methods:**
- `createSTTConnection()` - Create/get pooled STT connection
- `createTTSConnection()` - Create/get pooled TTS connection
- `setupSTTHandlers(onTranscript)` - Configure STT events
- `setupTTSHandlers(onAudio)` - Configure TTS events
- `closeConnections()` - Clean shutdown

**Benefits:**
- No more Deepgram rate limit issues
- Efficient resource usage
- Handles reconnection automatically
- Clean event-driven API

#### `LLMManager.ts` - Claude Integration
**Purpose:** Manage Claude AI streaming with proper abort handling

**Key Features:**
- Configurable model (Claude 3.5 Haiku)
- System prompt management
- Streaming text responses
- Abort signal support

**Key Methods:**
- `createAgent(abortSignal)` - Create configured Claude agent
- `streamResponse(conversation, onChunk, onComplete)` - Stream LLM response
- Handles AbortError gracefully

**Configuration:**
```typescript
model: "claude-3-5-haiku-latest"
system: Custom prompt for Jordan (personal assistant)
stopWhen: stepCountIs(20)
```

---

### **Handlers**

#### `TwilioHandler.ts` - Twilio Integration
**Purpose:** Handle Twilio WebSocket messages and route to VoiceAgent

**Event Handlers:**
- `handleStart()` - New call initiated
- `handleMedia()` - Audio data received
- `handleStop()` - Call ended
- `handleMark()` - Track message received

**Flow:**
```
Twilio WebSocket → TwilioHandler → VoiceAgent → Processing
                ← TwilioHandler ← AudioController ← Audio output
```

---

### **Main Entry Point**

#### `index.ts` - Bun Server
**Purpose:** HTTP/WebSocket server setup

**Routes:**
- `POST /api/calls/:number` - Initiate outbound call
- `POST /api/twilio-gateway` - TwiML for call routing
- `WS /twilio-ws` - WebSocket for audio streaming

**Features:**
- Clean route handling
- Environment variable validation
- WebSocket upgrade handling
- Delegates to TwilioHandler

---

## 🔄 Data Flow

### Normal Conversation Flow
```
1. User speaks
   ↓
2. Twilio → handleMedia() → audio chunks
   ↓
3. VoiceAgent.handleIncomingAudio()
   ↓
4. Deepgram STT → transcript
   ↓
5. VoiceAgent.handleTranscript()
   ↓
6. StateMachine: LISTENING → SPEAKING
   ↓
7. LLMManager.streamResponse()
   ↓
8. AudioController.open()
   ↓
9. Deepgram TTS → audio
   ↓
10. AudioController → Twilio
   ↓
11. User hears response
```

### Interruption Flow
```
1. User speaks while agent is speaking
   ↓
2. VoiceAgent.handleIncomingAudio()
   ↓
3. InterruptionDetector.isInterruption() = true
   ↓
4. VoiceAgent.interrupt()
   ↓
5. StateMachine: SPEAKING → INTERRUPTING
   ↓
6. AudioController.close() - INSTANT silence
   ↓
7. LLMManager aborts stream
   ↓
8. ConversationManager.truncateToPartial()
   ↓
9. Send Twilio clear commands
   ↓
10. StateMachine: INTERRUPTING → LISTENING
   ↓
11. Ready for new user input
```

---

## 🎯 Key Architectural Decisions

### 1. **State Machine Over Flags**
- **Before:** Multiple boolean flags (`isStreaming`, `isProcessingInterrupt`, `audioGateOpen`)
- **After:** Single state enum with clear transitions
- **Benefit:** No conflicting states, easier to debug

### 2. **Audio Gate Pattern**
- **Before:** Try to clear Twilio buffers after audio sent
- **After:** Control audio at the source before sending
- **Benefit:** Instant interruption response

### 3. **Connection Pooling**
- **Before:** Recreate Deepgram connections on every interrupt
- **After:** Reuse connections throughout call lifecycle
- **Benefit:** No rate limit issues, better performance

### 4. **Event-Driven Architecture**
- **Before:** Direct method calls and flag checking
- **After:** Components communicate via events and state changes
- **Benefit:** Loose coupling, easier to test and extend

### 5. **Separation of Concerns**
- **Before:** Everything mixed together
- **After:** Each component has a single, clear responsibility
- **Benefit:** Maintainable, testable, scalable

---

## 🚀 Performance Optimizations

1. **Adaptive Thresholds** - Learns environment noise automatically
2. **Connection Reuse** - No overhead from recreating connections
3. **Debouncing** - Prevents rapid re-triggers of interruptions
4. **Efficient State Checks** - Single state variable vs multiple flags
5. **Minimal Memory Footprint** - Clean session cleanup

---

## 🛠️ Future Extensibility

Easy to add:
- Multiple LLM providers (swap LLMManager)
- Different TTS voices (configure DeepgramManager)
- Custom interruption strategies (modify InterruptionDetector)
- Advanced conversation features (extend ConversationManager)
- Telemetry and monitoring (add observers to state machine)
- Multi-language support (configure LLM system prompt)

---

## 📝 Configuration

All configuration lives in:
- Environment variables (`.env`)
- Manager constructors (easy to customize)
- No scattered config across codebase

---

## 🧪 Testing Strategy

Each component can be tested in isolation:
- **StateMachine** - Test state transitions
- **AudioController** - Test gate open/close logic
- **InterruptionDetector** - Test detection algorithm
- **ConversationManager** - Test history management
- **Managers** - Mock external services

---

This architecture is production-ready, maintainable, and built to handle the complex real-time requirements of voice AI conversations.
