import { think } from "./tools-xiangqi-ai.js";

self.onmessage = (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    const board = Array.isArray(data.board) ? data.board.map((row) => row.slice()) : [];
    const move = think(
      { board, current: data.current },
      {
        timeMs: data.timeMs,
        banned: data.banned,
        bonus: data.bonus,
        jitter: data.jitter,
      },
    );
    self.postMessage({ id, ok: true, move });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
