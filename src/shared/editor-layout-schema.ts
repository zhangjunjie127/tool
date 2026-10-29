/** JSON Schema for the persisted editor/layout.json file. Graph/layout ID correspondence is checked at runtime. */
export const EDITOR_LAYOUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["version", "nodes", "viewport", "view"],
  properties: {
    version: { const: 1 },
    nodes: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["x", "y"],
        properties: {
          x: { type: "number" },
          y: { type: "number" },
        },
      },
    },
    sceneGuides: {
      type: "object",
      additionalProperties: {
        type: "array",
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "axis", "position"],
          properties: {
            id: { type: "string", minLength: 1, maxLength: 120 },
            axis: { enum: ["horizontal", "vertical"] },
            position: { type: "number", minimum: 0, maximum: 1 },
          },
        },
      },
    },
    viewport: {
      type: "object",
      additionalProperties: false,
      required: ["x", "y", "zoom"],
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        zoom: { type: "number", exclusiveMinimum: 0 },
      },
    },
    view: { enum: ["canvas", "code"] },
  },
} as const;
