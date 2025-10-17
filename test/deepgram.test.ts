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

  test("Deepgram TTS functions", async () => {
    await new Promise<void>((resolve, reject) => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const outputPath = join(__dirname, "out", "hello-world.raw");

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
  }, 30 * 1000)

})