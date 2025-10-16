import { anthropic } from "@ai-sdk/anthropic";
import { describe, test, expect } from "@jest/globals";
import { generateText, streamText, tool, Experimental_Agent as Agent, stepCountIs } from "ai";
import { z } from "zod";

// Required .env key: ANTHROPIC_API_KEY

describe("Test LLM calls", () => {
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
  });
});

describe("LLMs should correctly call tools", () => {
  const tools = {
    fahrenheitToCelsius: tool({
      description: "Convert Fahrenheit to Celsius",
      inputSchema: z.object({
        temperature: z.number().describe("Temperature in Fahrenheit")
      }),
      execute: async ({ temperature }) => {
        console.log("Converting F -> C tool call!");
        const celsius = Math.round((temperature - 32) * (5 / 9));
        return { celsius }
      }
    }),
    celsiusToFahrenheit: tool({
      description: "Convert Celsius to Fahrenheit",
      inputSchema: z.object({
        temperature: z.number().describe("Temperature in Celsius")
      }),
      execute: async ({ temperature }) => {
        console.log("Converting C -> F tool call!");
        const fahrenheit = Math.round((temperature * (9 / 5)) + 32);
        return { fahrenheit };
      }
    })
  };

  const testAgent = new Agent({
    model: anthropic("claude-3-5-haiku-latest"),
    tools,
    system: "You are an agent designed specifically to help users convert between Celsius and Fahrenheit. Please ensure your responses are short and contain only the necessary information. Do not ask follow-up questions if the user did not indicate they need more information beyond what was initially prompted.",
    stopWhen: stepCountIs(5)
  });

  test("Should correctly call C->F tool", async () => {
    const result = await testAgent.generate({
      prompt: "Hello! Can you convert 0ºC to Fahrenheit for me please?"
    });

    console.log("Result:", result.text);
    // console.log("Steps:", result.steps);
    // console.log(result);

    // expect(result.text).not.toBeNull();
  }, 15 * 1000)

  test("Should correctly call F->C tool", async () => {
    const result = await testAgent.generate({
      prompt: "Hello! Can you convert 0ºF to Celsius for me please?",
    });

    console.log("Result:", result.text);
    // console.log("Steps:", result.steps);
    // console.log(result);

    // expect(text).not.toBeNull();
  }, 15 * 1000)
})