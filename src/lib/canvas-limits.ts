export const CANVAS_TEXT_LIMITS = {
  projectName: 200,
  nodeName: 200,
  nodeTechnology: 200,
  nodeSubtype: 80,
  edgeLabel: 40,
} as const;

export const CANVAS_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
