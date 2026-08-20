import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate';
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
};

type OrderedXmlNode = Record<string, unknown>;

const decoder = new TextDecoder('utf-8', { fatal: true });
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;
const WORDPROCESSINGML_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XINCLUDE_NAMESPACE = 'http://www.w3.org/2001/XInclude';

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
    const name = decoder.decode(sourceBytes.subarray(offset + 46, offset + 46 + nameLength));
    const normalizedName = safeZipLogicalName(name);
    if (localHeaderOffset + 30 > centralOffset) throw new Error('Invalid local ZIP header offset');
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_SIGNATURE)
      throw new Error('Invalid local ZIP header');
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    if ((flags & 8) !== 0) throw new Error('ZIP data descriptors are not supported');
    const localCrc32 = view.getUint32(localHeaderOffset + 14, true);
    const localCompressedSize = view.getUint32(localHeaderOffset + 18, true);
    const localUncompressedSize = view.getUint32(localHeaderOffset + 22, true);
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataStart > centralOffset || dataEnd > centralOffset)
      throw new Error('Invalid ZIP entry data bounds');
    const localName = decoder.decode(
      sourceBytes.subarray(localHeaderOffset + 30, localHeaderOffset + 30 + localNameLength),
    );
    if (
      localFlags !== flags ||
      localMethod !== compressionMethod ||
      localCrc32 !== crc32 ||
      localCompressedSize !== compressedSize ||
      localUncompressedSize !== uncompressedSize ||
      localName !== name
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
    });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) throw new Error('ZIP central-directory size does not match entries');
  const ranges = [...entries].sort(
    (left, right) => left.localHeaderOffset - right.localHeaderOffset,
  );
  for (let index = 1; index < ranges.length; index += 1)
    if (ranges[index]!.localHeaderOffset < ranges[index - 1]!.dataEnd)
      throw new Error('Overlapping ZIP entry ranges');
  return entries;
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

const parseParagraphs = (documentXml: string): readonly string[] | null => {
  const parsed = xmlParser.parse(documentXml) as OrderedXmlNode[];
  if (containsXInclude(parsed)) return null;
  const rootElement = singleElement(parsed, new Map());
  if (!rootElement) return null;
  const root = semanticName(rootElement.name, rootElement.namespaces);
  if (root.namespace !== WORDPROCESSINGML_NAMESPACE || root.localName !== 'document') return null;
  const bodyElement = singleElement(rootElement.children, rootElement.namespaces);
  if (!bodyElement) return null;
  const body = semanticName(bodyElement.name, bodyElement.namespaces);
  if (body.namespace !== WORDPROCESSINGML_NAMESPACE || body.localName !== 'body') return null;

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
): {
  readonly files: Readonly<Record<string, Uint8Array>>;
  readonly errorCode: IntakeErrorCode | null;
} => {
  const files: Record<string, Uint8Array> = {};
  let totalOutputBytes = 0;
  let limitError: IntakeErrorCode | null = null;
  const unzip = new Unzip((file) => {
    const chunks: Uint8Array[] = [];
    let entryOutputBytes = 0;
    file.ondata = (error, chunk, final) => {
      if (error || limitError) return;
      entryOutputBytes += chunk.byteLength;
      totalOutputBytes += chunk.byteLength;
      if (file.name === 'word/document.xml' && entryOutputBytes > MAX_DOCUMENT_XML_BYTES)
        limitError = 'DOCUMENT_XML_TOO_LARGE';
      else if (entryOutputBytes > MAX_SINGLE_UNCOMPRESSED_ENTRY_BYTES)
        limitError = 'ZIP_ENTRY_TOO_LARGE';
      else if (totalOutputBytes > MAX_TOTAL_UNCOMPRESSED_BYTES)
        limitError = 'ZIP_TOTAL_UNCOMPRESSED_LIMIT_EXCEEDED';
      if (limitError) {
        file.terminate();
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
        files[file.name] = bytes;
      }
    };
    file.start();
  });
  unzip.register(UnzipPassThrough);
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < sourceBytes.byteLength && !limitError; offset += 256)
    unzip.push(sourceBytes.subarray(offset, Math.min(offset + 256, sourceBytes.byteLength)), false);
  if (!limitError) unzip.push(new Uint8Array(), true);
  return { files, errorCode: limitError };
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
  try {
    const extraction = boundedUnzip(sourceBytes);
    if (extraction.errorCode)
      return failure(extraction.errorCode, 'DOCX ZIP actual decompressed output exceeds a limit');
    unzipped = extraction.files;
  } catch {
    return failure('INVALID_DOCX_CONTAINER', 'DOCX ZIP entries could not be read completely');
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
