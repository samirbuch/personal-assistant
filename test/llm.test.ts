import { anthropic } from "@ai-sdk/anthropic";
import { describe, test, expect } from "@jest/globals";
import { generateText, streamText } from "ai";

// Required .env key: ANTHROPIC_API_KEY

describe("Test LLM and tooling", () => {

  test("LLM should respond", async () => {
    const { text } = await generateText({
      model: anthropic("claude-3-5-haiku-latest"),
      prompt: "Hi Claude! What's new?"
    });

    console.log("Generated text:", text);

    expect(text).not.toBeNull();
  });

  test("LLM should stream text", async () => {
    const obj = await streamText({
      model: anthropic("claude-3-5-haiku-latest"),
      prompt: "Hi Claude! Can you stream some text for me?"
    });

    console.log("Streamed obj:", obj);

    for await (const token of obj.textStream) {
      console.log(token);
    }

    expect(obj).not.toBeNull();
  })
})