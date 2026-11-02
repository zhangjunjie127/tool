import {
  fingerprint,
  parseScreenplayText,
  type ParsedPlayableStoryTree,
} from "../shared/playable-story-tree.js";
import { t } from "./i18n.js";

const DOCX_ENTRY = "word/document.xml";
const MAX_DOCX_BYTES = 25 * 1024 * 1024;
const MAX_DOCX_XML_BYTES = 50 * 1024 * 1024;
const WORDPROCESSINGML_NAMESPACES = new Set([
  "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
  "http://purl.oclc.org/ooxml/wordprocessingml/main",
]);

export async function importPlayableScreenplay(
  file: File,
): Promise<ParsedPlayableStoryTree> {
  if (file.size > MAX_DOCX_BYTES) {
    throw new Error(t("storyTree.errorFileTooLarge"));
  }
  const paragraphs = file.name.toLowerCase().endsWith(".docx")
    ? await readDocxParagraphs(new Uint8Array(await file.arrayBuffer()))
    : file.name.toLowerCase().endsWith(".txt")
      ? (await file.text()).split(/\r?\n/u)
      : undefined;
  if (!paragraphs) {
    throw new Error(t("storyTree.errorUnsupportedFile"));
  }
  const parsed = parseScreenplayText(paragraphs, file.name);
  parsed.tree.source = {
    fileName: file.name,
    fingerprint: fingerprint(paragraphs.join("\n")),
  };
  return parsed;
}

async function readDocxParagraphs(bytes: Uint8Array): Promise<string[]> {
  const xmlBytes = await readZipEntry(bytes, DOCX_ENTRY);
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(xmlBytes);
  return parseDocxDocumentXml(xml);
}

export function parseDocxDocumentXml(xml: string): string[] {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error(t("storyTree.errorInvalidDocument"));
  }
  const wordNamespace = document.documentElement.namespaceURI;
  if (!wordNamespace || !WORDPROCESSINGML_NAMESPACES.has(wordNamespace)) {
    throw new Error(t("storyTree.errorInvalidDocument"));
  }
  const elements = Array.from(document.getElementsByTagName("*"));
  return elements
    .filter((element) => element.localName === "p" && element.namespaceURI === wordNamespace)
    .map((paragraph) => {
      const parts: string[] = [];
      for (const child of Array.from(paragraph.getElementsByTagName("*"))) {
        if (child.namespaceURI !== wordNamespace) continue;
        switch (child.localName) {
          case "t":
            parts.push(child.textContent ?? "");
            break;
          case "tab":
            parts.push("\t");
            break;
          case "br":
          case "cr":
            parts.push("\n");
            break;
        }
      }
      return parts.join("");
    })
}

async function readZipEntry(
  bytes: Uint8Array,
  requestedName: string,
): Promise<Uint8Array> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  if (endOffset < 0) throw new Error(t("storyTree.errorInvalidZip"));

  const entryCount = view.getUint16(endOffset + 10, true);
  const directoryOffset = view.getUint32(endOffset + 16, true);
  const decoder = new TextDecoder();
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > view.byteLength) break;
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    if (offset + 46 + nameLength + extraLength + commentLength > view.byteLength) break;
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (name === requestedName) {
      if (flags & 0x0001) throw new Error(t("storyTree.errorEncryptedDocument"));
      if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
        throw new Error(t("storyTree.errorZip64"));
      }
      if (uncompressedSize > MAX_DOCX_XML_BYTES) {
        throw new Error(t("storyTree.errorDocumentTooLarge"));
      }
      if (localOffset + 30 > view.byteLength || compressedSize > view.byteLength) {
        throw new Error(t("storyTree.errorInvalidZip"));
      }
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      if (dataOffset + compressedSize > view.byteLength) {
        throw new Error(t("storyTree.errorInvalidZip"));
      }
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      if (method === 0) {
        if (compressed.byteLength !== uncompressedSize) {
          throw new Error(t("storyTree.errorInvalidZip"));
        }
        return compressed.slice();
      }
      if (method !== 8) throw new Error(t("storyTree.errorUnsupportedCompression"));
      if (typeof DecompressionStream === "undefined") {
        throw new Error(t("storyTree.errorDecompressionUnavailable"));
      }
      try {
        const compressedCopy = new ArrayBuffer(compressed.byteLength);
        new Uint8Array(compressedCopy).set(compressed);
        const stream = new Blob([compressedCopy]).stream().pipeThrough(
          new DecompressionStream("deflate-raw"),
        );
        const expanded = new Uint8Array(await new Response(stream).arrayBuffer());
        if (expanded.byteLength !== uncompressedSize) {
          throw new Error(t("storyTree.errorDecompressionFailed"));
        }
        return expanded;
      } catch {
        throw new Error(t("storyTree.errorDecompressionFailed"));
      }
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(t("storyTree.errorMissingDocument"));
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (
      view.getUint32(offset, true) === 0x06054b50 &&
      offset + 22 + view.getUint16(offset + 20, true) === view.byteLength
    ) return offset;
  }
  return -1;
}
