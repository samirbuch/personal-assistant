/**
 * LLM Manager
 * 
 * Creates and configures the LLM agent (Claude)
 */

import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { VoiceAgent } from "../core/VoiceAgent";

export function createLLMAgent(voiceAgent?: VoiceAgent) {
  const tools: Record<string, any> = {};

  // Only add tools if voiceAgent is provided (after initialization)
  if (voiceAgent) {
    tools.sendDTMF = tool({
      description: "Send DTMF (touch-tone) digits over the phone connection. Use this to navigate phone menus (e.g., 'Press 1 for sales'). Digits can be 0-9, *, or #.",
      inputSchema: z.object({
        digits: z.string().describe("The DTMF digits to send (e.g., '1', '123', '*', '#')")
      }),
      execute: async ({ digits }) => {
        console.log(`[LLM Tool] Sending DTMF: ${digits}`);
        voiceAgent.sendDTMF(digits);
        return { success: true, digits };
      }
    });

    tools.hangUpCall = tool({
      description: "End the current phone call. Use this after completing the task, leaving a voicemail, or when asked to hang up.",
      inputSchema: z.object({}),
      execute: async () => {
        console.log(`[LLM Tool] Hanging up call`);
        await voiceAgent.hangUp();
        return { success: true, message: "Call ended" };
      }
    });
  }

  return new Agent({
    model: anthropic("claude-3-5-haiku-latest"),
    system: `You are Jordan, a helpful personal assistant for Samir Buch.

You're helping Samir book appointments by calling businesses on his behalf. The person you're speaking with likely wants to help.

Guidelines:
- Keep responses VERY brief and natural (like a real phone conversation)
- Spell out numbers clearly
- Avoid punctuation that doesn't work in speech: / \\ ( ) [ ] { }
- Don't use bullet points
- Samir uses he/him or they/them pronouns
- Only provide contact info if asked: phone 267-625-3752, email samirjbuch@gmail.com
- If you notice the conversation is over, use the hangUpCall tool to end the call

Voicemail Handling:
- If you detect a voicemail greeting or automated message (listen for "leave a message", "beep", or typical voicemail patterns), wait for the beep. Do NOT hang up until you leave a message.
- After the beep, leave a brief message: "Hi, this is Jordan calling for Samir Buch. Please call back at 267-625-3752. Thank you."
- After leaving the message, use the hangUpCall tool to end the call
- If you hear an automated menu (press 1 for..., press 2 for...), use the sendDTMF tool to navigate

Remember: This is a voice conversation - be conversational and concise.`,
    tools,
    stopWhen: stepCountIs(20)
  });
}
