import { describe, expect, it } from "vitest";
import { rowToCard } from "./csv";

describe("rowToCard", () => {
  it("maps a full row", () => {
    const card = rowToCard({
      front: " serendipity ",
      back: "우연한 행운",
      type: "word",
      tags: "명사|고급",
      phonetic: "/ˌserənˈdipəti/",
      example: "What serendipity!",
    });
    expect(card).toEqual({
      frontText: "serendipity",
      backText: "우연한 행운",
      cardType: "word",
      tags: ["명사", "고급"],
      phonetic: "/ˌserənˈdipəti/",
      example: "What serendipity!",
    });
  });

  it("rejects rows missing front or back", () => {
    expect(rowToCard({ front: "hello" })).toBeNull();
    expect(rowToCard({ back: "뜻" })).toBeNull();
    expect(rowToCard({ front: "  ", back: "뜻" })).toBeNull();
  });

  it("defaults invalid type to word and handles empty tags", () => {
    const card = rowToCard({ front: "hit the sack", back: "자다", type: "PHRASE" });
    expect(card?.cardType).toBe("word");
    expect(card?.tags).toEqual([]);
    expect(card?.phonetic).toBeNull();
  });

  it("accepts idiom/sentence types case-insensitively", () => {
    expect(rowToCard({ front: "a", back: "b", type: "Idiom" })?.cardType).toBe("idiom");
    expect(rowToCard({ front: "a", back: "b", type: "sentence" })?.cardType).toBe(
      "sentence",
    );
  });
});
