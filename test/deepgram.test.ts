import { describe, test, expect, beforeAll } from "@jest/globals";
import { createClient, DeepgramClient, LiveTranscriptionEvents, LiveTTSEvents, SpeakLiveClient } from "@deepgram/sdk";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

describe("Deepgram TTS tests", () => {
  let deepgramClient: DeepgramClient;
  let deepgramTTS: SpeakLiveClient;

  beforeAll(async () => {
    deepgramClient = createClient(process.env.DEEPGRAM_ACCESS_TOKEN);

    deepgramTTS = deepgramClient.speak.live({
      model: "aura-2-thalia-en",
      encoding: "mulaw",
      sample_rate: 8000
    });
  });

  test("TTS functions with one batch call", async () => {
    await new Promise<void>((resolve, reject) => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const outputPath = join(__dirname, "out", "batch-tts.raw");

      const writeStream = createWriteStream(outputPath);

      deepgramTTS.on(LiveTTSEvents.Open, () => {
        console.log("Deepgram TTS ready");

        deepgramTTS.on(LiveTTSEvents.Audio, (audio) => {
          console.log("AUDIO!", audio.byteLength, "bytes");
          writeStream.write(audio);
        });

        deepgramTTS.on(LiveTTSEvents.Flushed, () => {
          console.log("Flushed! Closing stream...");
          writeStream.end(() => {
            console.log("Stream closed");
            resolve();
          });
        });

        deepgramTTS.on(LiveTTSEvents.Error, (error) => {
          console.error("TTS Error:", error);
          writeStream.end();
          reject(error);
        });

        deepgramTTS.sendText("The quick brown fox jumped over the lazy orange cat.");
        deepgramTTS.flush();
      });
    })
  }, 30 * 1000);

  test("TTS functions with stream of text", async () => {
    await new Promise<void>((resolve, reject) => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const outputPath = join(__dirname, "out", "stream-tts.raw");

      const writeStream = createWriteStream(outputPath);

      deepgramTTS.on(LiveTTSEvents.Open, async () => {
        console.log("Deepgram TTS ready");

        deepgramTTS.on(LiveTTSEvents.Audio, (audio) => {
          console.log(`[${new Date().toISOString()}] AUDIO! ${audio.byteLength} bytes`);
          writeStream.write(audio);
        });

        deepgramTTS.on(LiveTTSEvents.Flushed, () => {
          console.log("Flushed! Closing stream...");
          writeStream.end(() => {
            console.log("Stream closed");
            resolve();
          });
        });

        deepgramTTS.on(LiveTTSEvents.Error, (error) => {
          console.error("TTS Error:", error);
          writeStream.end();
          reject(error);
        });

        // Stream text in chunks with delays - longer text to see interleaved audio
        const fullText = `In the heart of a bustling metropolis, where skyscrapers pierce the clouds and the streets hum with endless activity, there lived a curious young inventor named Elena. She spent her days tinkering with gadgets and machines, dreaming of creating something that would change the world. One fateful evening, while working late in her cluttered workshop, she stumbled upon an ancient blueprint hidden beneath a pile of old documents. The blueprint detailed a mysterious device that could harness energy from sound waves. Intrigued and excited, Elena dedicated herself to bringing this forgotten invention to life. Weeks turned into months as she labored tirelessly, overcoming countless obstacles and setbacks along the way. Finally, on a crisp autumn morning, her creation whirred to life for the first time, filling the workshop with a gentle, harmonious hum that seemed to resonate with the very essence of possibility.`;

        const words = fullText.split(" ");
        const textChunks = words.map(word => word + " ");

        for (let i = 0; i < textChunks.length; i++) {
          const chunk = textChunks[i];
          if (!chunk) continue;

          console.log(`[${new Date().toISOString()}] Sending chunk ${i + 1}/${textChunks.length}: "${chunk.trim()}"`);
          deepgramTTS.sendText(chunk);
          // Small delay between words to simulate streaming
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Only flush after all chunks are sent
        deepgramTTS.flush();
      });
    })
  }, 30 * 1000)

})