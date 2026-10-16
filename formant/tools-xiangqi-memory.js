/** 本机记忆：课表、开局档案、错题本。不走 mono、不进 option-keys。 */

const STORE = "formantXiangqi";
const MAX_OPEN = 80;
const MAX_BANS = 200;

export const LEVEL_MS = [150, 250, 450, 700];
export const LEVEL_NAMES = ["入门", "日常", "认真", "加力"];

export function emptyMemory() {
  return {
    locked: false,
    level: 1,
    winStreak: 0,
    loseStreak: 0,
    openings: {},
    bans: [],
  };
}

function clampLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(LEVEL_MS.length - 1, Math.round(n)));
}

function normalize(raw) {
  const base = emptyMemory();
  if (!raw || typeof raw !== "object") return base;
  base.locked = Boolean(raw.locked);
  base.level = clampLevel(raw.level);
  base.winStreak = Math.max(0, Number(raw.winStreak) || 0);
  base.loseStreak = Math.max(0, Number(raw.loseStreak) || 0);
  if (raw.openings && typeof raw.openings === "object") {
    for (const [key, row] of Object.entries(raw.openings)) {
      if (!row || typeof row !== "object") continue;
      base.openings[key] = { n: Number(row.n) || 0, reply: String(row.reply || "") };
    }
  }
  if (Array.isArray(raw.bans)) {
    base.bans = raw.bans
      .filter((row) => row && row.hash && row.key)
      .map((row) => ({ hash: String(row.hash), key: String(row.key) }))
      .slice(0, MAX_BANS);
  }
  return base;
}

export async function loadMemory() {
  try {
    const stored = await chrome.storage.local.get(STORE);
    return normalize(stored[STORE]);
  } catch {
    return emptyMemory();
  }
}

export async function saveMemory(memory) {
  await chrome.storage.local.set({ [STORE]: memory });
  return memory;
}

export function timeMsOf(memory) {
  return LEVEL_MS[clampLevel(memory.level)];
}

export function jitterOf(memory) {
  if (memory.loseStreak >= 3) return 0.7;
  if (memory.loseStreak >= 2) return 0.35;
  return 0;
}

export function bannedKeys(memory, hash) {
  return memory.bans.filter((row) => row.hash === hash).map((row) => row.key);
}

export function openingBonus(memory, redKeys) {
  const prefix = redKeys.slice(0, 8).join("|");
  const row = prefix ? memory.openings[prefix] : null;
  if (row?.reply) return { [row.reply]: 40 };
  return {};
}

export function noteOpening(memory, redKeys, replyKey) {
  const prefix = redKeys.slice(0, 8).join("|");
  if (!prefix) return;
  const row = memory.openings[prefix] || { n: 0, reply: "" };
  row.n += 1;
  if (replyKey) row.reply = replyKey;
  memory.openings[prefix] = row;
  const keys = Object.keys(memory.openings);
  if (keys.length <= MAX_OPEN) return;
  keys.sort((a, b) => memory.openings[a].n - memory.openings[b].n);
  for (const key of keys.slice(0, keys.length - MAX_OPEN)) delete memory.openings[key];
}

export function noteBlunder(memory, hash, key) {
  if (!hash || !key) return;
  memory.bans = [{ hash, key }, ...memory.bans.filter((row) => row.hash !== hash || row.key !== key)].slice(
    0,
    MAX_BANS,
  );
}

export function applyResult(memory, playerWon) {
  if (memory.locked) return memory;
  if (playerWon) {
    memory.winStreak += 1;
    memory.loseStreak = 0;
    if (memory.winStreak >= 3) {
      memory.level = clampLevel(memory.level + 1);
      memory.winStreak = 0;
    }
  } else {
    memory.loseStreak += 1;
    memory.winStreak = 0;
    if (memory.loseStreak >= 3) memory.level = clampLevel(memory.level - 1);
  }
  return memory;
}

export async function clearMemoryKeepLock() {
  const prev = await loadMemory();
  const next = emptyMemory();
  next.locked = prev.locked;
  if (prev.locked) next.level = prev.level;
  return saveMemory(next);
}
