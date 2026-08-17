export const normalizeIntentText = (value: string): string =>
  value.normalize('NFKC').normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();

export const segmentIntentClauses = (value: string): readonly string[] =>
  normalizeIntentText(value)
    .split(/[。！？!?；;\n]+/u)
    .flatMap((sentence) =>
      sentence.split(/[，,](?=(?:但(?:是)?|不过|而(?:是)?|只是|可是|却|然而))/u),
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
