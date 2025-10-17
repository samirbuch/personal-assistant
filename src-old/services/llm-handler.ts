import { anthropic } from "@ai-sdk/anthropic";
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import type { CallSession } from "../types/CallSession";
import ResettableAbortController from "../util/ResettableAbortController";

const tools = {};

export function createAgent(abortController: ResettableAbortController): Agent<{}, never, never> {
  return new Agent({
    model: anthropic("claude-3-5-haiku-latest"),
    system: `
    You are a helpful personal assistant named Jordan. You work for your client, Samir Buch. A server is sending your responses over a phone call to wherever it is Samir needs an appointment. Chances are, the person on the other end of the call will want to help Samir. It should be made clear that it's not necessarily your goal to help the person on the phone call, more so it's your goal to help Samir book an appointment with them.

    Samir uses he/him or they/them pronouns.
    
    Do not give out the following informaton unless requested: his phone number is 267-625-3752, and his preferred email is samirjbuch@gmail.com.
    Please note that your responses will be converted into audio, so take extra care to: spell out numbers, and avoid using punctuation that doesn't translate well into speech (including but not limited to slashes, brackets, braces, parentheses, or bullet points).
    Please keep all responses very brief.
    `,
    tools,
    stopWhen: stepCountIs(20),
    abortSignal: abortController.signal
  });
}

export async function streamLLMResponse(
  session: CallSession,
  streamSid: string
): Promise<void> {
  console.log(`[${streamSid}] 🎙️ Starting LLM response stream`);
  
  session.isStreaming = true;
  session.currentAssistantMessage = "";
  
  // Emit events to open the audio gate
  session.events.emitStreamStart();
  session.events.emitAudioGateOpen();
  
  console.log(`[${streamSid}] Audio gate should be open, current state: ${session.audioGateOpen}`);

  try {
    const result = session.agent.stream({
      prompt: session.conversation
    });

    let fullText = "";
    
    for await (const chunk of result.textStream) {
      // Check if we were interrupted during streaming
      if (!session.isStreaming) {
        console.log(`[${streamSid}] Stream cancelled mid-generation`);
        break;
      }
      session.deepgramTTS.sendText(chunk);
      fullText += chunk;
      session.currentAssistantMessage = fullText;
    }

    // Only flush and save if we completed without interruption
    if (session.isStreaming) {
      session.deepgramTTS.flush();
      session.isStreaming = false;
      session.conversation.push({
        role: "assistant",
        content: fullText
      });
      session.currentAssistantMessage = "";
      
      console.log(`[${streamSid}] ✅ Stream completed, closing gate`);
      
      // Emit stream end and close gate
      session.events.emitStreamEnd();
      session.events.emitAudioGateClose();
    }
  } catch (error: any) {
    if (error.name === 'AbortError' || error.message?.includes('interrupted')) {
      console.log(`[${streamSid}] ⚠️ LLM stream aborted (interrupted)`);
    } else {
      console.error(`[${streamSid}] ❌ Error in LLM stream:`, error);
    }
    session.isStreaming = false;
    session.currentAssistantMessage = "";
    session.events.emitStreamEnd();
    session.events.emitAudioGateClose();
  }
}
