import { describe, expect, it } from "vitest";
import { mapEntries } from "./dictionary";

describe("mapEntries", () => {
  it("maps phonetic, definitions and example", () => {
    const entry = mapEntries([
      {
        phonetics: [{ text: undefined }, { text: "/həˈloʊ/" }],
        meanings: [
          {
            partOfSpeech: "noun",
            definitions: [{ definition: "a greeting", example: "she gave a hello" }],
          },
          {
            partOfSpeech: "verb",
            definitions: [{ definition: "to say hello" }],
          },
        ],
      },
    ]);
    expect(entry.phonetic).toBe("/həˈloʊ/");
    expect(entry.definition).toBe("(noun) a greeting\n(verb) to say hello");
    expect(entry.example).toBe("she gave a hello");
  });

  it("prefers top-level phonetic and caps at two meanings", () => {
    const entry = mapEntries([
      {
        phonetic: "/tɛst/",
        meanings: [
          { partOfSpeech: "noun", definitions: [{ definition: "d1" }] },
          { partOfSpeech: "verb", definitions: [{ definition: "d2" }] },
          { partOfSpeech: "adjective", definitions: [{ definition: "d3" }] },
        ],
      },
    ]);
    expect(entry.phonetic).toBe("/tɛst/");
    expect(entry.definition).toBe("(noun) d1\n(verb) d2");
  });

  it("handles empty responses", () => {
    const entry = mapEntries([]);
    expect(entry).toEqual({ phonetic: null, definition: null, example: null });
  });
});
