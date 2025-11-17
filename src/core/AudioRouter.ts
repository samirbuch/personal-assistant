/**
 * Audio Router
 * 
 * Decides when Jordan (the AI) should participate in a conference call.
 * Raw audio routing happens automatically at the VoiceAgent level.
 */

import { shouldAssistantRespond } from "../managers/ResponseGatekeeper";
import type { ModelMessage } from "ai";
import { Speaker } from "./ConversationManager";

export interface AudioRoutingDecision {
  jordanShouldRespond: boolean;
  reasoning: string;
}

export class AudioRouter {
  /**
   * Decide if Jordan should respond when someone speaks
   * 
   * @param speaker Who spoke (CALLER or OWNER)
   * @param transcript What they said
   * @param conversationHistory Full conversation context for ResponseGatekeeper
   * @returns Decision on whether Jordan should speak
   */
  async route(
    speaker: Speaker.CALLER | Speaker.OWNER,
    transcript: string,
    conversationHistory: ModelMessage[]
  ): Promise<AudioRoutingDecision> {
    
    // Ask ResponseGatekeeper if Jordan should respond
    const gatekeeperDecision = await shouldAssistantRespond(
      conversationHistory,
      speaker === Speaker.CALLER ? "caller" : "owner"
    );
    
    const decision: AudioRoutingDecision = {
      jordanShouldRespond: gatekeeperDecision.shouldRespond,
      reasoning: gatekeeperDecision.reasoning
    };
    
    console.log(`[AudioRouter] ${speaker} spoke: "${transcript.slice(0, 50)}..."`);
    console.log(`[AudioRouter] Jordan responds: ${decision.jordanShouldRespond} (${decision.reasoning})`);
    
    return decision;
  }
}
