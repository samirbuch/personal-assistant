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
      system: `You are a gatekeeper that determines when an AI assistant named "Jordan" should speak in a 3-way conference call.

The conference includes:
- CALLER: The person who originally called (e.g., a barbershop, business, etc.)
- OWNER: The human owner (Samir) who was brought into the call
- ASSISTANT: An AI assistant named Jordan (you are deciding if Jordan should speak)

Rules for when Jordan SHOULD respond:
1. When the CALLER or OWNER directly addresses "Jordan" by name
2. When someone asks Jordan a question or requests Jordan's help
3. When there's a clear expectation for Jordan to provide information (calendar, scheduling, etc.)
4. When asked to perform a task (like checking calendar, making calls, etc.)
5. When the CALLER asks "what times were available?" or similar questions Jordan would know

Rules for when Jordan should NOT respond:
1. When CALLER and OWNER are having a conversation with each other
2. When the OWNER is addressing the CALLER directly
3. When the conversation is clearly between two humans
4. When someone just acknowledged something or said "okay", "thanks", etc. to the other human
5. When generic greetings are exchanged between CALLER and OWNER (unless Jordan is explicitly included)

The last speaker was: ${lastSpeaker.toUpperCase()}

Analyze the conversation and decide if Jordan (the assistant) should respond.`,
      prompt: `Recent conversation:\n${conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n')}\n\nShould Jordan respond?`
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
