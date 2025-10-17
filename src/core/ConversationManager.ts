/**
 * Conversation Manager
 * 
 * Manages conversation history with support for partial responses
 * and interruptions.
 */

import type { ModelMessage } from "ai";

export class ConversationManager {
  private messages: ModelMessage[] = [];
  private currentAssistantMessage: string = "";

  /**
   * Add a user message to the conversation
   */
  public addUserMessage(content: string): void {
    this.messages.push({
      role: "user",
      content
    });
    console.log(`[Conversation] User: ${content}`);
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
   */
  public getMessages(): ModelMessage[] {
    return [...this.messages];
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
  }

  /**
   * Get conversation length
   */
  public length(): number {
    return this.messages.length;
  }
}
