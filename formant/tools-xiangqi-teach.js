/** 教学模式：对方走完后建议应着，并讲思路。不走 mono。 */

import { NAMES, RED, cloneState, givesCheck, inCheck, isRed, legalFrom } from "./tools-xiangqi-lib.js";

function fileNo(x, red) {
  return red ? 9 - x : x + 1;
}

export function moveLabel(move) {
  const name = NAMES[move.piece] || "棋";
  const red = isRed(move.piece);
  const from = fileNo(move.fx, red);
  const to = fileNo(move.tx, red);
  const type = move.piece.toUpperCase();
  const dy = move.ty - move.fy;
  const forward = red ? -1 : 1;
  if (move.fx === move.tx) {
    const n = Math.abs(dy);
    return dy * forward > 0 ? `${name}${from}进${n}` : `${name}${from}退${n}`;
  }
  if (type === "N" || type === "B" || type === "A") {
    return dy * forward > 0 ? `${name}${from}进${to}` : `${name}${from}退${to}`;
  }
  return `${name}${from}平${to}`;
}

function capName(piece) {
  return NAMES[piece] || "子";
}

function threatLine(opp) {
  const lab = moveLabel(opp);
  if (opp.captured) return `对方走了${lab}，吃了你的${capName(opp.captured)}。`;
  const type = (opp.piece || "").toUpperCase();
  if (type === "C") return `对方走了${lab}，炮在找打人的位置。`;
  if (type === "R") return `对方走了${lab}，车想抢通路。`;
  if (type === "N") return `对方走了${lab}，马跳出来了。`;
  if (type === "P") return `对方走了${lab}，兵在往前拱。`;
  return `对方走了${lab}。`;
}

function ideaLine(youBefore, reply, opp) {
  if (inCheck(youBefore.board, RED)) return "先把将解开，别的以后再说。";
  if (givesCheck(cloneState(youBefore), reply)) return "先叫将，逼对方忙着救将，你就掌握节奏。";
  if (reply.captured && opp && reply.captured === opp.piece) return "把刚才那枚棋吃回来，别让对方白占便宜。";
  if (reply.captured) return "先吃子。子多了，后面更好下。";
  const type = (reply.piece || "").toUpperCase();
  if (type === "N" && (reply.fy === 9 || reply.fy === 0)) return "把马跳出来，既挡又通车路，开局最常用。";
  if (type === "N") return "马跳到要点，拦住对方的来路。";
  if (type === "C") return "把炮摆到能隔子打的位置，盯住对方要害。";
  if (type === "R") return "出车占线。车比马炮更能管住半边棋盘。";
  if (type === "P") return "兵往前拱，过河以后就能左右打人。";
  return "先把棋走活，别挤在家里挨打。";
}

/**
 * 对方刚走完：建议你怎么应，以及为什么。
 * @param {{ fx:number, fy:number, tx:number, ty:number, piece:string, captured?: string|null } | null} opp
 * @param {{ board: (string|null)[][], current: string }} youBefore
 * @param {{ fx:number, fy:number, tx:number, ty:number, piece:string, captured?: string|null }} reply
 */
export function explainReply(opp, youBefore, reply) {
  if (!reply) return "这步没有能走的棋。先看看自己的将是不是被叫住了。";
  const rec = moveLabel(reply);
  const idea = ideaLine(youBefore, reply, opp);
  const head = opp ? threatLine(opp) : "";
  const check = givesCheck(cloneState(youBefore), reply);
  const eat = reply.captured ? `这步会吃掉${capName(reply.captured)}。` : "";
  const jiang = check ? "走完会叫将。" : "";
  return `${head}建议走${rec}。思路：${idea}${eat}${jiang}`;
}

export function explainSelect(state, x, y) {
  const piece = state.board[y][x];
  if (!piece) return "";
  const moves = legalFrom(state, x, y);
  const name = NAMES[piece] || "这枚棋";
  if (!moves.length) return `${name}现在动不了。一走，自己的将可能就危险了。`;
  const caps = moves.filter((m) => m.captured);
  if (caps.length) return `绿点都能走。带圈的格子可以吃掉对方。你也可以按气泡里的建议走。`;
  return `点亮点把${name}走过去。想听应着，等对方走完，或点「讲解提示」。`;
}

export function explainHint(before, move, opp) {
  return explainReply(opp || null, before, move);
}
