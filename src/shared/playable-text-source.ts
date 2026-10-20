const originalText = new WeakMap<Text, string>();

export function setPlayableOriginalText(node: Text, value: string): void {
  originalText.set(node, value);
}

export function playableOriginalText(node: Text): string {
  return originalText.get(node) ?? node.nodeValue ?? "";
}
