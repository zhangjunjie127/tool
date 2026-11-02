// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PlayableTemplateDialog } from "../src/renderer/playable-template-dialog.js";

it("renders the scene templates supplied by the editor", () => {
  const html = renderToStaticMarkup(
    createElement(PlayableTemplateDialog, {
      presets: [
        { id: "blank", label: "Blank Scene", summary: "A blank starting scene" },
        {
          id: "choice",
          label: "Alternate Scene",
          summary: "A scene with choices",
        },
      ],
      busy: false,
      onChoose: () => undefined,
      onClose: () => undefined,
    }),
  );

  expect(html.match(/class="playable-template"/g)).toHaveLength(2);
  expect(html).toContain("Blank Scene");
  expect(html).toContain("Alternate Scene");
});
