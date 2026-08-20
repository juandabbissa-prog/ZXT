import { UnzipInflate, UnzipPassThrough } from 'fflate';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { checksumSourceArtifact } from './checksum-source-artifact';
import {
  DOCX_EXTRACTION_VERSION,
  MAX_DOCUMENT_XML_BYTES,
  MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES,
  MAX_SOURCE_ARTIFACT_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_ZIP_ENTRY_COUNT,
  type INTAKE_ERROR_CODES,
} from './intake-contracts';

type IntakeErrorCode = (typeof INTAKE_ERROR_CODES)[number];

export type DocxExtractionResult =
  | {
      readonly status: 'SUCCESS';
      readonly docxExtractionVersion: typeof DOCX_EXTRACTION_VERSION;
      readonly paragraphRawTexts: readonly string[];
      readonly extractedTextArtifactSha256: string;
    }
  | {
      readonly status: 'FAILURE';
      readonly errorCode: IntakeErrorCode;
      readonly reason: string;
    };

type CentralEntry = {
  readonly name: string;
  readonly normalizedName: string;
  readonly flags: number;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly crc32: number;
  readonly localHeaderOffset: number;
  readonly dataStart: number;
  readonly dataEnd: number;
  readonly physicalEnd: number;
};

type OrderedXmlNode = Record<string, unknown>;

const decoder = new TextDecoder('utf-8', { fatal: true });
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const WORDPROCESSINGML_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XINCLUDE_NAMESPACE = 'http://www.w3.org/2001/XInclude';
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;

const updateCrc32 = (state: number, bytes: Uint8Array): number => {
  let value = state;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return value >>> 0;
};

class DeflateBits {
  private bitOffset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(count: number): number {
    if (count < 0 || count > 16 || this.bitOffset + count > this.bytes.byteLength * 8)
      throw new Error('Truncated DEFLATE stream');
    let value = 0;
    for (let bit = 0; bit < count; bit += 1) {
      const offset = this.bitOffset + bit;
      value |= ((this.bytes[offset >>> 3]! >>> (offset & 7)) & 1) << bit;
    }
    this.bitOffset += count;
    return value;
  }

  align(): void {
    this.bitOffset = (this.bitOffset + 7) & ~7;
  }

  get byteOffset(): number {
    return Math.ceil(this.bitOffset / 8);
  }
}

type Huffman = {
  readonly byLength: readonly ReadonlyMap<number, number>[];
  readonly maxBits: number;
};

const reverseBits = (value: number, length: number): number => {
  let reversed = 0;
  for (let bit = 0; bit < length; bit += 1) reversed = (reversed << 1) | ((value >>> bit) & 1);
  return reversed;
};

const buildHuffman = (lengths: readonly number[]): Huffman => {
  const maxBits = Math.max(0, ...lengths);
  if (maxBits > 15) throw new Error('Invalid DEFLATE Huffman code length');
  const counts = new Array<number>(maxBits + 1).fill(0);
  for (const length of lengths) {
    if (!Number.isInteger(length) || length < 0 || length > 15)
      throw new Error('Invalid DEFLATE Huffman code length');
    if (length > 0) counts[length] = (counts[length] ?? 0) + 1;
  }
  let available = 1;
  for (let length = 1; length <= maxBits; length += 1) {
    available = available * 2 - (counts[length] ?? 0);
    if (available < 0) throw new Error('Oversubscribed DEFLATE Huffman tree');
  }
  const nextCode = new Array<number>(maxBits + 1).fill(0);
  let code = 0;
  for (let length = 1; length <= maxBits; length += 1) {
    code = (code + (counts[length - 1] ?? 0)) << 1;
    nextCode[length] = code;
  }
  const byLength = Array.from({ length: maxBits + 1 }, () => new Map<number, number>());
  lengths.forEach((length, symbol) => {
    if (length === 0) return;
    const canonical = nextCode[length]!;
    nextCode[length] = canonical + 1;
    byLength[length]!.set(reverseBits(canonical, length), symbol);
  });
  return { byLength, maxBits };
};

const decodeHuffman = (bits: DeflateBits, huffman: Huffman): number => {
  let code = 0;
  for (let length = 1; length <= huffman.maxBits; length += 1) {
    code |= bits.read(1) << (length - 1);
    const symbol = huffman.byLength[length]?.get(code);
    if (symbol !== undefined) return symbol;
  }
  throw new Error('Invalid DEFLATE Huffman symbol');
};

const fixedLiteralLengths = Array.from({ length: 288 }, (_unused, symbol) =>
  symbol <= 143 ? 8 : symbol <= 255 ? 9 : symbol <= 279 ? 7 : 8,
);
const fixedDistanceLengths = new Array<number>(32).fill(5);
const codeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const lengthBases = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const lengthExtra = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const distanceBases = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const distanceExtra = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

const dynamicHuffman = (bits: DeflateBits): readonly [Huffman, Huffman] => {
  const literalCount = bits.read(5) + 257;
  const distanceCount = bits.read(5) + 1;
  const codeLengthCount = bits.read(4) + 4;
  const codeLengths = new Array<number>(19).fill(0);
  for (let index = 0; index < codeLengthCount; index += 1)
    codeLengths[codeLengthOrder[index]!] = bits.read(3);
  const codeLengthHuffman = buildHuffman(codeLengths);
  if (codeLengthHuffman.maxBits === 0) throw new Error('Empty DEFLATE code-length tree');
  const lengths: number[] = [];
  const expected = literalCount + distanceCount;
  while (lengths.length < expected) {
    const symbol = decodeHuffman(bits, codeLengthHuffman);
    if (symbol <= 15) lengths.push(symbol);
    else if (symbol === 16) {
      if (lengths.length === 0) throw new Error('DEFLATE repeat has no previous code length');
      const repeat = bits.read(2) + 3;
      if (lengths.length + repeat > expected)
        throw new Error('DEFLATE code-length repeat overflow');
      lengths.push(...new Array<number>(repeat).fill(lengths.at(-1)!));
    } else if (symbol === 17 || symbol === 18) {
      const repeat = bits.read(symbol === 17 ? 3 : 7) + (symbol === 17 ? 3 : 11);
      if (lengths.length + repeat > expected) throw new Error('DEFLATE zero repeat overflow');
      lengths.push(...new Array<number>(repeat).fill(0));
    } else throw new Error('Invalid DEFLATE code-length symbol');
  }
  const literalLengths = lengths.slice(0, literalCount);
  if (!literalLengths[256]) throw new Error('DEFLATE literal tree has no end-of-block symbol');
  return [buildHuffman(literalLengths), buildHuffman(lengths.slice(literalCount))];
};

const rawDeflateTerminalBytes = (bytes: Uint8Array): number => {
  const bits = new DeflateBits(bytes);
  let outputBytes = 0;
  let final = 0;
  while (!final) {
    final = bits.read(1);
    const blockType = bits.read(2);
    if (blockType === 0) {
      bits.align();
      const length = bits.read(16);
      const inverse = bits.read(16);
      if (((length ^ 0xffff) & 0xffff) !== inverse) throw new Error('Invalid DEFLATE LEN/NLEN');
      for (let index = 0; index < length; index += 1) bits.read(8);
      outputBytes += length;
      continue;
    }
    if (blockType === 3) throw new Error('Reserved DEFLATE block type');
    const [literalHuffman, distanceHuffman] =
      blockType === 1
        ? [buildHuffman(fixedLiteralLengths), buildHuffman(fixedDistanceLengths)]
        : dynamicHuffman(bits);
    for (;;) {
      const symbol = decodeHuffman(bits, literalHuffman);
      if (symbol < 256) {
        outputBytes += 1;
        continue;
      }
      if (symbol === 256) break;
      if (symbol < 257 || symbol > 285) throw new Error('Invalid DEFLATE length symbol');
      const lengthIndex = symbol - 257;
      const matchLength = lengthBases[lengthIndex]! + bits.read(lengthExtra[lengthIndex]!);
      const distanceSymbol = decodeHuffman(bits, distanceHuffman);
      if (distanceSymbol > 29) throw new Error('Invalid DEFLATE distance symbol');
      const distance = distanceBases[distanceSymbol]! + bits.read(distanceExtra[distanceSymbol]!);
      if (distance < 1 || distance > outputBytes)
        throw new Error('Invalid DEFLATE backward distance');
      outputBytes += matchLength;
    }
  }
  return bits.byteOffset;
};

const containsZip64Extra = (bytes: Uint8Array, offset: number, length: number): boolean => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = offset + length;
  while (offset < end) {
    if (offset + 4 > end) throw new Error('Malformed ZIP extra field');
    const id = view.getUint16(offset, true);
    const size = view.getUint16(offset + 2, true);
    offset += 4;
    if (offset + size > end) throw new Error('Malformed ZIP extra field');
    if (id === 1) return true;
    offset += size;
  }
  return false;
};

const decodeXmlCharacterReferences = (value: string): string =>
  value.replace(
    /&#(?:x([0-9a-f]+)|(\d+));/giu,
    (_match, hex: string | undefined, decimal: string | undefined) =>
      String.fromCodePoint(Number.parseInt(hex ?? decimal ?? '0', hex ? 16 : 10)),
  );

const failure = (errorCode: IntakeErrorCode, reason: string): DocxExtractionResult => ({
  status: 'FAILURE',
  errorCode,
  reason,
});

const safeZipLogicalName = (name: string): string => {
  let decoded: string;
  try {
    decoded = decodeURIComponent(name).normalize('NFC');
  } catch {
    throw new Error('Invalid encoded ZIP entry path');
  }
  if (
    decoded.includes('\\') ||
    decoded.startsWith('/') ||
    decoded.startsWith('//') ||
    /^[a-z]:\//iu.test(decoded) ||
    decoded.split('/').some((segment) => segment === '..')
  )
    throw new Error('Unsafe ZIP entry path');
  return decoded;
};

const findEndOfCentralDirectory = (view: DataView): number => {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1)
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  return -1;
};

const readCentralDirectory = (sourceBytes: Uint8Array): CentralEntry[] => {
  const view = new DataView(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  if (eocdOffset < 0) throw new Error('ZIP end-of-central-directory record is missing');
  if (view.getUint16(eocdOffset + 4, true) !== 0 || view.getUint16(eocdOffset + 6, true) !== 0)
    throw new Error('Multi-disk ZIP archives are not supported');
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralSize = view.getUint32(eocdOffset + 12, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const commentLength = view.getUint16(eocdOffset + 20, true);
  if (entriesOnDisk !== entryCount) throw new Error('Inconsistent ZIP entry count');
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff)
    throw new Error('ZIP64 archives are not supported');
  if (eocdOffset + 22 + commentLength !== sourceBytes.byteLength)
    throw new Error('Trailing or truncated ZIP data');
  if (centralOffset + centralSize !== eocdOffset)
    throw new Error('Invalid ZIP central-directory bounds');

  const entries: CentralEntry[] = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > eocdOffset || view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE)
      throw new Error('Invalid ZIP central-directory entry');
    const flags = view.getUint16(offset + 8, true);
    const compressionMethod = view.getUint16(offset + 10, true);
    const crc32 = view.getUint32(offset + 16, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const entryCommentLength = view.getUint16(offset + 32, true);
    const diskStart = view.getUint16(offset + 34, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameLength + extraLength + entryCommentLength;
    if (nextOffset > eocdOffset || diskStart !== 0)
      throw new Error('Invalid ZIP central-directory entry bounds');
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    )
      throw new Error('ZIP64 entries are not supported');
    const centralNameBytes = sourceBytes.subarray(offset + 46, offset + 46 + nameLength);
    const centralExtraOffset = offset + 46 + nameLength;
    if (containsZip64Extra(sourceBytes, centralExtraOffset, extraLength))
      throw new Error('ZIP64 extra fields are not supported');
    const name = decoder.decode(centralNameBytes);
    const normalizedName = safeZipLogicalName(name);
    if (localHeaderOffset + 30 > centralOffset) throw new Error('Invalid local ZIP header offset');
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_SIGNATURE)
      throw new Error('Invalid local ZIP header');
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(localHeaderOffset + 22, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const localNameOffset = localHeaderOffset + 30;
    const localExtraOffset = localNameOffset + localNameLength;
    if (localExtraOffset + localExtraLength > centralOffset)
      throw new Error('Invalid local ZIP header fields');
    if (containsZip64Extra(sourceBytes, localExtraOffset, localExtraLength))
      throw new Error('ZIP64 extra fields are not supported');
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > centralOffset || dataEnd > centralOffset)
      throw new Error('Invalid ZIP entry data bounds');
    const localNameBytes = sourceBytes.subarray(localNameOffset, localNameOffset + localNameLength);
    const sameRawName =
      localNameBytes.byteLength === centralNameBytes.byteLength &&
      localNameBytes.every((value, index) => value === centralNameBytes[index]);
    const descriptorMode = (flags & 8) !== 0;
    if (
      localFlags !== flags ||
      localMethod !== compressionMethod ||
      !sameRawName ||
      (descriptorMode
        ? localCrc32 !== 0 || localCompressedSize !== 0 || localUncompressedSize !== 0
        : localCrc32 !== crc32 ||
          localCompressedSize !== compressedSize ||
          localUncompressedSize !== uncompressedSize)
    )
      throw new Error('ZIP local and central headers disagree');
    entries.push({
      name,
      normalizedName,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      crc32,
      localHeaderOffset,
      dataStart,
      dataEnd,
      physicalEnd: dataEnd,
    });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) throw new Error('ZIP central-directory size does not match entries');
  const ranges = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  const physicalEnds = new Map<number, number>();
  for (const [index, entry] of ranges.entries()) {
    const boundary =
      index + 1 < ranges.length ? ranges[index + 1]!.localHeaderOffset : centralOffset;
    if (entry.dataEnd > boundary) throw new Error('Overlapping ZIP entry ranges');
    if ((entry.flags & 8) === 0) {
      if (entry.dataEnd !== boundary) throw new Error('Gap after ZIP entry data');
      physicalEnds.set(entry.localHeaderOffset, entry.dataEnd);
      continue;
    }
    const signed =
      entry.dataEnd + 16 === boundary &&
      view.getUint32(entry.dataEnd, true) === DATA_DESCRIPTOR_SIGNATURE &&
      view.getUint32(entry.dataEnd + 4, true) === entry.crc32 &&
      view.getUint32(entry.dataEnd + 8, true) === entry.compressedSize &&
      view.getUint32(entry.dataEnd + 12, true) === entry.uncompressedSize;
    const unsigned =
      entry.dataEnd + 12 === boundary &&
      view.getUint32(entry.dataEnd, true) === entry.crc32 &&
      view.getUint32(entry.dataEnd + 4, true) === entry.compressedSize &&
      view.getUint32(entry.dataEnd + 8, true) === entry.uncompressedSize;
    if (Number(signed) + Number(unsigned) !== 1)
      throw new Error('Invalid or ambiguous ZIP data descriptor');
    physicalEnds.set(entry.localHeaderOffset, boundary);
  }
  return entries.map((entry) => ({
    ...entry,
    physicalEnd: physicalEnds.get(entry.localHeaderOffset)!,
  }));
};

const xmlParser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: false,
  processEntities: true,
});

const elementEntries = (node: OrderedXmlNode): [string, unknown[]][] =>
  Object.entries(node).filter(
    (entry): entry is [string, unknown[]] =>
      entry[0] !== ':@' && !entry[0].startsWith('?') && Array.isArray(entry[1]),
  );

const namespaceEnvironment = (
  node: OrderedXmlNode,
  parent: ReadonlyMap<string, string>,
): ReadonlyMap<string, string> => {
  const namespaces = new Map(parent);
  const attributes = node[':@'];
  if (attributes && typeof attributes === 'object')
    for (const [name, attributeValue] of Object.entries(attributes as OrderedXmlNode)) {
      if (typeof attributeValue !== 'string') continue;
      const decodedValue = decodeXmlCharacterReferences(attributeValue);
      if (name === '@_xmlns') namespaces.set('', decodedValue);
      else if (name.startsWith('@_xmlns:')) namespaces.set(name.slice(8), decodedValue);
    }
  return namespaces;
};

const semanticName = (
  qualifiedName: string,
  namespaces: ReadonlyMap<string, string>,
): { readonly namespace: string | undefined; readonly localName: string } => {
  const separator = qualifiedName.indexOf(':');
  const prefix = separator < 0 ? '' : qualifiedName.slice(0, separator);
  return {
    namespace: namespaces.get(prefix),
    localName: separator < 0 ? qualifiedName : qualifiedName.slice(separator + 1),
  };
};

const containsXInclude = (
  nodes: readonly unknown[],
  parentNamespaces: ReadonlyMap<string, string> = new Map(),
): boolean => {
  const visit = (value: unknown, inherited: ReadonlyMap<string, string>): boolean => {
    if (Array.isArray(value)) return value.some((child) => visit(child, inherited));
    if (value === null || typeof value !== 'object') return false;
    const node = value as OrderedXmlNode;
    const namespaces = namespaceEnvironment(node, inherited);
    return elementEntries(node).some(([name, children]) => {
      const semantic = semanticName(name, namespaces);
      return (
        (semantic.namespace === XINCLUDE_NAMESPACE &&
          (semantic.localName === 'include' || semantic.localName === 'fallback')) ||
        visit(children, namespaces)
      );
    });
  };
  return visit(nodes, parentNamespaces);
};

const singleElement = (
  values: readonly unknown[],
  parentNamespaces: ReadonlyMap<string, string>,
): {
  readonly name: string;
  readonly children: readonly unknown[];
  readonly namespaces: ReadonlyMap<string, string>;
} | null => {
  const elements = values.flatMap((value) => {
    if (value === null || typeof value !== 'object') return [];
    const node = value as OrderedXmlNode;
    const namespaces = namespaceEnvironment(node, parentNamespaces);
    return elementEntries(node).map(([name, children]) => ({ name, children, namespaces }));
  });
  return elements.length === 1 ? elements[0]! : null;
};

const hasNonWhitespaceDirectText = (values: readonly unknown[]): boolean =>
  values.some(
    (value) =>
      value !== null &&
      typeof value === 'object' &&
      typeof (value as OrderedXmlNode)['#text'] === 'string' &&
      ((value as OrderedXmlNode)['#text'] as string).trim().length > 0,
  );

const parseParagraphs = (documentXml: string): readonly string[] | null => {
  const parsed = xmlParser.parse(documentXml) as OrderedXmlNode[];
  if (containsXInclude(parsed)) return null;
  const rootElement = singleElement(parsed, new Map());
  if (!rootElement) return null;
  const root = semanticName(rootElement.name, rootElement.namespaces);
  if (root.namespace !== WORDPROCESSINGML_NAMESPACE || root.localName !== 'document') return null;
  if (hasNonWhitespaceDirectText(rootElement.children)) return null;
  const bodyElement = singleElement(rootElement.children, rootElement.namespaces);
  if (!bodyElement) return null;
  const body = semanticName(bodyElement.name, bodyElement.namespaces);
  if (body.namespace !== WORDPROCESSINGML_NAMESPACE || body.localName !== 'body') return null;
  if (hasNonWhitespaceDirectText(bodyElement.children)) return null;

  const paragraphs: string[] = [];
  const bodyElements = bodyElement.children.flatMap((value) => {
    if (value === null || typeof value !== 'object') return [];
    const node = value as OrderedXmlNode;
    const namespaces = namespaceEnvironment(node, bodyElement.namespaces);
    return elementEntries(node).map(([name, children]) => ({ name, children, namespaces }));
  });
  for (const [elementIndex, bodyChild] of bodyElements.entries()) {
    const element = semanticName(bodyChild.name, bodyChild.namespaces);
    if (element.namespace !== WORDPROCESSINGML_NAMESPACE) return null;
    if (element.localName === 'sectPr') {
      if (
        elementIndex !== bodyElements.length - 1 ||
        hasNonWhitespaceDirectText(bodyChild.children) ||
        bodyChild.children.some(
          (child) =>
            child !== null &&
            typeof child === 'object' &&
            elementEntries(child as OrderedXmlNode).length > 0,
        )
      )
        return null;
      continue;
    }
    if (element.localName !== 'p') return null;
    if (hasNonWhitespaceDirectText(bodyChild.children)) return null;
    const parts: string[] = [];
    for (const runValue of bodyChild.children) {
      if (runValue === null || typeof runValue !== 'object') continue;
      const runNode = runValue as OrderedXmlNode;
      const runNamespaces = namespaceEnvironment(runNode, bodyChild.namespaces);
      const runs = elementEntries(runNode);
      if (runs.length === 0) continue;
      if (runs.length !== 1) return null;
      const [runName, runChildren] = runs[0]!;
      const run = semanticName(runName, runNamespaces);
      if (run.namespace !== WORDPROCESSINGML_NAMESPACE || run.localName !== 'r') return null;
      if (hasNonWhitespaceDirectText(runChildren)) return null;
      for (const textValue of runChildren) {
        if (textValue === null || typeof textValue !== 'object') continue;
        const textNode = textValue as OrderedXmlNode;
        const textNamespaces = namespaceEnvironment(textNode, runNamespaces);
        const texts = elementEntries(textNode);
        if (texts.length === 0) continue;
        if (texts.length !== 1) return null;
        const [textName, textChildren] = texts[0]!;
        const text = semanticName(textName, textNamespaces);
        if (text.namespace !== WORDPROCESSINGML_NAMESPACE || text.localName !== 't') return null;
        for (const child of textChildren) {
          if (child === null || typeof child !== 'object') continue;
          if (elementEntries(child as OrderedXmlNode).length > 0) return null;
          if (typeof (child as OrderedXmlNode)['#text'] === 'string')
            parts.push((child as OrderedXmlNode)['#text'] as string);
        }
      }
    }
    paragraphs.push(parts.join(''));
  }
  return paragraphs;
};

const boundedUnzip = (
  sourceBytes: Uint8Array,
  entries: readonly CentralEntry[],
): {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly checks: Readonly<Record<string, { readonly size: number; readonly crc32: number }>>;
  readonly errorCode: IntakeErrorCode | null;
} => {
  const files: Record<string, Uint8Array> = {};
  const checks: Record<string, { readonly size: number; readonly crc32: number }> = {};
  let totalOutputBytes = 0;
  let limitError: IntakeErrorCode | null = null;
  for (const entry of entries) {
    const chunks: Uint8Array[] = [];
    let entryOutputBytes = 0;
    let crcState = 0xffffffff;
    const decoder = entry.compressionMethod === 0 ? new UnzipPassThrough() : new UnzipInflate();
    decoder.ondata = (error, chunk, final) => {
      if (error) {
        limitError = 'INVALID_DOCX_CONTAINER';
        return;
      }
      if (limitError) return;
      entryOutputBytes += chunk.byteLength;
      totalOutputBytes += chunk.byteLength;
      crcState = updateCrc32(crcState, chunk);
      if (entry.name === 'word/document.xml' && entryOutputBytes > MAX_DOCUMENT_XML_BYTES)
        limitError = 'DOCUMENT_XML_TOO_LARGE';
      else if (entryOutputBytes > MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES)
        limitError = 'ZIP_ENTRY_TOO_LARGE';
      else if (totalOutputBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
        limitError = 'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED';
      if (limitError) {
        return;
      }
      if (chunk.byteLength > 0) chunks.push(chunk.slice());
      if (final) {
        const bytes = new Uint8Array(entryOutputBytes);
        let offset = 0;
        for (const part of chunks) {
          bytes.set(part, offset);
          offset += part.byteLength;
        }
        files[entry.name] = bytes;
        checks[entry.name] = { size: entryOutputBytes, crc32: (crcState ^ 0xffffffff) >>> 0 };
      }
    };
    const compressed = sourceBytes.subarray(entry.dataStart, entry.dataEnd);
    for (let offset = 0; offset < compressed.byteLength && !limitError; offset += 256) {
      const end = Math.min(offset + 256, compressed.byteLength);
      decoder.push(compressed.subarray(offset, end), end === compressed.byteLength);
    }
    if (compressed.byteLength === 0 && !limitError) decoder.push(new Uint8Array(), true);
    if (limitError) break;
  }
  return { files, checks, errorCode: limitError };
};

const validateCompressedStreams = (sourceBytes: Uint8Array, entries: readonly CentralEntry[]) => {
  for (const entry of entries) {
    const compressed = sourceBytes.subarray(entry.dataStart, entry.dataEnd);
    if (compressed.byteLength !== entry.compressedSize)
      throw new Error('ZIP compressed slice length mismatch');
    if (entry.compressionMethod === 0) {
      if (entry.compressedSize !== entry.uncompressedSize)
        throw new Error('Stored ZIP entry size mismatch');
      continue;
    }
    if (rawDeflateTerminalBytes(compressed) !== entry.compressedSize)
      throw new Error('DEFLATE stream has trailing compressed bytes');
  }
};

export const extractDocxSeedRecords = (sourceBytes: Uint8Array): DocxExtractionResult => {
  if (sourceBytes.byteLength > MAX_SOURCE_ARTIFACT_BYTES)
    return failure('SOURCE_ARTIFACT_TOO_LARGE', 'DOCX source artifact exceeds the byte limit');

  let entries: readonly CentralEntry[];
  try {
    entries = readCentralDirectory(sourceBytes);
  } catch {
    return failure('INVALID_DOCX_CONTAINER', 'Source bytes are not a supported DOCX ZIP container');
  }
  if (entries.length > MAX_ZIP_ENTRY_COUNT)
    return failure('ZIP_ENTRY_LIMIT_EXCEEDED', 'DOCX ZIP contains too many entries');
  if (entries.some((entry) => (entry.flags & 1) !== 0))
    return failure('INVALID_DOCX_CONTAINER', 'Encrypted DOCX ZIP entries are not supported');
  if (entries.some((entry) => entry.compressionMethod !== 0 && entry.compressionMethod !== 8))
    return failure('INVALID_DOCX_CONTAINER', 'DOCX ZIP uses an unsupported compression method');

  try {
    validateCompressedStreams(sourceBytes, entries);
  } catch {
    return failure('INVALID_DOCX_CONTAINER', 'DOCX ZIP compressed stream is invalid');
  }

  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(entry.normalizedName))
      return failure('INVALID_DOCX_CONTAINER', 'DOCX ZIP contains duplicate entry names');
    names.add(entry.normalizedName);
  }
  const documents = entries.filter((entry) => entry.name === 'word/document.xml');
  if (documents.length === 0)
    return failure('DOCUMENT_XML_MISSING', 'DOCX word/document.xml is missing');
  if (documents.length !== 1)
    return failure('INVALID_DOCX_CONTAINER', 'DOCX contains duplicate word/document.xml entries');
  const documentEntry = documents[0]!;
  if (documentEntry.uncompressedSize > MAX_DOCUMENT_XML_BYTES)
    return failure('DOCUMENT_XML_TOO_LARGE', 'DOCX word/document.xml exceeds the byte limit');
  if (entries.some((entry) => entry.uncompressedSize > MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES))
    return failure('ZIP_ENTRY_TOO_LARGE', 'A DOCX ZIP entry exceeds the uncompressed byte limit');
  const totalUncompressedBytes = entries.reduce(
    (total, entry) => total + entry.uncompressedSize,
    0,
  );
  if (totalUncompressedBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
    return failure(
      'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED',
      'DOCX ZIP exceeds the total uncompressed byte limit',
    );

  const unsupportedPart = entries.some((entry) =>
    /^word\/(?:header\d*|footer\d*|footnotes|endnotes|comments[^/]*)\.xml$/u.test(entry.name),
  );
  if (unsupportedPart)
    return failure('UNSUPPORTED_DOCX_STRUCTURE', 'DOCX contains an unsupported content part');

  let unzipped: Readonly<Record<string, Uint8Array>>;
  let checks: Readonly<Record<string, { readonly size: number; readonly crc32: number }>>;
  try {
    const extraction = boundedUnzip(sourceBytes, entries);
    if (extraction.errorCode)
      return failure(extraction.errorCode, 'DOCX ZIP actual decompressed output exceeds a limit');
    unzipped = extraction.files;
    checks = extraction.checks;
  } catch {
    return failure('INVALID_DOCX_CONTAINER', 'DOCX ZIP entries could not be read completely');
  }
  for (const entry of entries) {
    const check = checks[entry.name];
    if (!check || check.size !== entry.uncompressedSize || check.crc32 !== entry.crc32)
      return failure(
        'INVALID_DOCX_CONTAINER',
        'DOCX ZIP actual output does not match central directory',
      );
  }
  const documentBytes = unzipped['word/document.xml'];
  if (!documentBytes || documentBytes.byteLength !== documentEntry.uncompressedSize)
    return failure('INVALID_DOCX_CONTAINER', 'DOCX word/document.xml could not be read completely');

  for (const [name, bytes] of Object.entries(unzipped)) {
    if (!name.endsWith('.rels')) continue;
    let relationships: string;
    try {
      relationships = decoder.decode(bytes);
    } catch {
      return failure('INVALID_DOCX_CONTAINER', 'DOCX relationships are not valid UTF-8 XML');
    }
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(relationships))
      return failure('UNSAFE_XML_STRUCTURE', 'DOCX relationships contain forbidden declarations');
    try {
      const parsed = xmlParser.parse(relationships) as OrderedXmlNode[];
      const hasExternal = (value: unknown): boolean => {
        if (Array.isArray(value)) return value.some(hasExternal);
        if (value === null || typeof value !== 'object') return false;
        const node = value as OrderedXmlNode;
        const attributes = node[':@'];
        if (
          attributes &&
          typeof attributes === 'object' &&
          Object.entries(attributes as OrderedXmlNode).some(
            ([key, attribute]) =>
              key.replace(/^@_/u, '').split(':').at(-1) === 'TargetMode' &&
              typeof attribute === 'string' &&
              decodeXmlCharacterReferences(attribute).toLowerCase() === 'external',
          )
        )
          return true;
        return Object.entries(node).some(([key, child]) => key !== ':@' && hasExternal(child));
      };
      if (hasExternal(parsed))
        return failure(
          'UNSUPPORTED_DOCX_STRUCTURE',
          'External DOCX relationships are not supported',
        );
    } catch {
      return failure('INVALID_DOCX_CONTAINER', 'DOCX relationships are malformed XML');
    }
  }

  let documentXml: string;
  try {
    documentXml = decoder.decode(documentBytes);
  } catch {
    return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml is not valid UTF-8');
  }
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/iu.test(documentXml))
    return failure('UNSAFE_XML_STRUCTURE', 'DOCX XML contains a forbidden external-load construct');
  if (XMLValidator.validate(documentXml) !== true)
    return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml is malformed');
  let paragraphRawTexts: readonly string[] | null;
  try {
    paragraphRawTexts = parseParagraphs(documentXml);
  } catch {
    return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml could not be traversed');
  }
  if (!paragraphRawTexts) {
    try {
      const parsed = xmlParser.parse(documentXml) as OrderedXmlNode[];
      if (containsXInclude(parsed))
        return failure('UNSAFE_XML_STRUCTURE', 'DOCX XML contains an XInclude construct');
    } catch {
      return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml could not be traversed');
    }
    return failure(
      'UNSUPPORTED_DOCX_STRUCTURE',
      'DOCX does not match the supported document structure',
    );
  }

  const extractedTextArtifactSha256 = checksumSourceArtifact(
    new TextEncoder().encode(`${JSON.stringify(paragraphRawTexts)}\n`),
  );
  return {
    status: 'SUCCESS',
    docxExtractionVersion: DOCX_EXTRACTION_VERSION,
    paragraphRawTexts,
    extractedTextArtifactSha256,
  };
};
