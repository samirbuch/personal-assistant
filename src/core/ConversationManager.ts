/**
 * Conversation Manager
 * 
 * Manages conversation history with support for partial responses,
 * interruptions, multi-speaker conversations (conference mode), and tool calls.
 */

import type { ModelMessage, AssistantModelMessage, ToolModelMessage } from "ai";

export enum Speaker {
  CALLER = "caller",
  OWNER = "owner",
  ASSISTANT = "assistant"
}

export class ConversationManager {
  private messages: ModelMessage[] = [];
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
   * @param speakerIdOrEnum Optional speaker ID from diarization OR Speaker enum
   */
  public addUserMessage(content: string, speakerIdOrEnum?: number | Speaker): void {
    let speaker: Speaker | undefined;
    let speakerId: number | undefined;
    
    // Handle Speaker enum directly (used by ConferenceSession)
    if (speakerIdOrEnum === Speaker.CALLER || speakerIdOrEnum === Speaker.OWNER) {
      speaker = speakerIdOrEnum;
      speakerId = undefined; // No diarization ID when speaker is explicitly known
    } 
    // Handle numeric speaker ID from diarization
    else if (this.conferenceMode && speakerIdOrEnum !== undefined) {
      speakerId = speakerIdOrEnum as number;
      
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

    // Format content with speaker label in conference mode
    const messageContent = (this.conferenceMode && speaker) 
      ? `[${speaker.toUpperCase()}]: ${content}`
      : content;

    const message: ModelMessage = {
      role: "user",
      content: messageContent
    };

    this.messages.push(message);
    
    const speakerLabel = speaker ? `[${speaker}]` : '';
    console.log(`[Conversation] User${speakerLabel}: ${content}`);
  }

  /**
   * Add a complete assistant message (with potential tool calls)
   * Used when we have the full response from the LLM
   */
  public addAssistantMessage(message: AssistantModelMessage): void {
    this.messages.push(message);
    
    // Log text content if available
    if (typeof message.content === 'string') {
      console.log(`[Conversation] Assistant: ${message.content}`);
    } else if (Array.isArray(message.content)) {
      const textParts = message.content.filter(part => part.type === 'text');
      const toolCalls = message.content.filter(part => part.type === 'tool-call');
      
      if (textParts.length > 0) {
        const text = textParts.map(p => 'text' in p ? p.text : '').join('');
        console.log(`[Conversation] Assistant: ${text}`);
      }
      
      if (toolCalls.length > 0) {
        console.log(`[Conversation] Assistant made ${toolCalls.length} tool call(s)`);
      }
    }
  }

  /**
   * Add tool results to conversation
   * Used after tools execute
   */
  public addToolResults(message: ToolModelMessage): void {
    this.messages.push(message);
    console.log(`[Conversation] Tool results: ${message.content.length} result(s)`);
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
      const message: ModelMessage = {
        role: "assistant",
        content: this.currentAssistantMessage
      };
      this.messages.push(message);
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
      const message: ModelMessage = {
        role: "assistant",
        content: this.currentAssistantMessage + " [interrupted]"
      };
      this.messages.push(message);
      console.log(`[Conversation] Assistant (interrupted): ${this.currentAssistantMessage}`);
    }
    this.currentAssistantMessage = "";
  }

  /**
   * Get all messages for LLM prompt
   */
  public getMessages(): ModelMessage[] {
    return [...this.messages];
  }

  /**
   * Get the last message's speaker (for conference mode)
   */
  public getLastSpeaker(): Speaker | undefined {
    if (this.messages.length === 0) return undefined;
    
    const lastMsg = this.messages[this.messages.length - 1];
    if (!lastMsg || lastMsg.role !== "user") return undefined;
    
    // Extract speaker from [CALLER]: or [OWNER]: prefix
    const content = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    if (content.startsWith('[CALLER]:')) return Speaker.CALLER;
    if (content.startsWith('[OWNER]:')) return Speaker.OWNER;
    
    return undefined;
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
