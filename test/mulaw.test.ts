import { describe, test, expect, beforeAll } from "@jest/globals";
import { readFile, writeFile } from "node:fs/promises";
import { mulaw } from "alawmulaw";

// describe() groups tests together
// test() is the individual test

describe("µlaw Encoding/Decoding", () => {
  let knownMulaw: Uint8Array;
  let known16pcm: Int16Array

  beforeAll(async () => {
    const mulawPath = new URL("./assets/fl-mulaw.raw", import.meta.url);
    const fmu = await readFile(mulawPath, { flag: "r" });
    const uint8arr = new Uint8Array(fmu);
    // console.log(path, f, uint8arr);
    knownMulaw = uint8arr;

    const s16path = new URL("./assets/fl-16pcm.raw", import.meta.url);
    const fs16 = await readFile(s16path, { flag: "r" });
    const s16arr = new Int16Array(fs16.buffer, fs16.byteOffset, fs16.byteLength / 2);
    known16pcm = s16arr;
  });

  test("lib should decode file", async () => {
    // Decodes into signed 16-bit PCM samples, 8000hz
    const decoded = mulaw.decode(knownMulaw);
    // console.log(int16arr);
    expect(decoded).toEqual(known16pcm);

    const path = new URL("./out/fl-16pcm.raw", import.meta.url);
    await writeFile(path, decoded, { flag: "w+" });
  });

  test("lib should correctly encode decoded file", async () => {
    // signed 16-bit PCM, 8000hz
    // Re-encode the file back into mulaw.
    const encoded = mulaw.encode(known16pcm);
    expect<Uint8Array>(encoded).toEqual(knownMulaw);

    // Write it for our testing
    const encodedPath = new URL("./out/fl-mulaw-reenc.raw", import.meta.url);
    await writeFile(encodedPath, encoded, { flag: "w+" });
  })
})