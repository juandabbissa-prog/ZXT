import { describe, expect, test } from 'vitest';
import { deflateSync, strToU8, zipSync } from 'fflate';
import {
  COZE_PROVENANCE_NOTICE,
  DOCX_EXTRACTION_VERSION,
  MAX_DOCUMENT_XML_BYTES,
  MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES,
  MAX_SOURCE_ARTIFACT_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  checksumSourceArtifact,
  compileSeedCorpus,
  convertSeedSourceArtifact,
  seedSourceIntakeResultSchema,
  type SeedSourceIntakeMetadata,
} from '../src/real-estate-intent-seed';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const ROOT_RELS =
  '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const FIXED_MTIME = new Date('1980-01-01T00:00:00.000Z');

const xmlEscape = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const paragraph = (...runs: string[]): string =>
  `<w:p>${runs.map((run) => `<w:r><w:t xml:space="preserve">${xmlEscape(run)}</w:t></w:r>`).join('')}</w:p>`;

const documentXml = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}" xmlns:xml="${XML_NS}"><w:body>${body}<w:sectPr/></w:body></w:document>`;

type ExtraEntries = Record<string, Uint8Array>;

const makeDocx = (body: string, extra: ExtraEntries = {}): Uint8Array =>
  zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(ROOT_RELS),
      'word/document.xml': strToU8(documentXml(body)),
      ...extra,
    },
    { level: 6, mtime: FIXED_MTIME },
  );

const metadata = (bytes: Uint8Array): SeedSourceIntakeMetadata => ({
  sourceArtifactId: 'synthetic-docx-v1',
  sourceArtifactFilename: 'synthetic.docx',
  declaredSourceFormat: 'DOCX',
  declaredSourceEncoding: null,
  expectedSourceArtifactSha256: checksumSourceArtifact(bytes),
  generationMethod: 'TEST_FIXTURE',
  contentOrigin: 'AI_GENERATED',
  sourceReference: null,
  userProvided: true,
  receivedAt: '2026-08-20T00:00:00.000Z',
  personalDataDeclaration: 'NO_PERSONAL_OR_PRIVATE_DATA',
  repositoryStoragePermission: true,
  market: 'CN-LN-DALIAN',
  compilerMarket: 'dalian-real-estate',
  locale: 'zh-CN',
  corpusId: 'synthetic-docx-intake',
  corpusVersion: '1.0.0',
  normalizationVersion: '1.0.0',
});

const convert = (bytes: Uint8Array, overrides: Partial<SeedSourceIntakeMetadata> = {}) =>
  convertSeedSourceArtifact({ sourceBytes: bytes, metadata: { ...metadata(bytes), ...overrides } });

const validBody = (...seedParagraphs: string[]): string =>
  `${seedParagraphs.join('')}${paragraph(COZE_PROVENANCE_NOTICE)}`;

const expectFailure = (result: ReturnType<typeof convert>, errorCode: string): void => {
  expect(result).toMatchObject({ status: 'FAILURE', errorCode });
  expect(result).not.toHaveProperty('corpus');
  expect(result).not.toHaveProperty('manifest');
};

const patchAllAscii = (bytes: Uint8Array, from: string, to: string): Uint8Array => {
  expect(from.length).toBe(to.length);
  const result = bytes.slice();
  const needle = strToU8(from);
  const replacement = strToU8(to);
  for (let offset = 0; offset <= result.length - needle.length; offset += 1) {
    if (needle.every((value, index) => result[offset + index] === value)) {
      result.set(replacement, offset);
      offset += needle.length - 1;
    }
  }
  return result;
};

const markFirstEntryEncrypted = (bytes: Uint8Array): Uint8Array => {
  const result = bytes.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  for (let offset = 0; offset <= result.length - 4; offset += 1) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50)
      view.setUint16(offset + 6, view.getUint16(offset + 6, true) | 1, true);
    if (signature === 0x02014b50)
      view.setUint16(offset + 8, view.getUint16(offset + 8, true) | 1, true);
  }
  return result;
};

const mutateZipHeaders = (
  bytes: Uint8Array,
  name: string,
  mutate: (view: DataView, offset: number, central: boolean) => void,
): Uint8Array => {
  const result = bytes.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  const needle = strToU8(name);
  for (let offset = 0; offset <= result.length - needle.length; offset += 1) {
    if (!needle.every((value, index) => result[offset + index] === value)) continue;
    const localOffset = offset - 30;
    const centralOffset = offset - 46;
    if (localOffset >= 0 && view.getUint32(localOffset, true) === 0x04034b50)
      mutate(view, localOffset, false);
    if (centralOffset >= 0 && view.getUint32(centralOffset, true) === 0x02014b50)
      mutate(view, centralOffset, true);
  }
  return result;
};

const crc32 = (bytes: Uint8Array): number => {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
};

const concatBytes = (...parts: readonly Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
};

const zipWords = (...values: readonly number[]): Uint8Array => {
  const result = new Uint8Array(values.length * 4);
  const view = new DataView(result.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value >>> 0, true));
  return result;
};

type DescriptorEntry = {
  readonly name: string;
  readonly data: Uint8Array;
  readonly compressed?: Uint8Array;
  readonly method?: 0 | 8;
  readonly flags?: number;
  readonly descriptor?: 'SIGNED' | 'UNSIGNED' | 'MISSING' | 'ZIP64';
  readonly descriptorTuple?: readonly [number, number, number];
  readonly rawDescriptor?: Uint8Array;
  readonly centralTuple?: readonly [number, number, number];
  readonly localTuple?: readonly [number, number, number];
};

const makeDescriptorZip = (
  entries: readonly DescriptorEntry[],
  options: { readonly signed?: boolean } = {},
): Uint8Array => {
  const signed = options.signed ?? true;
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = strToU8(entry.name);
    const method = entry.method ?? 8;
    const flags = entry.flags ?? 8;
    const compressed = entry.compressed ?? (method === 8 ? deflateSync(entry.data) : entry.data);
    const crc = crc32(entry.data);
    const centralTuple = entry.centralTuple ?? [crc, compressed.length, entry.data.length];
    const localTuple = entry.localTuple ?? ((flags & 8) !== 0 ? [0, 0, 0] : centralTuple);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, flags, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, localTuple[0], true);
    localView.setUint32(18, localTuple[1], true);
    localView.setUint32(22, localTuple[2], true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    const descriptorKind = entry.descriptor ?? (signed ? 'SIGNED' : 'UNSIGNED');
    const descriptorTuple = entry.descriptorTuple ?? centralTuple;
    const descriptor =
      entry.rawDescriptor ??
      (descriptorKind === 'SIGNED'
        ? zipWords(0x08074b50, ...descriptorTuple)
        : descriptorKind === 'UNSIGNED'
          ? zipWords(...descriptorTuple)
          : descriptorKind === 'ZIP64'
            ? concatBytes(zipWords(0x08074b50, descriptorTuple[0]), new Uint8Array(16))
            : new Uint8Array());
    locals.push(local, compressed, descriptor);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, flags, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, centralTuple[0], true);
    centralView.setUint32(20, centralTuple[1], true);
    centralView.setUint32(24, centralTuple[2], true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, localOffset, true);
    central.set(name, 46);
    centrals.push(central);
    localOffset += local.length + compressed.length + descriptor.length;
  }
  const central = concatBytes(...centrals);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, central.length, true);
  eocdView.setUint32(16, localOffset, true);
  return concatBytes(...locals, central, eocd);
};

const rawStoredDeflate = (...parts: readonly Uint8Array[]): Uint8Array =>
  concatBytes(
    ...parts.map((part, index) => {
      if (part.length > 0xffff) throw new Error('Stored DEFLATE test block is too large');
      const header = new Uint8Array(5);
      const view = new DataView(header.buffer);
      header[0] = index === parts.length - 1 ? 1 : 0;
      view.setUint16(1, part.length, true);
      view.setUint16(3, part.length ^ 0xffff, true);
      return concatBytes(header, part);
    }),
  );

const deflateBits = (...fields: readonly (readonly [number, number])[]): Uint8Array => {
  const bitCount = fields.reduce((total, [, count]) => total + count, 0);
  const result = new Uint8Array(Math.ceil(bitCount / 8));
  let offset = 0;
  for (const [value, count] of fields)
    for (let bit = 0; bit < count; bit += 1) {
      result[offset >>> 3] = result[offset >>> 3]! | (((value >>> bit) & 1) << (offset & 7));
      offset += 1;
    }
  return result;
};

const descriptorEntries = (
  body: string,
  documentOverrides: Partial<DescriptorEntry> = {},
): readonly DescriptorEntry[] => {
  const xml = strToU8(documentXml(body));
  return [
    { name: '[Content_Types].xml', data: strToU8(CONTENT_TYPES) },
    { name: '_rels/.rels', data: strToU8(ROOT_RELS) },
    { name: 'word/document.xml', data: xml, ...documentOverrides },
  ];
};

const descriptorDocx = (
  body: string,
  options: { readonly signed?: boolean; readonly documentCompressed?: Uint8Array } = {},
): Uint8Array =>
  makeDescriptorZip(descriptorEntries(body, { compressed: options.documentCompressed }), options);

describe('deterministic DOCX seed source intake', () => {
  test.each([
    ['signed', true],
    ['unsigned', false],
  ] as const)('accepts a valid classic %s data descriptor', (_name, signed) => {
    const result = convert(descriptorDocx(validBody(paragraph('大连买房')), { signed }));
    expect(result).toMatchObject({ status: 'SUCCESS' });
  });

  test('rejects trailing bytes included in the declared DEFLATE compressed size', () => {
    const xml = strToU8(documentXml(validBody(paragraph('大连买房'))));
    for (const junkLength of [1, 4, 16]) {
      const compressed = concatBytes(deflateSync(xml), new Uint8Array(junkLength).fill(0xa5));
      expectFailure(
        convert(
          descriptorDocx(validBody(paragraph('大连买房')), { documentCompressed: compressed }),
        ),
        'INVALID_DOCX_CONTAINER',
      );
    }
  });

  test('validates stored descriptor output with the standard CRC32 vector', () => {
    const bytes = makeDescriptorZip([
      ...descriptorEntries(validBody(paragraph('大连买房'))),
      {
        name: 'crc-vector.txt',
        data: strToU8('123456789'),
        method: 0,
        centralTuple: [0xcbf43926, 9, 9],
        descriptorTuple: [0xcbf43926, 9, 9],
      },
    ]);
    expect(convert(bytes).status).toBe('SUCCESS');
  });

  test('accepts stored, fixed, dynamic and multiple-block raw DEFLATE streams', () => {
    const smallXml = strToU8(documentXml(validBody(paragraph('大连买房'))));
    const fixedData = strToU8('fixed');
    const fixed = deflateSync(fixedData, { level: 1 });
    expect((fixed[0]! >>> 1) & 3).toBe(1);
    const largeBody = validBody(
      ...Array.from({ length: 200 }, (_unused, index) => paragraph(`大连房产关键词${index}`)),
    );
    const largeXml = strToU8(documentXml(largeBody));
    const dynamic = deflateSync(largeXml, { level: 6 });
    expect((dynamic[0]! >>> 1) & 3).toBe(2);
    const midpoint = Math.floor(smallXml.length / 2);
    const variants = [
      rawStoredDeflate(smallXml),
      dynamic,
      rawStoredDeflate(smallXml.slice(0, midpoint), smallXml.slice(midpoint)),
    ];
    const bodies = [validBody(paragraph('大连买房')), largeBody, validBody(paragraph('大连买房'))];
    variants.forEach((compressed, index) => {
      const body = bodies[index]!;
      expect(convert(makeDescriptorZip(descriptorEntries(body, { compressed }))).status).toBe(
        'SUCCESS',
      );
    });
    expect(
      convert(
        makeDescriptorZip([
          ...descriptorEntries(validBody(paragraph('大连买房'))),
          { name: 'fixed.bin', data: fixedData, compressed: fixed },
        ]),
      ).status,
    ).toBe('SUCCESS');
  });

  test.each([
    ['CRC', 0, 1],
    ['compressed size', 1, 1],
    ['uncompressed size', 2, 1],
  ] as const)('rejects descriptor %s mismatch', (_name, tupleIndex, delta) => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const compressed = deflateSync(data);
    const tuple: [number, number, number] = [crc32(data), compressed.length, data.length];
    tuple[tupleIndex] = (tuple[tupleIndex] + delta) >>> 0;
    expectFailure(
      convert(makeDescriptorZip(descriptorEntries(body, { compressed, descriptorTuple: tuple }))),
      'INVALID_DOCX_CONTAINER',
    );
  });

  test('rejects central CRC and output-size claims that disagree with actual output', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const compressed = deflateSync(data);
    const crc = crc32(data);
    for (const tuple of [
      [crc ^ 1, compressed.length, data.length],
      [crc, compressed.length, data.length + 1],
    ] as const)
      expectFailure(
        convert(
          makeDescriptorZip(
            descriptorEntries(body, { compressed, centralTuple: tuple, descriptorTuple: tuple }),
          ),
        ),
        'INVALID_DOCX_CONTAINER',
      );
  });

  test('rejects missing, truncated, oversized and ZIP64 descriptor layouts', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const compressed = deflateSync(data);
    const tuple = [crc32(data), compressed.length, data.length] as const;
    for (const overrides of [
      { descriptor: 'MISSING' as const },
      { rawDescriptor: zipWords(0x08074b50, ...tuple).slice(0, 15) },
      { rawDescriptor: concatBytes(zipWords(0x08074b50, ...tuple), new Uint8Array(4)) },
      { descriptor: 'ZIP64' as const },
    ])
      expectFailure(
        convert(makeDescriptorZip(descriptorEntries(body, { compressed, ...overrides }))),
        'INVALID_DOCX_CONTAINER',
      );
  });

  test('rejects descriptor overlap boundaries and a descriptor appended with bit 3 clear', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const compressed = deflateSync(data);
    const tuple = [crc32(data), compressed.length, data.length] as const;
    const overlapping = makeDescriptorZip(
      descriptorEntries(body, {
        compressed,
        rawDescriptor: zipWords(0x08074b50, ...tuple).slice(0, 12),
      }),
    );
    expectFailure(convert(overlapping), 'INVALID_DOCX_CONTAINER');
    const entries = [...descriptorEntries(body)];
    const first = entries[0]!;
    const firstCompressed = deflateSync(first.data);
    const firstTuple = [crc32(first.data), firstCompressed.length, first.data.length] as const;
    entries[0] = {
      ...first,
      compressed: firstCompressed,
      rawDescriptor: zipWords(0x08074b50, ...firstTuple).slice(0, 15),
    };
    expectFailure(convert(makeDescriptorZip(entries)), 'INVALID_DOCX_CONTAINER');
    expectFailure(
      convert(
        makeDescriptorZip(
          descriptorEntries(body, {
            compressed,
            flags: 0,
            localTuple: tuple,
            descriptor: 'SIGNED',
          }),
        ),
      ),
      'INVALID_DOCX_CONTAINER',
    );
  });

  test('does not confuse descriptor signature bytes inside compressed payload', () => {
    const marker = new Uint8Array([0x50, 0x4b, 0x07, 0x08]);
    const bytes = makeDescriptorZip([
      ...descriptorEntries(validBody(paragraph('大连买房'))),
      { name: 'marker.bin', data: marker, compressed: rawStoredDeflate(marker) },
    ]);
    expect(convert(bytes).status).toBe('SUCCESS');
  });

  test('rejects descriptor-signature CRC ambiguity when actual output does not corroborate it', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const compressed = deflateSync(data);
    const tuple = [0x08074b50, compressed.length, data.length] as const;
    expectFailure(
      convert(
        makeDescriptorZip(
          descriptorEntries(body, {
            compressed,
            centralTuple: tuple,
            descriptorTuple: tuple,
            descriptor: 'UNSIGNED',
          }),
          { signed: false },
        ),
      ),
      'INVALID_DOCX_CONTAINER',
    );
  });

  test('rejects malformed stored, fixed and dynamic DEFLATE grammars', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const stored = rawStoredDeflate(data);
    const badStored = stored.slice();
    badStored[3] = badStored[3]! ^ 1;
    for (const compressed of [badStored, new Uint8Array([0x03]), new Uint8Array([0x05, 0x00])])
      expectFailure(
        convert(makeDescriptorZip(descriptorEntries(body, { compressed }))),
        'INVALID_DOCX_CONTAINER',
      );
  });

  test('rejects truncated streams, missing EOB, invalid Huffman trees and invalid repeat semantics', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const valid = deflateSync(data);
    const missingEob = deflateSync(strToU8('A')).slice(0, -1);
    const oversubscribedCodeLengthTree = deflateBits(
      [1, 1],
      [2, 2],
      [0, 5],
      [0, 5],
      [0, 4],
      [1, 3],
      [1, 3],
      [1, 3],
      [1, 3],
    );
    const repeatWithoutPreviousLength = deflateBits(
      [1, 1],
      [2, 2],
      [0, 5],
      [0, 5],
      [0, 4],
      [1, 3],
      [0, 3],
      [0, 3],
      [0, 3],
      [0, 1],
    );
    for (const compressed of [
      valid.slice(0, -1),
      missingEob,
      oversubscribedCodeLengthTree,
      repeatWithoutPreviousLength,
    ])
      expectFailure(
        convert(makeDescriptorZip(descriptorEntries(body, { compressed }))),
        'INVALID_DOCX_CONTAINER',
      );
  });

  test('rejects mixed zero and non-zero local descriptor tuples', () => {
    const body = validBody(paragraph('大连买房'));
    const data = strToU8(documentXml(body));
    const compressed = deflateSync(data);
    expectFailure(
      convert(
        makeDescriptorZip(
          descriptorEntries(body, { compressed, localTuple: [0, compressed.length, 0] }),
        ),
      ),
      'INVALID_DOCX_CONTAINER',
    );
  });

  test('joins split runs, preserves paragraph order/empty/exact text and excludes one exact notice', () => {
    const decomposed = ' e\u0301 ';
    const bytes = makeDocx(
      validBody(
        paragraph('大连', '买房'),
        paragraph(),
        paragraph('重复'),
        paragraph('重复'),
        paragraph(decomposed),
        paragraph('大连 Naval 广场'),
      ),
    );
    const result = convert(bytes);
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected DOCX success');
    expect(result.corpus.items.map((item) => item.rawText)).toEqual([
      '大连买房',
      '重复',
      '重复',
      decomposed,
      '大连 Naval 广场',
    ]);
    expect(result.corpus.items.map((item) => item.originalOrder)).toEqual([0, 2, 3, 4, 5]);
    expect(result.corpus.items[1]?.seedId).not.toBe(result.corpus.items[2]?.seedId);
    expect(result.intakeReport.records[1]).toMatchObject({
      originalOrder: 1,
      rawText: '',
      status: 'EMPTY',
      included: false,
      errorCode: null,
      reason: 'No semantic seed content; retained for audit only',
    });
    expect(result.intakeReport.records[1]).not.toHaveProperty('seedId');
    expect(result.intakeReport.records.at(-1)).toMatchObject({
      rawText: COZE_PROVENANCE_NOTICE,
      status: 'SOURCE_PROVENANCE_NOTICE',
      included: false,
    });
    expect(result.manifest).toMatchObject({
      declaredSourceFormat: 'DOCX',
      declaredSourceEncoding: null,
      acceptedSourceFormat: 'DOCX',
      acceptedSourceEncoding: null,
      docxExtractionVersion: DOCX_EXTRACTION_VERSION,
      sourceRecordCount: 7,
      itemCountValid: 5,
      itemCountEmpty: 1,
      itemCountExcludedProvenanceNotice: 1,
    });
  });

  test('produces three independent deterministic checksums and byte-stable replay', () => {
    const bytes = makeDocx(validBody(paragraph('大连买房')));
    const first = convert(bytes);
    const replay = convert(bytes, { receivedAt: '2026-08-21T00:00:00.000Z' });
    expect(first.status).toBe('SUCCESS');
    expect(replay.status).toBe('SUCCESS');
    if (first.status !== 'SUCCESS' || replay.status !== 'SUCCESS')
      throw new Error('Expected DOCX success');
    if (
      first.manifest.acceptedSourceFormat !== 'DOCX' ||
      replay.manifest.acceptedSourceFormat !== 'DOCX'
    )
      throw new Error('Expected DOCX manifests');
    expect(first.corpus).toEqual(replay.corpus);
    expect(first.manifest.sourceArtifactSha256).toBe(checksumSourceArtifact(bytes));
    expect(first.manifest.extractedTextArtifactSha256).toBe(
      checksumSourceArtifact(
        new TextEncoder().encode(`${JSON.stringify(['大连买房', COZE_PROVENANCE_NOTICE])}\n`),
      ),
    );
    expect(first.manifest.extractedTextArtifactSha256).toBe(
      replay.manifest.extractedTextArtifactSha256,
    );
    expect(first.manifest.convertedArtifactSha256).toBe(replay.manifest.convertedArtifactSha256);
    expect(
      new Set([
        first.manifest.sourceArtifactSha256,
        first.manifest.extractedTextArtifactSha256,
        first.manifest.convertedArtifactSha256,
      ]).size,
    ).toBe(3);
  });

  test('binds seed identity to raw DOCX bytes while keeping extraction deterministic', () => {
    const firstBytes = makeDocx(validBody(paragraph('大连买房')));
    const changedBytes = makeDocx(validBody(paragraph('大连买房')), {
      'docProps/core.xml': strToU8('<metadata>changed bytes only</metadata>'),
    });
    const first = convert(firstBytes);
    const changed = convert(changedBytes);
    expect(first.status).toBe('SUCCESS');
    expect(changed.status).toBe('SUCCESS');
    if (first.status !== 'SUCCESS' || changed.status !== 'SUCCESS')
      throw new Error('Expected DOCX success');
    if (
      first.manifest.acceptedSourceFormat !== 'DOCX' ||
      changed.manifest.acceptedSourceFormat !== 'DOCX'
    )
      throw new Error('Expected DOCX manifests');
    expect(first.manifest.sourceArtifactSha256).not.toBe(changed.manifest.sourceArtifactSha256);
    expect(first.manifest.extractedTextArtifactSha256).toBe(
      changed.manifest.extractedTextArtifactSha256,
    );
    expect(first.corpus.items[0]?.seedId).not.toBe(changed.corpus.items[0]?.seedId);
  });

  test('fails closed on checksum mismatch before parsing the container', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expectFailure(
      convert(bytes, { expectedSourceArtifactSha256: 'f'.repeat(64) }),
      'SOURCE_ARTIFACT_CHECKSUM_MISMATCH',
    );
  });

  test('requires exactly one code-point exact provenance notice', () => {
    expectFailure(convert(makeDocx(paragraph('大连买房'))), 'PROVENANCE_NOTICE_STRUCTURE_MISMATCH');
    expectFailure(
      convert(makeDocx(`${validBody(paragraph('大连买房'))}${paragraph(COZE_PROVENANCE_NOTICE)}`)),
      'PROVENANCE_NOTICE_STRUCTURE_MISMATCH',
    );
    expectFailure(
      convert(makeDocx(paragraph('大连买房') + paragraph(`${COZE_PROVENANCE_NOTICE} `))),
      'PROVENANCE_NOTICE_STRUCTURE_MISMATCH',
    );
  });

  test('rejects invalid, missing, duplicate and malformed document XML', () => {
    expectFailure(convert(new Uint8Array([1, 2, 3])), 'INVALID_DOCX_CONTAINER');
    const missing = zipSync(
      { '[Content_Types].xml': strToU8(CONTENT_TYPES), '_rels/.rels': strToU8(ROOT_RELS) },
      { level: 0, mtime: FIXED_MTIME },
    );
    expectFailure(convert(missing), 'DOCUMENT_XML_MISSING');
    const duplicateBase = zipSync(
      {
        '[Content_Types].xml': strToU8(CONTENT_TYPES),
        '_rels/.rels': strToU8(ROOT_RELS),
        'word/document.xml': strToU8(documentXml(validBody(paragraph('大连买房')))),
        'evil/document.xml': strToU8(documentXml(validBody(paragraph('另一条')))),
      },
      { level: 0, mtime: FIXED_MTIME },
    );
    expectFailure(
      convert(patchAllAscii(duplicateBase, 'evil/document.xml', 'word/document.xml')),
      'INVALID_DOCX_CONTAINER',
    );
    const malformed = zipSync(
      {
        '[Content_Types].xml': strToU8(CONTENT_TYPES),
        '_rels/.rels': strToU8(ROOT_RELS),
        'word/document.xml': strToU8('<w:document'),
      },
      { level: 0, mtime: FIXED_MTIME },
    );
    expectFailure(convert(malformed), 'MALFORMED_DOCUMENT_XML');
  });

  test('rejects encrypted ZIP entries', () => {
    expectFailure(
      convert(markFirstEntryEncrypted(makeDocx(validBody(paragraph('大连买房'))))),
      'INVALID_DOCX_CONTAINER',
    );
  });

  test('enforces fixed source, entry-count, single-entry, total and document XML limits', () => {
    expectFailure(
      convert(new Uint8Array(MAX_SOURCE_ARTIFACT_BYTES + 1)),
      'SOURCE_ARTIFACT_TOO_LARGE',
    );

    const manyEntries: ExtraEntries = {};
    for (let index = 0; index < MAX_ZIP_ENTRY_COUNT; index += 1)
      manyEntries[`extra/${index}.txt`] = new Uint8Array();
    expectFailure(
      convert(makeDocx(validBody(paragraph('大连买房')), manyEntries)),
      'ZIP_ENTRY_LIMIT_EXCEEDED',
    );

    expectFailure(
      convert(
        makeDocx(validBody(paragraph('大连买房')), {
          'word/media/large.bin': new Uint8Array(MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES + 1),
        }),
      ),
      'ZIP_ENTRY_TOO_LARGE',
    );

    const chunkLength = Math.floor(MAX_TOTAL_UNCOMPRESSED_BYTES / 3) + 1;
    expectFailure(
      convert(
        makeDocx(validBody(paragraph('大连买房')), {
          'extra/a.bin': new Uint8Array(chunkLength),
          'extra/b.bin': new Uint8Array(chunkLength),
          'extra/c.bin': new Uint8Array(chunkLength),
        }),
      ),
      'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED',
    );

    const oversizedDocument = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W_NS}"><w:body>${' '.repeat(MAX_DOCUMENT_XML_BYTES)}${paragraph(COZE_PROVENANCE_NOTICE)}</w:body></w:document>`;
    const documentTooLarge = zipSync(
      {
        '[Content_Types].xml': strToU8(CONTENT_TYPES),
        '_rels/.rels': strToU8(ROOT_RELS),
        'word/document.xml': strToU8(oversizedDocument),
      },
      { level: 6, mtime: FIXED_MTIME },
    );
    expectFailure(convert(documentTooLarge), 'DOCUMENT_XML_TOO_LARGE');
  });

  test('rejects actual decompressed output that exceeds a forged small declaration', () => {
    const name = 'word/media/large.bin';
    const bytes = makeDocx(validBody(paragraph('大连买房')), {
      [name]: new Uint8Array(MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES + 1),
    });
    const forged = mutateZipHeaders(bytes, name, (view, offset, central) =>
      view.setUint32(offset + (central ? 24 : 22), 1, true),
    );
    expectFailure(convert(forged), 'ZIP_ENTRY_TOO_LARGE');
  });

  test('enforces actual document and total output limits against forged declarations', () => {
    const oversizedXml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body>${' '.repeat(MAX_DOCUMENT_XML_BYTES + 1)}</w:body></w:document>`;
    const documentBytes = makeDocx('', { 'word/document.xml': strToU8(oversizedXml) });
    const forgedDocument = mutateZipHeaders(
      documentBytes,
      'word/document.xml',
      (view, offset, central) => view.setUint32(offset + (central ? 24 : 22), 1, true),
    );
    expectFailure(convert(forgedDocument), 'DOCUMENT_XML_TOO_LARGE');

    const chunkLength = Math.floor(MAX_TOTAL_UNCOMPRESSED_BYTES / 3) + 1;
    let totalBytes = makeDocx(validBody(paragraph('大连买房')), {
      'extra/a.bin': new Uint8Array(chunkLength),
      'extra/b.bin': new Uint8Array(chunkLength),
      'extra/c.bin': new Uint8Array(chunkLength),
    });
    for (const name of ['extra/a.bin', 'extra/b.bin', 'extra/c.bin'])
      totalBytes = mutateZipHeaders(totalBytes, name, (view, offset, central) =>
        view.setUint32(offset + (central ? 24 : 22), 1, true),
      );
    expectFailure(convert(totalBytes), 'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED');
  });

  test('rejects descriptor mode and overlapping entry ranges', () => {
    const base = makeDocx(validBody(paragraph('大连买房')), {
      'extra/a.bin': new Uint8Array([1]),
      'extra/b.bin': new Uint8Array([2]),
    });
    const descriptor = mutateZipHeaders(base, 'extra/a.bin', (view, offset, central) =>
      view.setUint16(
        offset + (central ? 8 : 6),
        view.getUint16(offset + (central ? 8 : 6), true) | 8,
        true,
      ),
    );
    expectFailure(convert(descriptor), 'INVALID_DOCX_CONTAINER');

    const overlapping = base.slice();
    const view = new DataView(overlapping.buffer, overlapping.byteOffset, overlapping.byteLength);
    const name = strToU8('extra/a.bin');
    let localOffset = -1;
    let centralOffset = -1;
    for (let offset = 0; offset <= overlapping.length - name.length; offset += 1) {
      if (!name.every((value, index) => overlapping[offset + index] === value)) continue;
      if (offset >= 30 && view.getUint32(offset - 30, true) === 0x04034b50)
        localOffset = offset - 30;
      if (offset >= 46 && view.getUint32(offset - 46, true) === 0x02014b50)
        centralOffset = offset - 46;
    }
    expect(localOffset).toBeGreaterThanOrEqual(0);
    expect(centralOffset).toBeGreaterThanOrEqual(0);
    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    let nextLocalOffset = dataStart;
    while (
      nextLocalOffset < overlapping.length &&
      view.getUint32(nextLocalOffset, true) !== 0x04034b50
    )
      nextLocalOffset += 1;
    const overlappingSize = nextLocalOffset - dataStart + 1;
    view.setUint32(localOffset + 18, overlappingSize, true);
    view.setUint32(centralOffset + 20, overlappingSize, true);
    expectFailure(convert(overlapping), 'INVALID_DOCX_CONTAINER');
  });

  test.each([
    [
      'filename',
      (view: DataView, offset: number, central: boolean) => {
        if (!central) view.setUint8(offset + 30, 'x'.charCodeAt(0));
      },
    ],
    [
      'method',
      (view: DataView, offset: number, central: boolean) => {
        if (!central) view.setUint16(offset + 8, 0, true);
      },
    ],
    [
      'flags',
      (view: DataView, offset: number, central: boolean) => {
        if (!central) view.setUint16(offset + 6, view.getUint16(offset + 6, true) | 2, true);
      },
    ],
    [
      'compressed size',
      (view: DataView, offset: number, central: boolean) => {
        if (!central) view.setUint32(offset + 18, view.getUint32(offset + 18, true) + 1, true);
      },
    ],
    [
      'uncompressed size',
      (view: DataView, offset: number, central: boolean) => {
        if (!central) view.setUint32(offset + 22, view.getUint32(offset + 22, true) + 1, true);
      },
    ],
    [
      'CRC32',
      (view: DataView, offset: number, central: boolean) => {
        if (!central) view.setUint32(offset + 14, view.getUint32(offset + 14, true) ^ 1, true);
      },
    ],
  ] as const)('rejects central/local %s mismatch', (_name, mutate) => {
    expectFailure(
      convert(
        mutateZipHeaders(makeDocx(validBody(paragraph('大连买房'))), 'word/document.xml', mutate),
      ),
      'INVALID_DOCX_CONTAINER',
    );
  });

  test.each(['C:/evil.txt', 'C:\\evil.txt', '../evil.txt', '%2e%2e/evil.txt', '//server/share'])(
    'rejects unsafe ZIP path %s',
    (name) => {
      expectFailure(
        convert(makeDocx(validBody(paragraph('大连买房')), { [name]: new Uint8Array() })),
        'INVALID_DOCX_CONTAINER',
      );
    },
  );

  test.each([
    ['DOCTYPE', '<!DOCTYPE w:document>', 'UNSAFE_XML_STRUCTURE'],
    [
      'ENTITY',
      '<!DOCTYPE w:document [<!ENTITY xxe SYSTEM "file:///secret">]>',
      'UNSAFE_XML_STRUCTURE',
    ],
    [
      'XInclude',
      '<xi:include xmlns:xi="http://www.w3.org/2001/XInclude" href="file:///secret"/>',
      'UNSAFE_XML_STRUCTURE',
    ],
  ])('rejects unsafe XML: %s', (_name, unsafe, errorCode) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>${unsafe}<w:document xmlns:w="${W_NS}"><w:body>${validBody(paragraph('大连买房'))}</w:body></w:document>`;
    const bytes = zipSync(
      {
        '[Content_Types].xml': strToU8(CONTENT_TYPES),
        '_rels/.rels': strToU8(ROOT_RELS),
        'word/document.xml': strToU8(xml),
      },
      { level: 0, mtime: FIXED_MTIME },
    );
    expectFailure(convert(bytes), errorCode);
  });

  test.each([
    ['tab', '<w:p><w:r><w:tab/></w:r></w:p>'],
    ['manual break', '<w:p><w:r><w:br/></w:r></w:p>'],
    ['carriage return', '<w:p><w:r><w:cr/></w:r></w:p>'],
    ['table', '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'],
    ['hyperlink', '<w:p><w:hyperlink><w:r><w:t>x</w:t></w:r></w:hyperlink></w:p>'],
    ['tracked insertion', '<w:p><w:ins><w:r><w:t>x</w:t></w:r></w:ins></w:p>'],
    ['tracked deletion', '<w:p><w:del><w:r><w:delText>x</w:delText></w:r></w:del></w:p>'],
    ['field', '<w:p><w:r><w:instrText>DATE</w:instrText></w:r></w:p>'],
    [
      'text box',
      '<w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p>',
    ],
    ['drawing', '<w:p><w:r><w:drawing/></w:r></w:p>'],
    [
      'content control',
      '<w:sdt><w:sdtContent><w:p><w:r><w:t>x</w:t></w:r></w:p></w:sdtContent></w:sdt>',
    ],
    ['altChunk', '<w:altChunk/>'],
  ])('rejects unsupported OOXML structure: %s', (_name, unsupported) => {
    expectFailure(
      convert(makeDocx(`${unsupported}${validBody(paragraph('大连买房'))}`)),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
  });

  test.each([
    ['header', 'word/header1.xml'],
    ['footer', 'word/footer1.xml'],
    ['footnote', 'word/footnotes.xml'],
    ['endnote', 'word/endnotes.xml'],
    ['comment', 'word/comments.xml'],
  ])('rejects unsupported package part: %s', (_name, path) => {
    expectFailure(
      convert(makeDocx(validBody(paragraph('大连买房')), { [path]: strToU8('<unsupported/>') })),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
  });

  test('rejects external relationships', () => {
    expectFailure(
      convert(
        makeDocx(validBody(paragraph('大连买房')), {
          'word/_rels/document.xml.rels': strToU8(
            '<Relationships><Relationship TargetMode="External" Target="https://example.invalid"/></Relationships>',
          ),
        }),
      ),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
  });

  test('rejects entity-encoded external relationships and XInclude namespace', () => {
    expectFailure(
      convert(
        makeDocx(validBody(paragraph('大连买房')), {
          'word/_rels/document.xml.rels': strToU8(
            '<Relationships><Relationship TargetMode="Ex&#x74;ernal" Target="https://example.invalid"/></Relationships>',
          ),
        }),
      ),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
    const xml = `<?xml version="1.0"?><w:document xmlns:w="${W_NS}"><w:body><xi:include xmlns:xi="http://www.w3.org/2001/XIncl&#x75;de"/>${validBody(paragraph('大连买房'))}</w:body></w:document>`;
    expectFailure(
      convert(makeDocx('', { 'word/document.xml': strToU8(xml) })),
      'UNSAFE_XML_STRUCTURE',
    );
  });

  test('uses namespace semantics for allowed paragraphs and unsupported tables', () => {
    const allowed = `<?xml version="1.0"?><x:document xmlns:x="${W_NS}"><x:body><x:p><x:r><x:t>大连买房</x:t></x:r></x:p><x:p><x:r><x:t>${COZE_PROVENANCE_NOTICE}</x:t></x:r></x:p><x:sectPr/></x:body></x:document>`;
    expect(convert(makeDocx('', { 'word/document.xml': strToU8(allowed) })).status).toBe('SUCCESS');
    const table = allowed.replace('<x:p><x:r><x:t>大连买房</x:t></x:r></x:p>', '<x:tbl/>');
    expectFailure(
      convert(makeDocx('', { 'word/document.xml': strToU8(table) })),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
  });

  test('resolves namespaces with lexical element scope', () => {
    const wrongRoot = `<x:document xmlns:x="urn:evil"><x:body xmlns:x="${W_NS}"><x:p><x:r><x:t>大连买房</x:t></x:r></x:p><x:p><x:r><x:t>${COZE_PROVENANCE_NOTICE}</x:t></x:r></x:p></x:body></x:document>`;
    expectFailure(
      convert(makeDocx('', { 'word/document.xml': strToU8(wrongRoot) })),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
    const evilChild = `<w:document xmlns:w="${W_NS}"><w:body><w:p xmlns:w="urn:evil"><w:r><w:t>大连买房</w:t></w:r></w:p><w:p><w:r><w:t>${COZE_PROVENANCE_NOTICE}</w:t></w:r></w:p></w:body></w:document>`;
    expectFailure(
      convert(makeDocx('', { 'word/document.xml': strToU8(evilChild) })),
      'UNSUPPORTED_DOCX_STRUCTURE',
    );
    const validAlias = `<w:document xmlns:w="${W_NS}"><w:body><x:p xmlns:x="${W_NS}"><x:r><x:t>大连买房</x:t></x:r></x:p><w:p><w:r><w:t>${COZE_PROVENANCE_NOTICE}</w:t></w:r></w:p></w:body></w:document>`;
    expect(convert(makeDocx('', { 'word/document.xml': strToU8(validAlias) })).status).toBe(
      'SUCCESS',
    );
    const scopedXInclude = `<w:document xmlns:w="${W_NS}" xmlns:xi="urn:safe"><w:body><xi:include xmlns:xi="http://www.w3.org/2001/XInclude"/><w:p><w:r><w:t>${COZE_PROVENANCE_NOTICE}</w:t></w:r></w:p></w:body></w:document>`;
    expectFailure(
      convert(makeDocx('', { 'word/document.xml': strToU8(scopedXInclude) })),
      'UNSAFE_XML_STRUCTURE',
    );
  });

  describe('bounded OOXML formatting metadata grammar', () => {
    const wrap = (body: string, namespace = `xmlns:w="${W_NS}"`) =>
      `<w:document ${namespace}><w:body>${body}</w:body></w:document>`;
    const content = (firstParagraph: string, section = '') =>
      `${firstParagraph}${paragraph(COZE_PROVENANCE_NOTICE)}${section}`;
    const textRun = '<w:r><w:t xml:space="preserve">  大连买房  </w:t></w:r>';
    const validTop = '<w:top w:val="single" w:sz="4" w:color="auto"/>';
    const validLeft = '<w:left w:val="single" w:sz="4" w:color="auto"/>';
    const validLayoutSection =
      '<w:sectPr w:rsidR="00112233" w:rsidRPr="44556677" w:rsidSect="8899AABB"><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/><w:cols w:space="425"/><w:docGrid w:linePitch="312"/></w:sectPr>';
    const convertXml = (xml: string) =>
      convert(makeDocx('', { 'word/document.xml': strToU8(xml) }));

    test.each([
      ['empty leading pPr', '<w:p><w:pPr/>' + textRun + '</w:p>'],
      [
        'pStyle plus top border plus spacing',
        `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:pBdr>${validTop}</w:pBdr><w:spacing w:after="160"/></w:pPr>${textRun}</w:p>`,
      ],
      [
        'pStyle plus shading plus left border',
        `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:shd w:fill="FFFFFF" w:val="clear"/><w:pBdr>${validLeft}</w:pBdr></w:pPr>${textRun}</w:p>`,
      ],
      ['paragraph without pPr', `<w:p>${textRun}</w:p>`],
    ] as const)('accepts %s without changing raw text', (_name, firstParagraph) => {
      const result = convertXml(wrap(content(firstParagraph)));
      expect(result.status).toBe('SUCCESS');
      if (result.status !== 'SUCCESS') throw new Error('Expected metadata grammar success');
      expect(result.corpus.items[0]?.rawText).toBe('  大连买房  ');
    });

    test('accepts namespace aliases for every metadata element and attribute', () => {
      const aliasParagraph =
        '<x:p><x:pPr><x:pStyle x:val="Normal"/><x:pBdr><x:top x:val="single" x:sz="4" x:color="auto"/></x:pBdr><x:spacing x:after="160"/></x:pPr><x:r><x:t>大连买房</x:t></x:r></x:p>';
      const aliasNotice = `<x:p><x:r><x:t>${COZE_PROVENANCE_NOTICE}</x:t></x:r></x:p>`;
      const aliasSection =
        '<x:sectPr x:rsidR="00112233" x:rsidRPr="44556677" x:rsidSect="8899AABB"><x:pgSz x:w="11906" x:h="16838"/><x:pgMar x:top="1440" x:right="1440" x:bottom="1440" x:left="1440" x:header="851" x:footer="992" x:gutter="0"/><x:cols x:space="425"/><x:docGrid x:linePitch="312"/></x:sectPr>';
      const xml = `<x:document xmlns:x="${W_NS}"><x:body>${aliasParagraph}${aliasNotice}${aliasSection}</x:body></x:document>`;
      expect(convertXml(xml).status).toBe('SUCCESS');
    });

    test.each([
      ['wrong namespace lookalike', `<w:p><x:pPr xmlns:x="urn:evil"/>${textRun}</w:p>`],
      ['multiple pPr', `<w:p><w:pPr/><w:pPr/>${textRun}</w:p>`],
      ['non-leading pPr', `<w:p>${textRun}<w:pPr/></w:p>`],
      ['pPr after a run', `<w:p><w:r><w:t>prefix</w:t></w:r><w:pPr/>${textRun}</w:p>`],
      ['unknown pPr child', `<w:p><w:pPr><w:keepNext/></w:pPr>${textRun}</w:p>`],
      ['unknown pPr attribute', `<w:p><w:pPr w:foo="bar"/>${textRun}</w:p>`],
      ['direct text in pPr', `<w:p><w:pPr>HIDDEN</w:pPr>${textRun}</w:p>`],
      ['w:t in pPr', `<w:p><w:pPr><w:t>HIDDEN</w:t></w:pPr>${textRun}</w:p>`],
      ['instrText in pPr', `<w:p><w:pPr><w:instrText>HIDDEN</w:instrText></w:pPr>${textRun}</w:p>`],
      ['delText in pPr', `<w:p><w:pPr><w:delText>HIDDEN</w:delText></w:pPr>${textRun}</w:p>`],
      ['nested run in pPr', `<w:p><w:pPr><w:r><w:t>HIDDEN</w:t></w:r></w:pPr>${textRun}</w:p>`],
      [
        'pBdr without child',
        `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:pBdr/><w:spacing w:after="160"/></w:pPr>${textRun}</w:p>`,
      ],
      [
        'pBdr with duplicate children',
        `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:pBdr>${validTop}${validTop}</w:pBdr><w:spacing w:after="160"/></w:pPr>${textRun}</w:p>`,
      ],
      [
        'pBdr with top and left',
        `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:pBdr>${validTop}${validLeft}</w:pBdr><w:spacing w:after="160"/></w:pPr>${textRun}</w:p>`,
      ],
      [
        'unknown pBdr child',
        `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:pBdr><w:bottom w:val="single" w:sz="4" w:color="auto"/></w:pBdr><w:spacing w:after="160"/></w:pPr>${textRun}</w:p>`,
      ],
    ] as const)('rejects invalid paragraph metadata: %s', (_name, firstParagraph) => {
      expectFailure(convertXml(wrap(content(firstParagraph))), 'UNSUPPORTED_DOCX_STRUCTURE');
    });

    test('accepts the exact final layout sectPr and retains empty final sectPr support', () => {
      expect(convertXml(wrap(content(paragraph('大连买房'), validLayoutSection))).status).toBe(
        'SUCCESS',
      );
      expect(convertXml(wrap(content(paragraph('大连买房'), '<w:sectPr/>'))).status).toBe(
        'SUCCESS',
      );
    });

    test.each([
      [
        'wrong child order',
        validLayoutSection.replace(
          /<w:pgSz([^>]*)\/><w:pgMar([^>]*)\/>/u,
          '<w:pgMar$2/><w:pgSz$1/>',
        ),
      ],
      ['missing child', validLayoutSection.replace(/<w:cols[^>]*\/>/u, '')],
      [
        'duplicate child',
        validLayoutSection.replace(/<w:cols([^>]*)\/>/u, '<w:cols$1/><w:cols$1/>'),
      ],
      [
        'unknown child',
        validLayoutSection.replace('</w:sectPr>', '<w:headerReference/></w:sectPr>'),
      ],
      [
        'wrong namespace child',
        validLayoutSection.replace(/<w:cols([^>]*)\/>/u, '<x:cols xmlns:x="urn:evil"$1/>'),
      ],
      [
        'unknown sectPr attribute',
        validLayoutSection.replace('<w:sectPr ', '<w:sectPr w:foo="bar" '),
      ],
      [
        'direct text in section metadata',
        validLayoutSection.replace('<w:pgSz ', '<w:pgSz>HIDDEN</w:pgSz><w:pgSz '),
      ],
      [
        'content element in section metadata',
        validLayoutSection.replace(
          '</w:sectPr>',
          '<w:p><w:r><w:t>HIDDEN</w:t></w:r></w:p></w:sectPr>',
        ),
      ],
    ] as const)('rejects invalid section metadata: %s', (_name, section) => {
      expectFailure(
        convertXml(wrap(content(paragraph('大连买房'), section))),
        'UNSUPPORTED_DOCX_STRUCTURE',
      );
    });

    test('rejects non-final and multiple sectPr elements', () => {
      const body = `${paragraph('大连买房')}<w:sectPr/>${paragraph(COZE_PROVENANCE_NOTICE)}`;
      expectFailure(convertXml(wrap(body)), 'UNSUPPORTED_DOCX_STRUCTURE');
      expectFailure(
        convertXml(wrap(content(paragraph('大连买房'), '<w:sectPr/><w:sectPr/>'))),
        'UNSUPPORTED_DOCX_STRUCTURE',
      );
    });
  });

  test('freezes sectPr as one optional empty final body element', () => {
    const wrap = (body: string) =>
      `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`;
    const content = `${paragraph('大连买房')}${paragraph(COZE_PROVENANCE_NOTICE)}`;
    expect(convert(makeDocx('', { 'word/document.xml': strToU8(wrap(content)) })).status).toBe(
      'SUCCESS',
    );
    expect(
      convert(makeDocx('', { 'word/document.xml': strToU8(wrap(`${content}<w:sectPr/>`)) })).status,
    ).toBe('SUCCESS');
    for (const invalid of [
      `${content}<w:sectPr><w:tbl/></w:sectPr>`,
      `${content}<w:sectPr><w:p/></w:sectPr>`,
      `${content}<w:sectPr/><w:sectPr/>`,
      `${paragraph('大连买房')}<w:sectPr/>${paragraph(COZE_PROVENANCE_NOTICE)}`,
      `${content}<x:sectPr xmlns:x="urn:evil"/>`,
    ])
      expectFailure(
        convert(makeDocx('', { 'word/document.xml': strToU8(wrap(invalid)) })),
        'UNSUPPORTED_DOCX_STRUCTURE',
      );
    const alias = wrap(`${content}<x:sectPr xmlns:x="${W_NS}"/>`);
    expect(convert(makeDocx('', { 'word/document.xml': strToU8(alias) })).status).toBe('SUCCESS');
  });

  test('rejects non-whitespace direct text in structural elements and preserves w:t text', () => {
    const wrap = (body: string, documentText = '') =>
      `<w:document xmlns:w="${W_NS}">${documentText}<w:body>${body}</w:body></w:document>`;
    const content = `${paragraph('大连买房')}${paragraph(COZE_PROVENANCE_NOTICE)}`;
    const invalidDocuments = [
      wrap(content, 'HIDDEN'),
      wrap(`HIDDEN${content}`),
      wrap(`<w:p>HIDDEN<w:r><w:t>大连买房</w:t></w:r></w:p>${paragraph(COZE_PROVENANCE_NOTICE)}`),
      wrap(`<w:p><w:r>HIDDEN<w:t>大连买房</w:t></w:r></w:p>${paragraph(COZE_PROVENANCE_NOTICE)}`),
      wrap(`${content}<w:sectPr>HIDDEN</w:sectPr>`),
    ];
    for (const xml of invalidDocuments)
      expectFailure(
        convert(makeDocx('', { 'word/document.xml': strToU8(xml) })),
        'UNSUPPORTED_DOCX_STRUCTURE',
      );

    const whitespaceOnly = `<w:document xmlns:w="${W_NS}">
  <w:body>
    <w:p>
      <w:r>
        <w:t xml:space="preserve">  大连买房  </w:t>
      </w:r>
    </w:p>
    ${paragraph(COZE_PROVENANCE_NOTICE)}
    <w:sectPr>
    </w:sectPr>
  </w:body>
</w:document>`;
    const accepted = convert(makeDocx('', { 'word/document.xml': strToU8(whitespaceOnly) }));
    expect(accepted.status).toBe('SUCCESS');
    if (accepted.status !== 'SUCCESS') throw new Error('Expected structural whitespace success');
    expect(accepted.corpus.items[0]?.rawText).toBe('  大连买房  ');
  });

  test('rejects contradictory success provenance and count fields', () => {
    const result = convert(makeDocx(validBody(paragraph('大连买房'), paragraph('大连购房'))));
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected success');
    if (result.manifest.acceptedSourceFormat !== 'DOCX')
      throw new Error('Expected DOCX provenance manifest');
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: {
          ...result.intakeReport,
          acceptedSourceFormat: 'TXT',
          acceptedSourceEncoding: 'UTF-8',
        },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        manifest: { ...result.manifest, convertedArtifactSha256: 'f'.repeat(64) },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: {
          ...result.intakeReport,
          itemCountRaw: result.intakeReport.itemCountRaw + 1,
        },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: { ...result.intakeReport, itemCountValid: 1, itemCountEmpty: 1 },
        manifest: { ...result.manifest, itemCountValid: 1, itemCountEmpty: 1 },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        manifest: { ...result.manifest, sourceRecordCount: result.manifest.sourceRecordCount + 1 },
      }).success,
    ).toBe(false);
    const reversedCorpus = { ...result.corpus, items: [...result.corpus.items].reverse() };
    const reversedJson = `${JSON.stringify(reversedCorpus, null, 2)}\n`;
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        corpus: reversedCorpus,
        canonicalCorpusJson: reversedJson,
        manifest: {
          ...result.manifest,
          convertedArtifactSha256: checksumSourceArtifact(new TextEncoder().encode(reversedJson)),
        },
      }).success,
    ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        manifest: { ...result.manifest, extractedTextArtifactSha256: 'f'.repeat(64) },
      }).success,
    ).toBe(false);
    for (const corpusMutation of [
      { corpusId: 'other-corpus' },
      { corpusVersion: '2.0.0' },
      { market: 'other-market' },
      { locale: 'en-US' },
      { normalizationVersion: '2.0.0' },
    ]) {
      const corpus = { ...result.corpus, ...corpusMutation };
      const canonicalCorpusJson = `${JSON.stringify(corpus, null, 2)}\n`;
      expect(
        seedSourceIntakeResultSchema.safeParse({
          ...result,
          corpus,
          canonicalCorpusJson,
          manifest: {
            ...result.manifest,
            convertedArtifactSha256: checksumSourceArtifact(
              new TextEncoder().encode(canonicalCorpusJson),
            ),
          },
        }).success,
      ).toBe(false);
    }
  });

  test('rejects coordinated attempts to include EMPTY records in a successful corpus', () => {
    const result = convert(makeDocx(validBody(paragraph('大连买房'), paragraph(''))));
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected success');
    const empty = result.intakeReport.records.find((record) => record.status === 'EMPTY');
    if (!empty) throw new Error('Expected EMPTY audit record');

    const notice = result.intakeReport.records.find(
      (record) => record.status === 'SOURCE_PROVENANCE_NOTICE',
    );
    if (!notice) throw new Error('Expected provenance notice');
    const replaceRecord = (replacement: Record<string, unknown>) =>
      result.intakeReport.records.map((record) =>
        record.originalOrder === replacement.originalOrder ? replacement : record,
      );
    for (const invalidEmpty of [
      { ...empty, included: true },
      { ...empty, reason: null },
      { ...empty, reason: 'anything else' },
      { ...empty, rawText: 'not empty' },
      { ...empty, seedId: 'forbidden' },
    ])
      expect(
        seedSourceIntakeResultSchema.safeParse({
          ...result,
          intakeReport: { ...result.intakeReport, records: replaceRecord(invalidEmpty) },
        }).success,
      ).toBe(false);

    const valid = result.intakeReport.records.find((record) => record.status === 'VALID');
    if (!valid) throw new Error('Expected VALID record');
    for (const invalidValid of [
      { ...valid, included: false },
      { ...valid, reason: 'unexpected reason' },
    ])
      expect(
        seedSourceIntakeResultSchema.safeParse({
          ...result,
          intakeReport: { ...result.intakeReport, records: replaceRecord(invalidValid) },
        }).success,
      ).toBe(false);
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: {
          ...result.intakeReport,
          records: replaceRecord({ ...notice, included: true }),
        },
      }).success,
    ).toBe(false);

    const emptyCorpus = {
      ...result.corpus,
      items: [
        ...result.corpus.items,
        {
          ...result.corpus.items[0]!,
          seedId: 'empty-seed',
          rawText: '',
          originalOrder: empty.originalOrder!,
        },
      ],
    };
    const emptyCorpusJson = `${JSON.stringify(emptyCorpus, null, 2)}\n`;
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: {
          ...result.intakeReport,
          records: replaceRecord({ ...empty, included: true }),
        },
        corpus: emptyCorpus,
        canonicalCorpusJson: emptyCorpusJson,
        manifest: {
          ...result.manifest,
          convertedArtifactSha256: checksumSourceArtifact(
            new TextEncoder().encode(emptyCorpusJson),
          ),
        },
      }).success,
    ).toBe(false);

    for (const forbiddenOrder of [empty.originalOrder!, notice.originalOrder!]) {
      const corpus = {
        ...result.corpus,
        items: result.corpus.items.map((item, index) =>
          index === 0 ? { ...item, originalOrder: forbiddenOrder } : item,
        ),
      };
      const canonicalCorpusJson = `${JSON.stringify(corpus, null, 2)}\n`;
      expect(
        seedSourceIntakeResultSchema.safeParse({
          ...result,
          corpus,
          canonicalCorpusJson,
          manifest: {
            ...result.manifest,
            convertedArtifactSha256: checksumSourceArtifact(
              new TextEncoder().encode(canonicalCorpusJson),
            ),
          },
        }).success,
      ).toBe(false);
    }
  });

  test('requires exactly one frozen provenance notice for DOCX SUCCESS', () => {
    const result = convert(makeDocx(validBody(paragraph('大连买房'), paragraph(''))));
    expect(result.status).toBe('SUCCESS');
    if (result.status !== 'SUCCESS') throw new Error('Expected success');
    if (result.manifest.acceptedSourceFormat !== 'DOCX')
      throw new Error('Expected DOCX provenance manifest');
    const notice = result.intakeReport.records.find(
      (record) => record.status === 'SOURCE_PROVENANCE_NOTICE',
    );
    if (!notice) throw new Error('Expected provenance notice');
    const extractedHash = (records: typeof result.intakeReport.records) =>
      checksumSourceArtifact(
        new TextEncoder().encode(`${JSON.stringify(records.map((record) => record.rawText))}\n`),
      );

    const withoutNotice = result.intakeReport.records.filter(
      (record) => record.status !== 'SOURCE_PROVENANCE_NOTICE',
    );
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: {
          ...result.intakeReport,
          records: withoutNotice,
          itemCountRaw: withoutNotice.length,
          itemCountExcludedProvenanceNotice: 0,
        },
        manifest: {
          ...result.manifest,
          itemCountRaw: withoutNotice.length,
          itemCountExcludedProvenanceNotice: 0,
          sourceRecordCount: withoutNotice.length,
          extractedTextArtifactSha256: extractedHash(withoutNotice),
        },
      }).success,
    ).toBe(false);

    for (const mutatedNotice of [
      { ...notice, status: 'VALID' as const },
      { ...notice, included: true },
      { ...notice, rawText: `${COZE_PROVENANCE_NOTICE}近似` },
    ]) {
      const records = result.intakeReport.records.map((record) =>
        record.originalOrder === notice.originalOrder ? mutatedNotice : record,
      );
      expect(
        seedSourceIntakeResultSchema.safeParse({
          ...result,
          intakeReport: { ...result.intakeReport, records },
        }).success,
      ).toBe(false);
    }

    const duplicateNotice = { ...notice, originalOrder: result.intakeReport.records.length };
    const duplicatedRecords = [...result.intakeReport.records, duplicateNotice];
    expect(
      seedSourceIntakeResultSchema.safeParse({
        ...result,
        intakeReport: {
          ...result.intakeReport,
          records: duplicatedRecords,
          itemCountRaw: duplicatedRecords.length,
          itemCountExcludedProvenanceNotice: 2,
        },
        manifest: {
          ...result.manifest,
          itemCountRaw: duplicatedRecords.length,
          itemCountExcludedProvenanceNotice: 2,
          sourceRecordCount: duplicatedRecords.length,
          extractedTextArtifactSha256: extractedHash(duplicatedRecords),
        },
      }).success,
    ).toBe(false);
    expect(seedSourceIntakeResultSchema.safeParse(result).success).toBe(true);
  });

  test('keeps linguistic candidate identity stable across source-byte identity changes', () => {
    const first = convert(makeDocx(validBody(paragraph('大连买房'))));
    const second = convert(
      makeDocx(validBody(paragraph('大连买房')), {
        'docProps/core.xml': strToU8('<metadata>different zip bytes</metadata>'),
      }),
    );
    expect(first.status).toBe('SUCCESS');
    expect(second.status).toBe('SUCCESS');
    if (first.status !== 'SUCCESS' || second.status !== 'SUCCESS')
      throw new Error('Expected success');
    if (
      first.manifest.acceptedSourceFormat !== 'DOCX' ||
      second.manifest.acceptedSourceFormat !== 'DOCX'
    )
      throw new Error('Expected DOCX manifests');
    expect(first.manifest.sourceArtifactSha256).not.toBe(second.manifest.sourceArtifactSha256);
    expect(first.manifest.extractedTextArtifactSha256).toBe(
      second.manifest.extractedTextArtifactSha256,
    );
    expect(first.corpus.items[0]?.seedId).not.toBe(second.corpus.items[0]?.seedId);
    expect(first.manifest.convertedArtifactSha256).not.toBe(
      second.manifest.convertedArtifactSha256,
    );
    const dictionary = {
      dictionaryVersion: '1.0.0',
      locale: 'zh-CN',
      market: 'dalian-real-estate',
      normalizationVersion: '1.0.0',
      matchingRuleVersion: '1.0.0',
      conflictPolicyVersion: '1.0.0',
      entries: [],
    };
    const firstCandidate = compileSeedCorpus({
      compilerVersion: '1.1.0',
      corpus: first.corpus,
      dictionary,
    }).candidates[0];
    const secondCandidate = compileSeedCorpus({
      compilerVersion: '1.1.0',
      corpus: second.corpus,
      dictionary,
    }).candidates[0];
    expect(firstCandidate?.canonicalCandidateId).toBe(secondCandidate?.canonicalCandidateId);
  });
});
