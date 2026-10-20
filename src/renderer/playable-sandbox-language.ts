import { setPlayableOriginalText } from "../shared/playable-text-source.js";

export function translateSandboxTextNodes(
  root: Node,
  translate: (value: string) => string,
  originals: WeakMap<Text, string>,
): void {
  const document = root.nodeType === 9
    ? root as Document
    : root.ownerDocument!;
  const walker = document.createTreeWalker(
    root,
    document.defaultView?.NodeFilter.SHOW_TEXT ?? 4,
  );
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (
      !parent ||
      parent.closest("script, style, code, pre, textarea, input, [contenteditable]")
    )
      continue;
    const text = node as Text;
    const source = originals.get(text) ?? text.nodeValue ?? "";
    originals.set(text, source);
    setPlayableOriginalText(text, source);
    const next = translate(source);
    if (text.nodeValue !== next) text.nodeValue = next;
  }
}
