import { describe, expect, it } from "vitest";
import { rowToCard } from "./csv";

describe("rowToCard", () => {
  it("maps a full row", () => {
    const card = rowToCard({
      side_a: " serendipity ",
      side_b: "우연한 행운",
      type: "word",
      tags: "명사|고급",
      phonetic: "/ˌserənˈdipəti/",
      example: "What serendipity!",
    });
    expect(card).toEqual({
      sideAText: "serendipity",
      sideBText: "우연한 행운",
      cardType: "word",
      tags: ["명사", "고급"],
      phonetic: "/ˌserənˈdipəti/",
      example: "What serendipity!",
    });
  });

  it("accepts legacy front/back headers", () => {
    const card = rowToCard({ front: "hello", back: "안녕" });
    expect(card?.sideAText).toBe("hello");
    expect(card?.sideBText).toBe("안녕");
  });

  it("rejects rows missing side_a or side_b", () => {
    expect(rowToCard({ side_a: "hello" })).toBeNull();
    expect(rowToCard({ side_b: "뜻" })).toBeNull();
    expect(rowToCard({ side_a: "  ", side_b: "뜻" })).toBeNull();
  });

  it("defaults invalid type to word and handles empty tags", () => {
    const card = rowToCard({ side_a: "hit the sack", side_b: "자다", type: "PHRASE" });
    expect(card?.cardType).toBe("word");
    expect(card?.tags).toEqual([]);
    expect(card?.phonetic).toBeNull();
  });

  it("accepts idiom/sentence/concept types case-insensitively", () => {
    expect(rowToCard({ side_a: "a", side_b: "b", type: "Idiom" })?.cardType).toBe(
      "idiom",
    );
    expect(rowToCard({ side_a: "a", side_b: "b", type: "sentence" })?.cardType).toBe(
      "sentence",
    );
    expect(rowToCard({ side_a: "a", side_b: "b", type: "Concept" })?.cardType).toBe(
      "concept",
    );
  });
});
