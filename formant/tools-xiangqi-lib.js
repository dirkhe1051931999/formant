/** 中国象棋规则：交叉点棋盘、合步过滤（含飞将）、将死/困毙。搜索只用 make/undo，不写历史。 */

export const FILES = 9;
export const RANKS = 10;
export const RED = "red";
export const BLACK = "black";

export const NAMES = {
  K: "帅",
  k: "将",
  A: "仕",
  a: "士",
  B: "相",
  b: "象",
  N: "马",
  n: "马",
  R: "车",
  r: "车",
  C: "炮",
  c: "炮",
  P: "兵",
  p: "卒",
};

const KNIGHT = [
  [1, 2, 0, 1],
  [2, 1, 1, 0],
  [2, -1, 1, 0],
  [1, -2, 0, -1],
  [-1, -2, 0, -1],
  [-2, -1, -1, 0],
  [-2, 1, -1, 0],
  [-1, 2, 0, 1],
];

export function isRed(piece) {
  return piece === piece.toUpperCase();
}

export function sideOf(piece) {
  return isRed(piece) ? RED : BLACK;
}

export function other(side) {
  return side === RED ? BLACK : RED;
}

export function inBoard(x, y) {
  return x >= 0 && x < FILES && y >= 0 && y < RANKS;
}

export function startBoard() {
  const board = Array.from({ length: RANKS }, () => Array(FILES).fill(null));
  board[0] = ["r", "n", "b", "a", "k", "a", "b", "n", "r"];
  board[2][1] = "c";
  board[2][7] = "c";
  board[3][0] = "p";
  board[3][2] = "p";
  board[3][4] = "p";
  board[3][6] = "p";
  board[3][8] = "p";
  board[9] = ["R", "N", "B", "A", "K", "A", "B", "N", "R"];
  board[7][1] = "C";
  board[7][7] = "C";
  board[6][0] = "P";
  board[6][2] = "P";
  board[6][4] = "P";
  board[6][6] = "P";
  board[6][8] = "P";
  return board;
}

export function createState() {
  return { board: startBoard(), current: RED };
}

export function cloneBoard(board) {
  return board.map((row) => row.slice());
}

export function cloneState(state) {
  return { board: cloneBoard(state.board), current: state.current };
}

export function moveKey(move) {
  return `${move.fx},${move.fy}-${move.tx},${move.ty}`;
}

export function hashState(state) {
  let text = state.current === RED ? "r" : "b";
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) text += state.board[y][x] || ".";
  }
  return text;
}

function inPalace(x, y, red) {
  if (x < 3 || x > 5) return false;
  return red ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

function ownSide(y, red) {
  return red ? y >= 5 : y <= 4;
}

function add(moves, board, x, y, red) {
  if (!inBoard(x, y)) return;
  const target = board[y][x];
  if (!target || isRed(target) !== red) moves.push({ x, y });
}

function pseudoFrom(board, fx, fy) {
  const piece = board[fy][fx];
  if (!piece) return [];
  const red = isRed(piece);
  const type = piece.toUpperCase();
  const moves = [];
  if (type === "K") {
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      const x = fx + dx;
      const y = fy + dy;
      if (inPalace(x, y, red)) add(moves, board, x, y, red);
    }
    return moves;
  }
  if (type === "A") {
    for (const [dx, dy] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]) {
      const x = fx + dx;
      const y = fy + dy;
      if (inPalace(x, y, red)) add(moves, board, x, y, red);
    }
    return moves;
  }
  if (type === "B") {
    for (const [dx, dy] of [
      [2, 2],
      [2, -2],
      [-2, 2],
      [-2, -2],
    ]) {
      const x = fx + dx;
      const y = fy + dy;
      const eyeX = fx + dx / 2;
      const eyeY = fy + dy / 2;
      if (inBoard(x, y) && ownSide(y, red) && !board[eyeY][eyeX]) add(moves, board, x, y, red);
    }
    return moves;
  }
  if (type === "N") {
    for (const [dx, dy, bx, by] of KNIGHT) {
      if (inBoard(fx + bx, fy + by) && !board[fy + by][fx + bx]) add(moves, board, fx + dx, fy + dy, red);
    }
    return moves;
  }
  if (type === "R" || type === "C") {
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ]) {
      let x = fx + dx;
      let y = fy + dy;
      let jumped = false;
      while (inBoard(x, y)) {
        const target = board[y][x];
        if (type === "R") {
          if (!target) moves.push({ x, y });
          else {
            if (isRed(target) !== red) moves.push({ x, y });
            break;
          }
        } else if (!jumped) {
          if (!target) moves.push({ x, y });
          else jumped = true;
        } else if (target) {
          if (isRed(target) !== red) moves.push({ x, y });
          break;
        }
        x += dx;
        y += dy;
      }
    }
    return moves;
  }
  const forward = red ? fy - 1 : fy + 1;
  if (inBoard(fx, forward)) add(moves, board, fx, forward, red);
  const crossed = red ? fy < 5 : fy > 4;
  if (crossed) {
    add(moves, board, fx - 1, fy, red);
    add(moves, board, fx + 1, fy, red);
  }
  return moves;
}

export function findKing(board, side) {
  const king = side === RED ? "K" : "k";
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) if (board[y][x] === king) return { x, y };
  }
  return null;
}

export function isAttacked(board, tx, ty, bySide) {
  const byRed = bySide === RED;
  const pawn = byRed ? "P" : "p";
  const back = byRed ? ty + 1 : ty - 1;
  if (inBoard(tx, back) && board[back][tx] === pawn) return true;
  const sideOk = byRed ? ty < 5 : ty > 4;
  if (sideOk) {
    if (inBoard(tx - 1, ty) && board[ty][tx - 1] === pawn) return true;
    if (inBoard(tx + 1, ty) && board[ty][tx + 1] === pawn) return true;
  }
  const knight = byRed ? "N" : "n";
  for (const [dx, dy, bx, by] of KNIGHT) {
    const nx = tx - dx;
    const ny = ty - dy;
    if (!inBoard(nx, ny) || board[ny][nx] !== knight) continue;
    if (inBoard(nx + bx, ny + by) && !board[ny + by][nx + bx]) return true;
  }
  const king = byRed ? "K" : "k";
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    const x = tx + dx;
    const y = ty + dy;
    if (inBoard(x, y) && board[y][x] === king) return true;
  }
  const advisor = byRed ? "A" : "a";
  for (const [dx, dy] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const x = tx + dx;
    const y = ty + dy;
    if (inPalace(tx, ty, byRed) && inBoard(x, y) && board[y][x] === advisor) return true;
  }
  const elephant = byRed ? "B" : "b";
  for (const [dx, dy] of [
    [2, 2],
    [2, -2],
    [-2, 2],
    [-2, -2],
  ]) {
    const x = tx - dx;
    const y = ty - dy;
    const eyeX = tx - dx / 2;
    const eyeY = ty - dy / 2;
    if (inBoard(x, y) && board[y][x] === elephant && ownSide(ty, byRed) && !board[eyeY][eyeX]) return true;
  }
  const rook = byRed ? "R" : "r";
  const cannon = byRed ? "C" : "c";
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    let jumped = false;
    let x = tx + dx;
    let y = ty + dy;
    while (inBoard(x, y)) {
      const piece = board[y][x];
      if (piece) {
        if (!jumped) {
          if (piece === rook) return true;
          if (piece === king && dx === 0) return true;
          jumped = true;
        } else {
          if (piece === cannon) return true;
          break;
        }
      }
      x += dx;
      y += dy;
    }
  }
  return false;
}

export function inCheck(board, side) {
  const king = findKing(board, side);
  if (!king) return true;
  return isAttacked(board, king.x, king.y, other(side));
}

export function makeMove(state, move) {
  const captured = state.board[move.ty][move.tx];
  state.board[move.ty][move.tx] = move.piece;
  state.board[move.fy][move.fx] = null;
  state.current = other(state.current);
  return captured;
}

export function undoMove(state, move, captured) {
  state.board[move.fy][move.fx] = move.piece;
  state.board[move.ty][move.tx] = captured;
  state.current = other(state.current);
}

function pack(fx, fy, dest, piece) {
  return { fx, fy, tx: dest.x, ty: dest.y, piece };
}

export function legalFrom(state, fx, fy) {
  const piece = state.board[fy][fx];
  if (!piece || sideOf(piece) !== state.current) return [];
  const side = state.current;
  const out = [];
  for (const dest of pseudoFrom(state.board, fx, fy)) {
    const move = pack(fx, fy, dest, piece);
    const captured = makeMove(state, move);
    const bad = inCheck(state.board, side);
    undoMove(state, move, captured);
    if (!bad) out.push({ ...move, captured });
  }
  return out;
}

export function legalMoves(state) {
  const out = [];
  for (let y = 0; y < RANKS; y++) {
    for (let x = 0; x < FILES; x++) {
      const piece = state.board[y][x];
      if (piece && sideOf(piece) === state.current) out.push(...legalFrom(state, x, y));
    }
  }
  return out;
}

export function outcome(state) {
  const moves = legalMoves(state);
  if (moves.length) return { over: false, winner: null, mate: false, moves };
  return { over: true, winner: other(state.current), mate: inCheck(state.board, state.current), moves };
}

export function givesCheck(state, move) {
  const captured = makeMove(state, move);
  const check = inCheck(state.board, state.current);
  undoMove(state, move, captured);
  return check;
}
