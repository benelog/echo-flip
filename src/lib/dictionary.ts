// Free Dictionary API (api.dictionaryapi.dev): no key, CORS-enabled.

export interface DictEntry {
  phonetic: string | null;
  definition: string | null;
  example: string | null;
}

interface ApiDefinition {
  definition: string;
  example?: string;
}

interface ApiMeaning {
  partOfSpeech: string;
  definitions: ApiDefinition[];
}

interface ApiEntry {
  phonetic?: string;
  phonetics?: { text?: string }[];
  meanings?: ApiMeaning[];
}

export class WordNotFoundError extends Error {}

export function mapEntries(entries: ApiEntry[]): DictEntry {
  const first = entries[0] ?? {};
  const phonetic =
    first.phonetic ||
    first.phonetics?.map((p) => p.text).find(Boolean) ||
    null;

  const lines: string[] = [];
  let example: string | null = null;
  for (const meaning of first.meanings ?? []) {
    for (const def of meaning.definitions.slice(0, 1)) {
      lines.push(`(${meaning.partOfSpeech}) ${def.definition}`);
      if (!example && def.example) example = def.example;
    }
    if (lines.length >= 2) break;
  }
  return { phonetic, definition: lines.length ? lines.join("\n") : null, example };
}

export async function lookupWord(word: string): Promise<DictEntry> {
  const res = await fetch(
    `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word.trim())}`,
  );
  if (res.status === 404) throw new WordNotFoundError(word);
  if (!res.ok) throw new Error(`사전 조회 실패 (${res.status})`);
  return mapEntries(await res.json());
}
