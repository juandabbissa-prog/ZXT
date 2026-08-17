export const normalizeIntentText = (value: string): string =>
  value.normalize('NFKC').normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();

export const segmentIntentClauses = (value: string): readonly string[] =>
  normalizeIntentText(value)
    .split(/[。！？!?；;\n]+/u)
    .map((clause) => clause.trim())
    .filter(Boolean);
