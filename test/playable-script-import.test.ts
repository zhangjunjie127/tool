import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseDocxDocumentXml } from "../src/renderer/playable-script-import.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("playable screenplay import", () => {
  it("reads WordprocessingML paragraphs, tabs, and breaks without drawing text", () => {
    const window = new Window();
    vi.stubGlobal("DOMParser", window.DOMParser);

    const paragraphs = parseDocxDocumentXml(`
      <?xml version="1.0"?>
      <w:document
        xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <w:body>
          <w:p><w:r><w:t>第1集</w:t></w:r></w:p>
          <w:p/>
          <w:p>
            <w:r><w:t>1-1 场景一</w:t></w:r>
            <w:r><w:tab/></w:r>
            <w:r><w:t>夜内</w:t><w:br/><w:t>固定剧情</w:t></w:r>
            <w:r><a:t>不可见的绘图文字</a:t></w:r>
          </w:p>
          <a:p><a:r><a:t>不属于正文段落</a:t></a:r></a:p>
        </w:body>
      </w:document>
    `);

    expect(paragraphs).toEqual(["第1集", "", "1-1 场景一\t夜内\n固定剧情"]);
    window.happyDOM.abort();
  });
});
