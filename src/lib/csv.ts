import Papa from "papaparse";
import type { CardInput, CardType } from "./types";

const TYPES: CardType[] = ["word", "sentence", "idiom", "concept"];

export interface CsvParseResult {
  cards: CardInput[];
  invalid: number;
}

interface CsvRow {
  side_a?: string;
  side_b?: string;
  // Legacy headers from decks exported before the side A/B rename.
  front?: string;
  back?: string;
  type?: string;
  tags?: string;
  phonetic?: string;
  example?: string;
}

/** Maps one parsed CSV row to a card; null when required fields are missing. */
export function rowToCard(row: CsvRow): CardInput | null {
  const sideA = (row.side_a ?? row.front)?.trim();
  const sideB = (row.side_b ?? row.back)?.trim();
  if (!sideA || !sideB) return null;
  const type = row.type?.trim().toLowerCase() as CardType;
  return {
    sideAText: sideA,
    sideBText: sideB,
    cardType: TYPES.includes(type) ? type : "word",
    tags:
      row.tags
        ?.split("|")
        .map((t) => t.trim())
        .filter(Boolean) ?? [],
    phonetic: row.phonetic?.trim() || null,
    example: row.example?.trim() || null,
  };
}

export function parseCsv(file: File): Promise<CsvParseResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        const cards: CardInput[] = [];
        let invalid = 0;
        for (const row of result.data) {
          const card = rowToCard(row);
          if (card) cards.push(card);
          else invalid++;
        }
        resolve({ cards, invalid });
      },
      error: reject,
    });
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
