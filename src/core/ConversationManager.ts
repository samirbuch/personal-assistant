/**
 * Conversation Manager
 * 
 * Manages conversation history with support for partial responses,
 * interruptions, and multi-speaker conversations (conference mode).
 */

import type { ModelMessage } from "ai";

export enum Speaker {
  CALLER = "caller",
  OWNER = "owner",
  ASSISTANT = "assistant"
}

export interface SpeakerMessage {
  role: string;
  content: string;
  speaker?: Speaker;
  speakerId?: number; // Raw speaker ID from diarization
}

export class ConversationManager {
  private messages: SpeakerMessage[] = [];
  private currentAssistantMessage: string = "";
  private conferenceMode: boolean = false;
  private callerSpeakerId?: number; // Track which speaker ID is the caller
  private ownerSpeakerId?: number; // Track which speaker ID is the owner

  /**
   * Enable conference mode with speaker tracking
   */
  public enableConferenceMode(): void {
    this.conferenceMode = true;
    console.log(`[Conversation] Conference mode enabled`);
  }

  /**
   * Disable conference mode
   */
  public disableConferenceMode(): void {
    this.conferenceMode = false;
    this.callerSpeakerId = undefined;
    this.ownerSpeakerId = undefined;
    console.log(`[Conversation] Conference mode disabled`);
  }

  /**
   * Check if in conference mode
   */
  public isConferenceMode(): boolean {
    return this.conferenceMode;
  }

  /**
   * Add a user message to the conversation
   * @param content Message content
   * @param speakerId Optional speaker ID from diarization
   */
  public addUserMessage(content: string, speakerId?: number): void {
    let speaker: Speaker | undefined;
    
    if (this.conferenceMode && speakerId !== undefined) {
      // Determine if this is the caller or owner
      if (this.callerSpeakerId === undefined) {
        // First speaker is assumed to be the caller
        this.callerSpeakerId = speakerId;
        speaker = Speaker.CALLER;
        console.log(`[Conversation] Caller identified as Speaker ${speakerId}`);
      } else if (speakerId === this.callerSpeakerId) {
        speaker = Speaker.CALLER;
      } else {
        // Different speaker must be the owner
        if (this.ownerSpeakerId === undefined) {
          this.ownerSpeakerId = speakerId;
          console.log(`[Conversation] Owner identified as Speaker ${speakerId}`);
        }
        speaker = Speaker.OWNER;
      }
    }

    const message: SpeakerMessage = {
      role: "user",
      content,
      speaker,
      speakerId
    };

    this.messages.push(message);
    
    const speakerLabel = speaker ? `[${speaker}]` : '';
    console.log(`[Conversation] User${speakerLabel}: ${content}`);
  }

  /**
   * Start tracking an assistant message being generated
   */
  public startAssistantMessage(): void {
    this.currentAssistantMessage = "";
  }

  /**
   * Append to the current assistant message
   */
  public appendToAssistantMessage(chunk: string): void {
    this.currentAssistantMessage += chunk;
  }

  /**
   * Complete the assistant message and add to history
   */
  public completeAssistantMessage(): void {
    if (this.currentAssistantMessage) {
      this.messages.push({
        role: "assistant",
        content: this.currentAssistantMessage
      });
      console.log(`[Conversation] Assistant: ${this.currentAssistantMessage}`);
      this.currentAssistantMessage = "";
    }
  }

  /**
   * Handle interruption - save partial message if significant
   */
  public handleInterruption(): void {
    // Only save if we've generated a meaningful response
    if (this.currentAssistantMessage && this.currentAssistantMessage.length > 10) {
      this.messages.push({
        role: "assistant",
        content: this.currentAssistantMessage + " [interrupted]"
      });
      console.log(`[Conversation] Assistant (interrupted): ${this.currentAssistantMessage}`);
    }
    this.currentAssistantMessage = "";
  }

  /**
   * Get all messages for LLM prompt
   * Formats messages with speaker labels when in conference mode
   */
  public getMessages(): ModelMessage[] {
    if (!this.conferenceMode) {
      // Cast is safe since we only use 'user' and 'assistant' roles
      return [...this.messages] as ModelMessage[];
    }

    // In conference mode, add speaker labels to content
    return this.messages.map(msg => {
      const speakerMsg = msg as SpeakerMessage;
      if (speakerMsg.speaker && speakerMsg.role === "user") {
        return {
          role: "user" as const,
          content: `[${speakerMsg.speaker.toUpperCase()}]: ${msg.content}`
        };
      }
      return {
        role: msg.role as "user" | "assistant",
        content: msg.content
      };
    }) as ModelMessage[];
  }

  /**
   * Get the last message's speaker
   */
  public getLastSpeaker(): Speaker | undefined {
    if (this.messages.length === 0) return undefined;
    const lastMsg = this.messages[this.messages.length - 1] as SpeakerMessage;
    return lastMsg.speaker;
  }

  /**
   * Get current partial message
   */
  public getCurrentMessage(): string {
    return this.currentAssistantMessage;
  }

  /**
   * Clear all conversation history
   */
  public clear(): void {
    this.messages = [];
    this.currentAssistantMessage = "";
    this.callerSpeakerId = undefined;
    this.ownerSpeakerId = undefined;
  }

  /**
   * Get conversation length
   */
  public length(): number {
    return this.messages.length;
  }
}
