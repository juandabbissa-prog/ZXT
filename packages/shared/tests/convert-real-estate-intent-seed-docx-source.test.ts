import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
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

describe('deterministic DOCX seed source intake', () => {
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
      '',
      '重复',
      '重复',
      decomposed,
      '大连 Naval 广场',
    ]);
    expect(result.corpus.items.map((item) => item.originalOrder)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.corpus.items[2]?.seedId).not.toBe(result.corpus.items[3]?.seedId);
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
      compilerVersion: '1.0.0',
      corpus: first.corpus,
      dictionary,
    }).candidates[0];
    const secondCandidate = compileSeedCorpus({
      compilerVersion: '1.0.0',
      corpus: second.corpus,
      dictionary,
    }).candidates[0];
    expect(firstCandidate?.canonicalCandidateId).toBe(secondCandidate?.canonicalCandidateId);
  });
});
