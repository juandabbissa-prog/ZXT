import { unzipSync } from 'fflate';
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
  readonly flags: number;
  readonly compressionMethod: number;
  readonly compressedSize: number;
  readonly uncompressedSize: number;
  readonly localHeaderOffset: number;
};

type OrderedXmlNode = Record<string, unknown>;

const decoder = new TextDecoder('utf-8', { fatal: true });
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const LOCAL_FILE_SIGNATURE = 0x04034b50;

const failure = (errorCode: IntakeErrorCode, reason: string): DocxExtractionResult => ({
  status: 'FAILURE',
  errorCode,
  reason,
});

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
    if (name.includes('\\') || name.startsWith('/') || name.split('/').includes('..'))
      throw new Error('Unsafe ZIP entry path');
    if (localHeaderOffset + 30 > centralOffset) throw new Error('Invalid local ZIP header offset');
    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_SIGNATURE)
      throw new Error('Invalid local ZIP header');
    const localFlags = view.getUint16(localHeaderOffset + 6, true);
    const localMethod = view.getUint16(localHeaderOffset + 8, true);
    if (localFlags !== flags || localMethod !== compressionMethod)
      throw new Error('ZIP local and central headers disagree');
    entries.push({
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    offset = nextOffset;
  }
  if (offset !== eocdOffset) throw new Error('ZIP central-directory size does not match entries');
  return entries;
};

const nodeEntry = (node: OrderedXmlNode, name: string): unknown[] | null => {
  const value = node[name];
  return Array.isArray(value) ? value : null;
};

const hasUnsupportedXmlNode = (nodes: readonly unknown[]): boolean => {
  const unsupported = new Set([
    'w:tab',
    'w:br',
    'w:cr',
    'w:tbl',
    'w:txbxContent',
    'w:ins',
    'w:del',
    'w:delText',
    'w:instrText',
    'w:fldSimple',
    'w:hyperlink',
    'w:altChunk',
    'w:drawing',
    'w:pict',
    'w:object',
    'w:sdt',
  ]);
  const visit = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.some(visit);
    if (value === null || typeof value !== 'object') return false;
    const node = value as OrderedXmlNode;
    return Object.entries(node).some(
      ([key, child]) => unsupported.has(key) || (key !== ':@' && visit(child)),
    );
  };
  return nodes.some(visit);
};

const textFromParagraph = (paragraphChildren: readonly unknown[]): string => {
  const parts: string[] = [];
  const visit = (value: unknown, insideText = false): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, insideText);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value as OrderedXmlNode)) {
      if (key === '#text' && insideText && typeof child === 'string') parts.push(child);
      else if (key !== ':@') visit(child, insideText || key === 'w:t');
    }
  };
  visit(paragraphChildren);
  return parts.join('');
};

const parseParagraphs = (documentXml: string): readonly string[] | null => {
  if (
    !documentXml.includes(`xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"`)
  )
    return null;
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    trimValues: false,
    processEntities: false,
  });
  const parsed = parser.parse(documentXml) as OrderedXmlNode[];
  const documentNodes = parsed.filter((node) => nodeEntry(node, 'w:document') !== null);
  if (documentNodes.length !== 1) return null;
  const documentChildren = nodeEntry(documentNodes[0]!, 'w:document');
  if (!documentChildren) return null;
  const bodyNodes = documentChildren.filter(
    (node): node is OrderedXmlNode =>
      node !== null &&
      typeof node === 'object' &&
      nodeEntry(node as OrderedXmlNode, 'w:body') !== null,
  );
  if (bodyNodes.length !== 1) return null;
  const bodyChildren = nodeEntry(bodyNodes[0]!, 'w:body');
  if (!bodyChildren || hasUnsupportedXmlNode(bodyChildren)) return null;
  const paragraphs: string[] = [];
  for (const child of bodyChildren) {
    if (child === null || typeof child !== 'object') continue;
    const node = child as OrderedXmlNode;
    const paragraphChildren = nodeEntry(node, 'w:p');
    if (paragraphChildren) paragraphs.push(textFromParagraph(paragraphChildren));
  }
  return paragraphs;
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
    if (names.has(entry.name))
      return failure('INVALID_DOCX_CONTAINER', 'DOCX ZIP contains duplicate entry names');
    names.add(entry.name);
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

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(sourceBytes);
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
    if (/TargetMode\s*=\s*["']External["']/iu.test(relationships))
      return failure('UNSUPPORTED_DOCX_STRUCTURE', 'External DOCX relationships are not supported');
  }

  let documentXml: string;
  try {
    documentXml = decoder.decode(documentBytes);
  } catch {
    return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml is not valid UTF-8');
  }
  if (
    /<!DOCTYPE|<!ENTITY/iu.test(documentXml) ||
    /http:\/\/www\.w3\.org\/2001\/XInclude/iu.test(documentXml)
  )
    return failure('UNSAFE_XML_STRUCTURE', 'DOCX XML contains a forbidden external-load construct');
  if (XMLValidator.validate(documentXml) !== true)
    return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml is malformed');
  if (hasUnsupportedXmlNode(new XMLParser({ preserveOrder: true }).parse(documentXml) as unknown[]))
    return failure('UNSUPPORTED_DOCX_STRUCTURE', 'DOCX XML contains an unsupported structure');

  let paragraphRawTexts: readonly string[] | null;
  try {
    paragraphRawTexts = parseParagraphs(documentXml);
  } catch {
    return failure('MALFORMED_DOCUMENT_XML', 'DOCX word/document.xml could not be traversed');
  }
  if (!paragraphRawTexts)
    return failure(
      'UNSUPPORTED_DOCX_STRUCTURE',
      'DOCX does not match the supported document structure',
    );

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
