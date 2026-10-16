import { must, toast } from "./tools-dom.js";
import { PIECE_VALUE } from "./tools-xiangqi-eval.js";
import {
  BLACK,
  FILES,
  NAMES,
  RANKS,
  RED,
  cloneState,
  createState,
  hashState,
  inCheck,
  legalFrom,
  makeMove,
  moveKey,
  outcome,
  undoMove,
} from "./tools-xiangqi-lib.js";
import {
  LEVEL_NAMES,
  applyResult,
  bannedKeys,
  clearMemoryKeepLock,
  emptyMemory,
  jitterOf,
  loadMemory,
  noteBlunder,
  noteOpening,
  openingBonus,
  saveMemory,
  timeMsOf,
} from "./tools-xiangqi-memory.js";

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div>
        <h2>象棋</h2>
      </div>
      <span class="tl-meta" data-status>红方先行</span>
    </header>
    <section class="tl-card xq-card">
      <div class="xq-layout">
        <div class="xq-board" data-board></div>
        <div class="xq-side">
          <div class="tl-row">
            <button type="button" class="tl-btn" data-new>新局</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-undo>悔棋</button>
          </div>
          <div class="tl-row">
            <button type="button" class="tl-btn tl-btn--ghost" data-forget>清空记忆</button>
            <label class="xq-lock"><input type="checkbox" data-lock /> 锁定等级</label>
          </div>
          <p class="tl-meta" data-level></p>
          <p class="tl-meta">人机在本机算，不走 mono。越下越难是课表和记你的开局，不是训练模型。</p>
        </div>
      </div>
    </section>`;

  const boardEl = must("[data-board]", root);
  const statusEl = must("[data-status]", root);
  const levelEl = must("[data-level]", root);
  const lockEl = /** @type {HTMLInputElement} */ (must("[data-lock]", root));

  let state = createState();
  /** @type {{ move: object, captured: string|null }[]} */
  let history = [];
  /** @type {{ x: number, y: number } | null} */
  let selected = null;
  /** @type {{ fx: number, fy: number, tx: number, ty: number } | null} */
  let last = null;
  let thinking = false;
  let gen = 0;
  let msgId = 0;
  /** @type {{ hash: string, key: string } | null} */
  let lastAi = null;
  /** @type {string[]} */
  let redKeys = [];
  let memory = emptyMemory();
  const worker = new Worker(chrome.runtime.getURL("tools-xiangqi-worker.js"), { type: "module" });

  function askAi(payload) {
    const id = ++msgId;
    return new Promise((resolve, reject) => {
      const onMsg = (event) => {
        if (!event.data || event.data.id !== id) return;
        worker.removeEventListener("message", onMsg);
        if (event.data.ok) resolve(event.data.move);
        else reject(new Error(event.data.error || "ai"));
      };
      worker.addEventListener("message", onMsg);
      worker.postMessage({ id, ...payload });
    });
  }

  function paintLevel() {
    if (!memory) return;
    lockEl.checked = memory.locked;
    const jitter = jitterOf(memory);
    levelEl.textContent =
      `等级 ${LEVEL_NAMES[memory.level]} · 思考 ${timeMsOf(memory)}ms` + (jitter ? " · 让步中" : "");
  }

  function statusText() {
    if (thinking) return "AI 正在走…";
    const result = outcome(cloneState(state));
    if (result.over) {
      const win = result.winner === RED ? "红胜" : "黑胜";
      return (result.mate ? "将死，" : "困毙，") + win;
    }
    const check = inCheck(state.board, state.current) ? "，将军" : "";
    return (state.current === RED ? "轮到你" : "轮到 AI") + check;
  }

  function paint() {
    const cell = 46;
    const pad = 26;
    const px = (x) => pad + x * cell;
    const py = (y) => pad + y * cell;
    const w = pad * 2 + cell * 8;
    const h = pad * 2 + cell * 9;
    const legal = selected ? legalFrom(state, selected.x, selected.y) : [];
    let lines = "";
    for (let y = 0; y < RANKS; y++) {
      lines += `<line x1="${px(0)}" y1="${py(y)}" x2="${px(8)}" y2="${py(y)}" />`;
    }
    for (let x = 0; x < FILES; x++) {
      lines += `<line x1="${px(x)}" y1="${py(0)}" x2="${px(x)}" y2="${py(4)}" />`;
      lines += `<line x1="${px(x)}" y1="${py(5)}" x2="${px(x)}" y2="${py(9)}" />`;
      if (x === 0 || x === 8) lines += `<line x1="${px(x)}" y1="${py(4)}" x2="${px(x)}" y2="${py(5)}" />`;
    }
    lines += `<line x1="${px(3)}" y1="${py(0)}" x2="${px(5)}" y2="${py(2)}" />`;
    lines += `<line x1="${px(5)}" y1="${py(0)}" x2="${px(3)}" y2="${py(2)}" />`;
    lines += `<line x1="${px(3)}" y1="${py(7)}" x2="${px(5)}" y2="${py(9)}" />`;
    lines += `<line x1="${px(5)}" y1="${py(7)}" x2="${px(3)}" y2="${py(9)}" />`;
    let marks = "";
    if (last) {
      for (const [x, y] of [
        [last.fx, last.fy],
        [last.tx, last.ty],
      ]) {
        marks += `<rect class="xq-last" x="${px(x) - 18}" y="${py(y) - 18}" width="36" height="36" rx="8" />`;
      }
    }
    for (const move of legal) {
      marks += `<circle class="xq-dot" cx="${px(move.tx)}" cy="${py(move.ty)}" r="${move.captured ? 6 : 4}" />`;
    }
    let pieces = "";
    for (let y = 0; y < RANKS; y++) {
      for (let x = 0; x < FILES; x++) {
        const piece = state.board[y][x];
        marks += `<circle class="xq-hit" data-pt="${x},${y}" cx="${px(x)}" cy="${py(y)}" r="20" />`;
        if (!piece) continue;
        const on = selected && selected.x === x && selected.y === y;
        pieces += `<g class="xq-piece ${isUpper(piece) ? "is-red" : "is-black"}${on ? " is-on" : ""}" data-pt="${x},${y}">`;
        pieces += `<circle cx="${px(x)}" cy="${py(y)}" r="18" /><text x="${px(x)}" y="${py(y) + 1}">${NAMES[piece]}</text></g>`;
      }
    }
    boardEl.innerHTML =
      `<svg class="xq-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="象棋棋盘">` +
      `<text class="xq-river" x="${px(2)}" y="${(py(4) + py(5)) / 2 + 5}">楚河</text>` +
      `<text class="xq-river" x="${px(6)}" y="${(py(4) + py(5)) / 2 + 5}">汉界</text>` +
      `<g class="xq-lines">${lines}</g>${marks}${pieces}</svg>`;
    statusEl.textContent = statusText();
    paintLevel();
  }

  function isUpper(piece) {
    return piece === piece.toUpperCase();
  }

  function resetGame() {
    gen += 1;
    state = createState();
    history = [];
    selected = null;
    last = null;
    thinking = false;
    lastAi = null;
    redKeys = [];
    paint();
  }

  function finishIfOver() {
    const result = outcome(cloneState(state));
    if (!result.over || !memory) return true;
    if (result.winner === RED && lastAi) noteBlunder(memory, lastAi.hash, lastAi.key);
    applyResult(memory, result.winner === RED);
    void saveMemory(memory);
    paint();
    toast(result.winner === RED ? "红胜" : "黑胜");
    return true;
  }

  async function afterPlayer() {
    const my = gen;
    paint();
    if (outcome(cloneState(state)).over) {
      finishIfOver();
      return;
    }
    thinking = true;
    selected = null;
    paint();
    const hash = hashState(state);
    const snapshot = memory;
    try {
      const move = await askAi({
        board: state.board,
        current: state.current,
        timeMs: timeMsOf(snapshot),
        banned: bannedKeys(snapshot, hash),
        bonus: openingBonus(snapshot, redKeys),
        jitter: jitterOf(snapshot),
      });
      if (my !== gen) return;
      thinking = false;
      if (!move) {
        finishIfOver();
        return;
      }
      if (state.current !== BLACK) return;
      lastAi = { hash, key: moveKey(move) };
      const captured = makeMove(state, move);
      history.push({ move, captured });
      last = move;
      noteOpening(memory, redKeys, lastAi.key);
      void saveMemory(memory);
      if (outcome(cloneState(state)).over) finishIfOver();
      else paint();
    } catch (error) {
      if (my !== gen) return;
      thinking = false;
      paint();
      toast(error instanceof Error ? error.message : "AI 出错", true);
    }
  }

  function play(move) {
    if (thinking || state.current !== RED) return;
    const captured = makeMove(state, move);
    history.push({ move, captured });
    last = move;
    redKeys.push(moveKey(move));
    selected = null;
    if (captured && (PIECE_VALUE[captured] || 0) >= 1000 && lastAi) {
      noteBlunder(memory, lastAi.hash, lastAi.key);
      void saveMemory(memory);
    }
    void afterPlayer();
  }

  boardEl.addEventListener("click", (event) => {
    const hit = /** @type {HTMLElement} */ (event.target).closest("[data-pt]");
    if (!hit || thinking || !memory) return;
    if (outcome(cloneState(state)).over) return;
    const [xs, ys] = (hit.getAttribute("data-pt") || "").split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (selected) {
      const dest = legalFrom(state, selected.x, selected.y).find((m) => m.tx === x && m.ty === y);
      if (dest) {
        play(dest);
        return;
      }
    }
    const piece = state.board[y][x];
    if (piece && piece === piece.toUpperCase() && state.current === RED) {
      selected = { x, y };
      paint();
      return;
    }
    selected = null;
    paint();
  });

  must("[data-new]", root).addEventListener("click", () => resetGame());
  must("[data-undo]", root).addEventListener("click", () => {
    if (thinking || history.length < 2) {
      toast("没有可悔的棋", true);
      return;
    }
    for (let i = 0; i < 2; i++) {
      const row = history.pop();
      if (!row) break;
      undoMove(state, row.move, row.captured);
    }
    if (redKeys.length) redKeys.pop();
    lastAi = null;
    last = history.length ? history[history.length - 1].move : null;
    selected = null;
    thinking = false;
    paint();
  });
  must("[data-forget]", root).addEventListener("click", () => {
    void clearMemoryKeepLock().then((next) => {
      memory = next;
      paintLevel();
      toast("已清空记忆");
    });
  });
  lockEl.addEventListener("change", () => {
    if (!memory) return;
    memory.locked = lockEl.checked;
    void saveMemory(memory);
  });

  paint();
  void loadMemory().then((mem) => {
    memory = mem;
    paintLevel();
  });
}
