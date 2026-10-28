import { buildTextModel } from "./tools-compare-core.js";

self.onmessage = (event) => {
  const data = event.data || {};
  try {
    const model = buildTextModel(String(data.left ?? ""), String(data.right ?? ""), Boolean(data.ignoreWs));
    self.postMessage({
      id: data.id,
      ok: true,
      hunks: model.hunks,
      rowCount: model.rowCount,
      capped: model.capped,
      added: model.added,
      removed: model.removed,
      changed: model.changed,
    });
  } catch (error) {
    self.postMessage({
      id: data.id,
      ok: false,
      message: error instanceof Error ? error.message : "对比失败",
    });
  }
};
