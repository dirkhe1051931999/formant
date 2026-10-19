import { escapeHtml, must, toast } from "./tools-dom.js";
import { PIECE_VALUE } from "./tools-xiangqi-eval.js";
import { ANIM_MS, VIEW_H, VIEW_W, px, py, reduceMotion, renderBoard, wait } from "./tools-xiangqi-board.js";
import {
  playCapture,
  playCheck,
  playIllegal,
  playLose,
  playMove,
  playNew,
  playSelect,
  playUndo,
  playWin,
  setSoundOn,
} from "./tools-xiangqi-audio.js";
import {
  BLACK,
  RED,
  cloneState,
  createState,
  findKing,
  hashState,
  inCheck,
  legalFrom,
  makeMove,
  moveKey,
  outcome,
  sideOf,
  undoMove,
} from "./tools-xiangqi-lib.js";
import { explainReply, explainSelect } from "./tools-xiangqi-teach.js";
import {
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
  snapshotGame,
  timeMsOf,
  unpackBoard,
} from "./tools-xiangqi-memory.js";

/** @param {HTMLElement} root */
export function mount(root) {
  root.innerHTML = `
    <header class="tl-head">
      <div><h2>象棋</h2></div>
      <span class="tl-meta" data-status>红方先行</span>
    </header>
    <section class="tl-card xq-card">
      <div class="xq-layout">
        <div class="xq-stage">
          <div class="xq-board" data-board></div>
          <div class="xq-bubbles" data-bubbles></div>
        </div>
        <div class="xq-side">
          <label class="xq-field">模式
            <select class="xq-select" data-mode>
              <option value="vs">人机</option><option value="teach">教学</option><option value="pvp">双人</option>
            </select>
          </label>
          <label class="xq-field">难度
            <select class="xq-select" data-level>
              <option value="auto">自动</option><option value="0">入门</option><option value="1">日常</option>
              <option value="2">认真</option><option value="3">加力</option>
            </select>
          </label>
          <div class="xq-actions">
            <button type="button" class="tl-btn" data-new>新局</button>
            <button type="button" class="tl-btn tl-btn--ghost" data-undo>悔棋</button>
          </div>
          <div class="xq-links">
            <button type="button" class="xq-link" data-sound>音效开</button>
            <button type="button" class="xq-link" data-hint>讲解提示</button>
            <button type="button" class="xq-link" data-forget>清空记忆</button>
          </div>
        </div>
      </div>
    </section>`;

  const boardEl = must("[data-board]", root);
  const bubblesEl = must("[data-bubbles]", root);
  const statusEl = must("[data-status]", root);
  const modeSel = /** @type {HTMLSelectElement} */ (must("[data-mode]", root));
  const levelSel = /** @type {HTMLSelectElement} */ (must("[data-level]", root));
  const soundBtn = must("[data-sound]", root);
  const hintBtn = must("[data-hint]", root);

  let state = createState();
  /** @type {{ move: object, captured: string|null }[]} */
  let history = [];
  /** @type {{ x: number, y: number } | null} */
  let selected = null;
  /** @type {{ fx: number, fy: number, tx: number, ty: number } | null} */
  let last = null;
  /** @type {{ fx: number, fy: number, tx: number, ty: number } | null} */
  let hint = null;
  let lesson = "";
  let lessonHidden = false;
  let thinking = false;
  let busy = false;
  let gen = 0;
  let msgId = 0;
  /** @type {{ hash: string, key: string } | null} */
  let lastAi = null;
  /** @type {string[]} */
  let redKeys = [];
  let memory = emptyMemory();
  const worker = new Worker(chrome.runtime.getURL("tools-xiangqi-worker.js"), { type: "module" });

  const vsAi = () => memory.mode !== "pvp";
  const teaching = () => memory.mode === "teach";

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

  function persist() {
    memory.game = snapshotGame(state, { history, last, redKeys, lastAi, lesson });
    void saveMemory(memory);
  }

  function setLesson(text) {
    lesson = text || "";
    lessonHidden = false;
  }

  function thinkRed() {
    return askAi({
      board: state.board,
      current: RED,
      timeMs: timeMsOf(memory),
      banned: [],
      bonus: {},
      jitter: 0,
    });
  }

  async function coach(opp, my) {
    if (!teaching() || state.current !== RED) return;
    const before = cloneState(state);
    const reply = await thinkRed();
    if (my !== gen || state.current !== RED) return;
    if (reply) {
      hint = reply;
      selected = { x: reply.fx, y: reply.fy };
    }
    setLesson(explainReply(opp, before, reply));
    persist();
    paint();
  }

  function checkAt() {
    if (!inCheck(state.board, state.current)) return null;
    return findKing(state.board, state.current);
  }

  function bubbleSpot() {
    if (hint) return { x: hint.tx, y: hint.ty, who: "tip" };
    if (selected) return { x: selected.x, y: selected.y, who: "you" };
    if (last) {
      const black = last.piece && last.piece === last.piece.toLowerCase();
      return { x: last.tx, y: last.ty, who: black ? "ai" : "you" };
    }
    return { x: 4, y: 5, who: "tip" };
  }

  function paintBubbles(hide) {
    if (!teaching() || hide || lessonHidden || !lesson) {
      bubblesEl.innerHTML = "";
      return;
    }
    const at = bubbleSpot();
    const cls = `xq-bubble is-${at.who}${at.x >= 5 ? " is-left" : ""}${at.y <= 1 ? " is-down" : ""}`;
    bubblesEl.innerHTML =
      `<div class="${cls}" style="left:${(px(at.x) / VIEW_W) * 100}%;top:${(py(at.y) / VIEW_H) * 100}%">` +
      `<button type="button" class="xq-bubble__x" data-bubble-close aria-label="关闭">×</button>` +
      `<p>${escapeHtml(lesson)}</p></div>`;
  }

  function paintChrome() {
    modeSel.value = memory.mode;
    levelSel.value = memory.locked ? String(memory.level) : "auto";
    soundBtn.textContent = memory.sound ? "音效开" : "音效关";
    hintBtn.hidden = !teaching();
  }

  function statusText() {
    if (thinking) return "AI 正在走…";
    const result = outcome(cloneState(state));
    if (result.over) return (result.mate ? "将死，" : "困毙，") + (result.winner === RED ? "红胜" : "黑胜");
    const check = inCheck(state.board, state.current) ? "，将军" : "";
    if (!vsAi()) return (state.current === RED ? "轮到红方" : "轮到黑方") + check;
    return (state.current === RED ? "轮到你" : "轮到 AI") + check;
  }

  function paint(extra) {
    const fly = extra && extra.fly;
    boardEl.classList.toggle("is-think", thinking);
    boardEl.innerHTML = renderBoard({
      board: state.board,
      selected: fly ? null : selected,
      last,
      legal: selected && !fly ? legalFrom(state, selected.x, selected.y) : [],
      fly: fly || null,
      fade: extra && extra.fade,
      checkAt: fly ? null : checkAt(),
      hint: fly ? null : hint,
    });
    statusEl.textContent = statusText();
    paintChrome();
    paintBubbles(Boolean(fly));
  }

  async function paintMove(move, captured) {
    if (reduceMotion()) {
      paint();
      return;
    }
    paint({
      fly: { piece: move.piece, fx: move.fx, fy: move.fy, tx: move.tx, ty: move.ty },
      fade: captured ? { piece: captured, x: move.tx, y: move.ty } : null,
    });
    const flyEl = boardEl.querySelector(".xq-piece.is-fly");
    if (flyEl) {
      flyEl.getBoundingClientRect();
      flyEl.style.transform = `translate(${px(move.tx)}px, ${py(move.ty)}px)`;
    }
    await wait(ANIM_MS);
    paint();
  }

  function cueAfterMove(captured, over, winner) {
    if (captured) playCapture();
    else playMove();
    if (over) {
      if (winner === RED) playWin();
      else playLose();
      return;
    }
    if (inCheck(state.board, state.current)) playCheck();
  }

  function resetGame() {
    gen += 1;
    state = createState();
    history = [];
    selected = null;
    last = null;
    hint = null;
    thinking = false;
    busy = false;
    lastAi = null;
    redKeys = [];
    if (teaching()) setLesson("你先走。对方走完后，我会告诉你怎么应、为什么。");
    else {
      lesson = "";
      lessonHidden = true;
    }
    playNew();
    persist();
    paint();
  }

  function finishIfOver() {
    const result = outcome(cloneState(state));
    if (!result.over) return false;
    if (vsAi() && result.winner === RED && lastAi) noteBlunder(memory, lastAi.hash, lastAi.key);
    if (vsAi()) applyResult(memory, result.winner === RED);
    persist();
    paint();
    toast(result.winner === RED ? "红胜" : "黑胜");
    return true;
  }

  async function afterPlayer() {
    if (!vsAi()) return;
    const my = gen;
    if (finishIfOver()) return;
    thinking = true;
    selected = null;
    paint();
    const hash = hashState(state);
    const mem = memory;
    try {
      const move = await askAi({
        board: state.board,
        current: state.current,
        timeMs: timeMsOf(mem),
        banned: bannedKeys(mem, hash),
        bonus: openingBonus(mem, redKeys),
        jitter: jitterOf(mem),
      });
      if (my !== gen) return;
      thinking = false;
      if (!move || state.current !== BLACK) {
        finishIfOver();
        return;
      }
      lastAi = { hash, key: moveKey(move) };
      const captured = makeMove(state, move);
      history.push({ move, captured });
      last = { ...move, captured };
      hint = null;
      noteOpening(memory, redKeys, lastAi.key);
      persist();
      await paintMove(move, captured);
      if (my !== gen) return;
      const result = outcome(cloneState(state));
      cueAfterMove(captured, result.over, result.winner);
      if (result.over) finishIfOver();
      else {
        paint();
        await coach({ ...move, captured }, my);
      }
    } catch (error) {
      if (my !== gen) return;
      thinking = false;
      paint();
      toast(error instanceof Error ? error.message : "AI 出错", true);
    }
  }

  async function play(move) {
    if (thinking || busy) return;
    if (vsAi() && state.current !== RED) return;
    const my = gen;
    busy = true;
    const captured = makeMove(state, move);
    history.push({ move, captured });
    last = move;
    hint = selected = null;
    if (sideOf(move.piece) === RED) redKeys.push(moveKey(move));
    if (teaching()) lesson = "";
    if (captured && (PIECE_VALUE[captured] || 0) >= 1000 && lastAi) {
      noteBlunder(memory, lastAi.hash, lastAi.key);
    }
    persist();
    await paintMove(move, captured);
    if (my !== gen) return;
    const result = outcome(cloneState(state));
    cueAfterMove(captured, result.over, result.winner);
    busy = false;
    if (result.over) finishIfOver();
    else if (vsAi()) void afterPlayer();
    else paint();
  }

  function restoreGame() {
    const game = memory.game;
    if (!game) return;
    state = { board: unpackBoard(game.board), current: game.current };
    history = game.history;
    last = game.last;
    redKeys = game.redKeys;
    lastAi = game.lastAi;
    lesson = game.lesson || "";
    lessonHidden = false;
  }

  boardEl.addEventListener("click", (event) => {
    const hit = /** @type {HTMLElement} */ (event.target).closest("[data-pt]");
    if (!hit || thinking || busy) return;
    if (outcome(cloneState(state)).over) return;
    const [xs, ys] = (hit.getAttribute("data-pt") || "").split(",");
    const x = Number(xs);
    const y = Number(ys);
    if (selected) {
      const dest = legalFrom(state, selected.x, selected.y).find((m) => m.tx === x && m.ty === y);
      if (dest) {
        void play(dest);
        return;
      }
    }
    const piece = state.board[y][x];
    const mine = piece && sideOf(piece) === state.current && (vsAi() ? state.current === RED : true);
    if (mine) {
      selected = { x, y };
      if (teaching() && (lessonHidden || !lesson)) setLesson(explainSelect(state, x, y));
      playSelect();
      paint();
      return;
    }
    if (selected) playIllegal();
    selected = null;
    paint();
  });

  modeSel.addEventListener("change", () => {
    const mode = modeSel.value || "vs";
    if (mode === memory.mode) return;
    gen += 1;
    thinking = false;
    busy = false;
    memory.mode = mode;
    selected = null;
    hint = null;
    setLesson(teaching() ? "等对方走完，我会告诉你怎么应、为什么。" : "");
    persist();
    paint();
    if (vsAi() && state.current === BLACK && !outcome(cloneState(state)).over) void afterPlayer();
    else if (teaching() && state.current === RED) {
      void coach(last && last.piece === (last.piece || "").toLowerCase() ? last : null, gen);
    }
  });

  levelSel.addEventListener("change", () => {
    if (levelSel.value === "auto") {
      memory.locked = false;
    } else {
      memory.level = Number(levelSel.value);
      memory.locked = true;
      memory.winStreak = 0;
      memory.loseStreak = 0;
    }
    persist();
    paintChrome();
  });

  must("[data-new]", root).addEventListener("click", () => resetGame());
  must("[data-undo]", root).addEventListener("click", () => {
    const steps = vsAi() ? 2 : 1;
    if (thinking || busy || history.length < steps) {
      toast("没有可悔的棋", true);
      return;
    }
    for (let i = 0; i < steps; i++) {
      const row = history.pop();
      if (!row) break;
      undoMove(state, row.move, row.captured);
      if (sideOf(row.move.piece) === RED && redKeys.length) redKeys.pop();
    }
    lastAi = null;
    hint = null;
    last = history.length ? history[history.length - 1].move : null;
    selected = null;
    thinking = false;
    if (teaching()) setLesson("悔了一步。等对方再走，我会重新给你应着。");
    playUndo();
    persist();
    paint();
  });
  hintBtn.addEventListener("click", () => {
    if (!teaching() || thinking || busy || state.current !== RED) return;
    void coach(last && last.piece === (last.piece || "").toLowerCase() ? last : null, gen);
  });
  must("[data-forget]", root).addEventListener("click", () => {
    void clearMemoryKeepLock().then((next) => {
      memory = next;
      setSoundOn(memory.sound);
      paintChrome();
      toast("已清空开局档案和错题本");
    });
  });
  bubblesEl.addEventListener("click", (event) => {
    if (!/** @type {HTMLElement} */ (event.target).closest("[data-bubble-close]")) return;
    event.preventDefault();
    event.stopPropagation();
    lessonHidden = true;
    paintBubbles();
  });

  soundBtn.addEventListener("click", () => {
    memory.sound = !memory.sound;
    setSoundOn(memory.sound);
    persist();
    paintChrome();
    if (memory.sound) playSelect();
  });

  void loadMemory().then((mem) => {
    memory = mem;
    setSoundOn(memory.sound);
    restoreGame();
    paint();
    if (vsAi() && state.current === BLACK && !outcome(cloneState(state)).over) void afterPlayer();
  });
}
