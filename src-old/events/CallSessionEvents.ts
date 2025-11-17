import { EventEmitter } from "events";

export type SessionEvent = 
  | "interrupt"           // User interrupted assistant
  | "streamStart"         // Assistant starts speaking
  | "streamEnd"           // Assistant finishes speaking
  | "audioGateOpen"       // Audio can flow to Twilio
  | "audioGateClose"      // Audio should stop flowing
  | "userSpeechDetected"  // User speech activity detected
  | "cleanup";            // Session cleanup

export class CallSessionEvents extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Allow multiple listeners
  }

  // Typed emit helpers
  emitInterrupt(reason: string) {
    this.emit("interrupt", reason);
  }

  emitStreamStart() {
    this.emit("streamStart");
  }

  emitStreamEnd() {
    this.emit("streamEnd");
  }

  emitAudioGateOpen() {
    this.emit("audioGateOpen");
  }

  emitAudioGateClose() {
    this.emit("audioGateClose");
  }

  emitUserSpeechDetected() {
    this.emit("userSpeechDetected");
  }

  emitCleanup() {
    this.emit("cleanup");
  }

  // Typed listener helpers
  onInterrupt(handler: (reason: string) => void) {
    this.on("interrupt", handler);
  }

  onStreamStart(handler: () => void) {
    this.on("streamStart", handler);
  }

  onStreamEnd(handler: () => void) {
    this.on("streamEnd", handler);
  }

  onAudioGateOpen(handler: () => void) {
    this.on("audioGateOpen", handler);
  }

  onAudioGateClose(handler: () => void) {
    this.on("audioGateClose", handler);
  }

  onUserSpeechDetected(handler: () => void) {
    this.on("userSpeechDetected", handler);
  }

  onCleanup(handler: () => void) {
    this.on("cleanup", handler);
  }
}
