export function extractFontFamilies(font: Uint8Array): string[] {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const offsets: number[] = [];
  if (readAscii(font, 0, 4) === "ttcf") {
    if (font.byteLength < 12) return [];
    const count = Math.min(view.getUint32(8), 256);
    for (let index = 0; index < count; index += 1) {
      const position = 12 + index * 4;
      if (position + 4 > font.byteLength) break;
      offsets.push(view.getUint32(position));
    }
  } else offsets.push(0);

  const families = new Set<string>();
  for (const offset of offsets) {
    const family = readFamilyName(font, view, offset);
    if (family) families.add(family);
  }
  return [...families];
}

export function cssFontFamilyName(family: string): string {
  return `"${family
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replace(/[\u0000-\u001f\u007f]/g, "")}"`;
}

function readFamilyName(
  font: Uint8Array,
  view: DataView,
  fontOffset: number,
): string | undefined {
  if (fontOffset + 12 > font.byteLength) return undefined;
  const tableCount = Math.min(view.getUint16(fontOffset + 4), 4096);
  let nameOffset = -1;
  let nameLength = 0;
  for (let index = 0; index < tableCount; index += 1) {
    const record = fontOffset + 12 + index * 16;
    if (record + 16 > font.byteLength) return undefined;
    if (readAscii(font, record, 4) !== "name") continue;
    nameOffset = view.getUint32(record + 8);
    nameLength = view.getUint32(record + 12);
    break;
  }
  if (
    nameOffset < 0 ||
    nameLength < 6 ||
    nameOffset + nameLength > font.byteLength
  )
    return undefined;

  const count = Math.min(view.getUint16(nameOffset + 2), 4096);
  const stringsOffset = view.getUint16(nameOffset + 4);
  const candidates: { family: string; score: number }[] = [];
  for (let index = 0; index < count; index += 1) {
    const record = nameOffset + 6 + index * 12;
    if (record + 12 > nameOffset + nameLength) break;
    const platform = view.getUint16(record);
    const language = view.getUint16(record + 4);
    const nameId = view.getUint16(record + 6);
    if (nameId !== 1 && nameId !== 16) continue;
    const length = view.getUint16(record + 8);
    const stringStart = nameOffset + stringsOffset + view.getUint16(record + 10);
    if (
      !length ||
      stringStart < nameOffset ||
      stringStart + length > nameOffset + nameLength
    )
      continue;
    const family = decodeName(
      font.subarray(stringStart, stringStart + length),
      platform,
    );
    if (!family) continue;
    const score =
      (nameId === 16 ? 100 : 0) +
      (platform === 3 ? 20 : platform === 0 ? 10 : 0) +
      (language === 0x0409 ? 5 : language === 0 ? 2 : 0);
    candidates.push({ family, score });
  }
  return candidates.sort((left, right) => right.score - left.score)[0]?.family;
}

function decodeName(
  value: Uint8Array,
  platform: number,
): string | undefined {
  let decoded: string;
  if (platform === 0 || platform === 3) {
    if (value.byteLength % 2) return undefined;
    decoded = "";
    for (let index = 0; index < value.byteLength; index += 2)
      decoded += String.fromCharCode((value[index]! << 8) | value[index + 1]!);
  } else {
    decoded = new TextDecoder("windows-1252").decode(value);
  }
  const family = decoded.replaceAll("\0", "").trim();
  return family && family.length <= 120 ? family : undefined;
}

function readAscii(value: Uint8Array, start: number, length: number): string {
  let result = "";
  for (let index = start; index < start + length; index += 1)
    result += String.fromCharCode(value[index] ?? 0);
  return result;
}
