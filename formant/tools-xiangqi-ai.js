/** 搜索黑盒：Negamax + αβ + 迭代加深。叶子只算子力/PST。 */

import { PIECE_VALUE, evaluate } from "./tools-xiangqi-eval.js";
import { inCheck, legalMoves, makeMove, moveKey, undoMove } from "./tools-xiangqi-lib.js";

const MATE = 100000;
const MAX_DEPTH = 6;

function sortMoves(moves) {
  moves.sort((a, b) => {
    const capA = a.captured ? PIECE_VALUE[a.captured] || 0 : 0;
    const capB = b.captured ? PIECE_VALUE[b.captured] || 0 : 0;
    if (capA !== capB) return capB - capA;
    const pri = { R: 3, C: 2, N: 1 };
    return (pri[b.piece.toUpperCase()] || 0) - (pri[a.piece.toUpperCase()] || 0);
  });
}

function pick(ranked, jitter) {
  if (!ranked.length) return null;
  if (!(jitter > 0)) return ranked[0].move;
  const top = ranked[0].score;
  const pool = ranked.filter((row) => top - row.score < 90);
  const n = Math.min(pool.length, jitter > 0.5 ? 3 : 2);
  return pool[Math.floor(Math.random() * n)].move;
}

/**
 * @param {{ board: (string|null)[][], current: string }} state
 * @param {{ timeMs?: number, banned?: string[], bonus?: Record<string, number>, jitter?: number }} [opts]
 */
export function think(state, opts = {}) {
  const timeMs = opts.timeMs ?? 250;
  const banned = new Set(opts.banned || []);
  const bonus = opts.bonus || {};
  const jitter = opts.jitter ?? 0;
  const deadline = performance.now() + Math.max(80, timeMs);
  let timedOut = false;

  const abort = () => performance.now() >= deadline;

  function negamax(depth, alpha, beta) {
    if (abort()) {
      timedOut = true;
      return evaluate(state.board, state.current);
    }
    if (depth <= 0) return evaluate(state.board, state.current);
    const moves = legalMoves(state);
    if (!moves.length) {
      return inCheck(state.board, state.current) ? -MATE - depth : -MATE + 1;
    }
    sortMoves(moves);
    let best = -Infinity;
    for (const move of moves) {
      const captured = makeMove(state, move);
      const score = -negamax(depth - 1, -beta, -alpha);
      undoMove(state, move, captured);
      if (timedOut) return best;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  const root = legalMoves(state);
  if (!root.length) return null;
  let list = root.filter((move) => !banned.has(moveKey(move)));
  if (!list.length) list = root.slice();
  sortMoves(list);

  let ranked = list.map((move) => ({ move, score: -Infinity }));
  let chosen = ranked[0].move;

  for (let depth = 1; depth <= MAX_DEPTH; depth++) {
    const next = [];
    for (const row of ranked) {
      const captured = makeMove(state, row.move);
      let score = -negamax(depth - 1, -Infinity, Infinity);
      undoMove(state, row.move, captured);
      if (timedOut && depth > 1) break;
      score += bonus[moveKey(row.move)] || 0;
      next.push({ move: row.move, score });
    }
    if (!next.length) break;
    next.sort((a, b) => b.score - a.score);
    ranked = next;
    chosen = pick(ranked, jitter);
    if (timedOut || abort()) break;
  }

  return chosen;
}
