/**
 * Response Gatekeeper
 * 
 * Analyzes conversation context in conference mode to determine
 * if the AI assistant should respond to the current utterance.
 */

import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { ModelMessage } from "ai";

const responseDecisionSchema = z.object({
  shouldRespond: z.boolean().describe("Whether the AI assistant should respond to this message"),
  reasoning: z.string().describe("Brief explanation of the decision"),
  confidence: z.number().min(0).max(1).describe("Confidence level (0-1) in this decision")
});

export type ResponseDecision = z.infer<typeof responseDecisionSchema>;

/**
 * Analyze whether the assistant should respond in a conference call
 * @param conversationHistory Recent conversation history with speaker labels
 * @param lastSpeaker Who spoke last (caller or owner)
 * @returns Decision on whether to respond
 */
export async function shouldAssistantRespond(
  conversationHistory: ModelMessage[],
  lastSpeaker: "caller" | "owner"
): Promise<ResponseDecision> {
  try {
    const { object } = await generateObject({
      model: anthropic("claude-3-5-haiku-latest"),
      schema: responseDecisionSchema,
      system: `You are a gatekeeper that determines when an AI assistant should speak in a 3-way conference call.

The conference includes:
- CALLER: The person who originally called
- OWNER: The human owner who was brought into the call
- ASSISTANT: An AI assistant (you are deciding if IT should speak)

Rules for when the assistant SHOULD respond:
1. When the CALLER is directly asking the assistant a question
2. When the OWNER explicitly asks the assistant to help or respond
3. When there's a clear expectation for the assistant to provide information it has access to
4. When asked to perform a task (like checking calendar, making calls, etc.)

Rules for when the assistant should NOT respond:
1. When CALLER and OWNER are having a conversation with each other
2. When the OWNER is addressing the CALLER directly
3. When the conversation is clearly between two humans
4. When someone just acknowledged something or said "okay", "thanks", etc. to the other human

The last speaker was: ${lastSpeaker.toUpperCase()}

Analyze the conversation and decide if the assistant should respond.`,
      prompt: `Recent conversation:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nShould the assistant respond?`
    });

    console.log(`[Gatekeeper] Decision: ${object.shouldRespond ? 'RESPOND' : 'SILENT'} (confidence: ${object.confidence}) - ${object.reasoning}`);
    
    return object;
  } catch (error) {
    console.error(`[Gatekeeper] Error making decision:`, error);
    // Default to not responding if there's an error (safer in conference mode)
    return {
      shouldRespond: false,
      reasoning: "Error in decision-making, defaulting to silent",
      confidence: 0
    };
  }
}
