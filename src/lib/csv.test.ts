import { describe, expect, it } from "vitest";
import { rowToCard } from "./csv";

describe("rowToCard", () => {
  it("maps a full row", () => {
    const card = rowToCard({
      text: " serendipity ",
      meaning: "우연한 행운",
      type: "word",
      tags: "명사|고급",
      phonetic: "/ˌserənˈdipəti/",
      example: "What serendipity!",
    });
    expect(card).toEqual({
      text: "serendipity",
      meaning: "우연한 행운",
      cardType: "word",
      tags: ["명사", "고급"],
      phonetic: "/ˌserənˈdipəti/",
      example: "What serendipity!",
    });
  });

  it("accepts legacy front/back headers", () => {
    const card = rowToCard({ front: "hello", back: "안녕" });
    expect(card?.text).toBe("hello");
    expect(card?.meaning).toBe("안녕");
  });

  it("rejects rows missing text or meaning", () => {
    expect(rowToCard({ text: "hello" })).toBeNull();
    expect(rowToCard({ meaning: "뜻" })).toBeNull();
    expect(rowToCard({ text: "  ", meaning: "뜻" })).toBeNull();
  });

  it("defaults invalid type to word and handles empty tags", () => {
    const card = rowToCard({ text: "hit the sack", meaning: "자다", type: "PHRASE" });
    expect(card?.cardType).toBe("word");
    expect(card?.tags).toEqual([]);
    expect(card?.phonetic).toBeNull();
  });

  it("accepts idiom/sentence/concept types case-insensitively", () => {
    expect(rowToCard({ text: "a", meaning: "b", type: "Idiom" })?.cardType).toBe(
      "idiom",
    );
    expect(rowToCard({ text: "a", meaning: "b", type: "sentence" })?.cardType).toBe(
      "sentence",
    );
    expect(rowToCard({ text: "a", meaning: "b", type: "Concept" })?.cardType).toBe(
      "concept",
    );
  });
});
