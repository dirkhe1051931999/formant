/**
 * New Tab 「热点英语」卡片：释义/谐音默认可揭开 + TTS + 剔除。
 * 右上角可翻到生词本（本机英文单词，见 newtab-study.js）。
 */

import { clearStudySpeakUi, renderStudyFace } from "./newtab-study.js";
import { saveVocabFace, speechMeaning, VOCAB_FACE_KEY } from "./study-words.js";

const SPEAK_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><polygon points="1.75 5.75 1.75 10.25 4.25 10.25 8.25 13.25 8.25 2.75 4.25 5.75"/><path d="m10.75 6.25s1 .5 1 1.75-1 1.75-1 1.75m1-6.5c2 1 3 2.5 3 4.75s-1 3.75-3 4.75"/></svg>`;

const SPEAK_ALL_ICON = SPEAK_ICON;

const DISMISS_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

const FLIP_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M3.25 6.25h7.2L8.2 4"/><path d="M12.75 9.75H5.55L7.8 12"/></svg>`;

/** 英→中间隔（ms）；0 = 英文念完立刻接中文 */
const EN_ZH_GAP_MS = 0;
/** 每轮结束后到下一轮英文的间隔 */
const ROUND_GAP_MS = 250;
const DEFAULT_ROUNDS = 1;

/** 只念一轮时不显示 1/1 角标 */
function roundLabel(round, total) {
  return total > 1 ? `${round}/${total}` : "";
}

/**
 * @typedef {{ word: string, meaning: string, phoneticZh: string, ipa?: string }} VocabWord
 * @typedef {{
 *   onRound?: (round: number, total: number) => void,
 *   onWord?: (index: number, total: number, word: string) => void,
 *   onStart?: () => void,
 *   onDone?: () => void,
 * }} SpeakHooks
 */

let speakGeneration = 0;

function stopSpeaking() {
  speakGeneration += 1;
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/**
 * @param {number} ms
 * @param {number} generation
 */
function sleepSpeak(ms, generation) {
  return new Promise((resolve, reject) => {
    window.setTimeout(() => {
      if (generation !== speakGeneration) reject(new Error("cancelled"));
      else resolve();
    }, ms);
  });
}

/**
 * @param {string} text
 * @param {string} lang
 * @param {number} generation
 */
function utterOnce(text, lang, generation) {
  return new Promise((resolve, reject) => {
    if (generation !== speakGeneration || typeof speechSynthesis === "undefined") {
      reject(new Error("cancelled"));
      return;
    }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = lang.startsWith("zh") ? 0.95 : 0.9;
    utter.onend = () => {
      if (generation !== speakGeneration) reject(new Error("cancelled"));
      else resolve();
    };
    utter.onerror = () => {
      if (generation !== speakGeneration) reject(new Error("cancelled"));
      else resolve();
    };
    speechSynthesis.speak(utter);
  });
}

/**
 * 英文 → 等 1s → 中文，循环 rounds 轮。
 * @param {string} word
 * @param {string} [meaning]
 * @param {number} [rounds]
 * @param {SpeakHooks} [hooks]
 */
export async function speakVocabWord(word, meaning = "", rounds = DEFAULT_ROUNDS, hooks = {}) {
  const en = String(word || "").trim();
  const zh = String(meaning || "").trim();
  if (!en || typeof speechSynthesis === "undefined") return;

  stopSpeaking();
  const generation = speakGeneration;
  const total = Math.max(1, Math.min(10, Math.floor(Number(rounds) || DEFAULT_ROUNDS)));
  hooks.onStart?.();
  try {
    for (let round = 1; round <= total; round += 1) {
      if (generation !== speakGeneration) return;
      hooks.onRound?.(round, total);
      await utterOnce(en, "en-US", generation);
      if (zh) {
        if (EN_ZH_GAP_MS > 0) await sleepSpeak(EN_ZH_GAP_MS, generation);
        await utterOnce(zh, "zh-CN", generation);
      }
      if (round < total) await sleepSpeak(ROUND_GAP_MS, generation);
    }
  } catch {
    // cancelled
  } finally {
    if (generation === speakGeneration) hooks.onDone?.();
  }
}

/**
 * 按列表顺序逐词朗读，每词英→中 × rounds。
 * @param {VocabWord[]} items
 * @param {number} [rounds]
 * @param {SpeakHooks} [hooks]
 */
export async function speakVocabList(items, rounds = DEFAULT_ROUNDS, hooks = {}) {
  const list = (Array.isArray(items) ? items : [])
    .map((item) => ({
      word: String(item?.word || "").trim(),
      meaning: String(item?.meaning || "").trim(),
    }))
    .filter((item) => item.word);
  if (!list.length || typeof speechSynthesis === "undefined") return;

  stopSpeaking();
  const generation = speakGeneration;
  const totalRounds = Math.max(1, Math.min(10, Math.floor(Number(rounds) || DEFAULT_ROUNDS)));
  hooks.onStart?.();
  try {
    for (let i = 0; i < list.length; i += 1) {
      if (generation !== speakGeneration) return;
      const item = list[i];
      hooks.onWord?.(i + 1, list.length, item.word);
      for (let round = 1; round <= totalRounds; round += 1) {
        if (generation !== speakGeneration) return;
        hooks.onRound?.(round, totalRounds);
        await utterOnce(item.word, "en-US", generation);
        if (item.meaning) {
          if (EN_ZH_GAP_MS > 0) await sleepSpeak(EN_ZH_GAP_MS, generation);
          await utterOnce(item.meaning, "zh-CN", generation);
        }
        if (round < totalRounds) await sleepSpeak(ROUND_GAP_MS, generation);
      }
      if (i < list.length - 1) await sleepSpeak(ROUND_GAP_MS, generation);
    }
  } catch {
    // cancelled
  } finally {
    if (generation === speakGeneration) hooks.onDone?.();
  }
}

/**
 * @param {HTMLButtonElement} btn
 * @param {string} [label]
 */
function setSpeakBtnState(btn, speaking, label = "") {
  btn.classList.toggle("is-speaking", speaking);
  let badge = btn.querySelector(".vocab-speak-badge");
  if (!speaking) {
    badge?.remove();
    return;
  }
  if (!label) {
    badge?.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "vocab-speak-badge";
    btn.append(badge);
  }
  badge.textContent = label;
}

/**
 * @param {unknown} data
 * @param {{
 *   onRefresh?: () => void | Promise<void>,
 *   onDismiss?: (word: string) => void | Promise<void>,
 * }} [handlers]
 * @param {{ face?: "hot" | "study", words?: import("./study-words.js").StudyWord[] }} [study]
 */
export function renderVocabWidget(data, handlers = {}, study = {}) {
  const card = document.createElement("article");
  card.className = "widget widget--vocab";
  card.dataset.widget = "vocab";

  const hot = document.createElement("div");
  hot.className = "vocab-flip__face vocab-flip__face--hot";

  const head = document.createElement("div");
  head.className = "widget__head";
  head.innerHTML = `<h4 class="widget__title">热点英语</h4>
    <div class="vocab-head-actions">
      <span class="vocab-speak-status" hidden></span>
      <button type="button" class="vocab-icon-btn vocab-speak-all" title="全部发音（按序，每词英→中）" aria-label="全部发音">
        ${SPEAK_ALL_ICON}
      </button>
      <button type="button" class="widget__refresh" data-widget="vocab" title="刷新热点英语" aria-label="刷新热点英语">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M3 3V8M3 8H8M3 8L6 5.29168C7.59227 3.86656 9.69494 3 12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.71683 21 4.13247 18.008 3.22302 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button type="button" class="vocab-icon-btn vocab-flip-btn" title="切换到生词本" aria-label="切换到生词本">
        ${FLIP_ICON}
      </button>
    </div>`;
  hot.append(head);

  const refreshBtn = /** @type {HTMLButtonElement | null} */ (hot.querySelector(".widget__refresh"));
  const speakAllBtn = /** @type {HTMLButtonElement | null} */ (hot.querySelector(".vocab-speak-all"));
  const statusEl = /** @type {HTMLElement | null} */ (hot.querySelector(".vocab-speak-status"));
  let clearAllSpeakUi = () => {};

  refreshBtn?.addEventListener("click", () => {
    if (!handlers.onRefresh || refreshBtn.disabled) return;
    stopSpeaking();
    clearStudySpeakUi();
    clearAllSpeakUi();
    refreshBtn.disabled = true;
    refreshBtn.classList.add("is-loading");
    void Promise.resolve(handlers.onRefresh())
      .catch((error) => console.warn("[formant] vocab refresh failed", error))
      .finally(() => {
        refreshBtn.disabled = false;
        refreshBtn.classList.remove("is-loading");
      });
  });

  const payload = /** @type {{ words?: VocabWord[], size?: number }} */ (data || {});
  const words = Array.isArray(payload.words) ? payload.words : [];
  if (!words.length) {
    const empty = document.createElement("div");
    empty.className = "widget-empty";
    empty.textContent = "暂无数据，点右上角刷新";
    hot.append(empty);
    return finishVocabCard(card, hot, study, () => {});
  }

  /** @type {HTMLButtonElement[]} */
  const speakButtons = [];

  clearAllSpeakUi = () => {
    for (const btn of speakButtons) setSpeakBtnState(btn, false);
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.textContent = "";
    }
    if (speakAllBtn) {
      speakAllBtn.classList.remove("is-speaking");
    }
  };

  /**
   * @param {HTMLButtonElement} btn
   * @param {string} word
   * @param {string} meaning
   */
  function bindSpeakOne(btn, word, meaning) {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("is-speaking")) {
        stopSpeaking();
        clearAllSpeakUi();
        clearStudySpeakUi();
        return;
      }
      clearAllSpeakUi();
      clearStudySpeakUi();
      void speakVocabWord(word, meaning, DEFAULT_ROUNDS, {
        onStart: () => setSpeakBtnState(btn, true, roundLabel(1, DEFAULT_ROUNDS)),
        onRound: (round, total) => setSpeakBtnState(btn, true, roundLabel(round, total)),
        onDone: () => setSpeakBtnState(btn, false),
      });
    });
  }

  speakAllBtn?.addEventListener("click", () => {
    if (speakAllBtn.classList.contains("is-speaking")) {
      stopSpeaking();
      clearAllSpeakUi();
      clearStudySpeakUi();
      return;
    }
    clearAllSpeakUi();
    clearStudySpeakUi();
    speakAllBtn.classList.add("is-speaking");
    let activeIndex = 0;
    void speakVocabList(words, DEFAULT_ROUNDS, {
      onStart: () => {
        if (statusEl) statusEl.hidden = false;
      },
      onWord: (index, total, word) => {
        activeIndex = index;
        for (const btn of speakButtons) setSpeakBtnState(btn, false);
        const current = speakButtons[index - 1];
        if (current) setSpeakBtnState(current, true, roundLabel(1, DEFAULT_ROUNDS));
        const item = words[index - 1];
        const meaning = String(item?.meaning || "").trim();
        const ipa = String(item?.ipa || "").trim();
        const phonetic = String(item?.phoneticZh || "").trim();
        if (statusEl) {
          statusEl.hidden = false;
          const parts = [word, ipa, meaning, phonetic].filter(Boolean);
          statusEl.title = parts.join(" · ");
          statusEl.textContent = parts.join(" · ");
        }
      },
      onRound: (round, total) => {
        const current = speakButtons[activeIndex - 1];
        if (current) setSpeakBtnState(current, true, roundLabel(round, total));
      },
      onDone: () => clearAllSpeakUi(),
    });
  });

  const list = document.createElement("ul");
  list.className = "vocab-list";
  for (const item of words) {
    const word = String(item?.word || "").trim();
    if (!word) continue;
    const meaning = String(item?.meaning || "").trim();
    const phonetic = String(item?.phoneticZh || "").trim();
    const ipa = String(item?.ipa || "").trim();
    const li = document.createElement("li");
    li.className = "vocab-item";

    const text = document.createElement("div");
    text.className = "vocab-item__text";

    const wordBlock = document.createElement("span");
    wordBlock.className = "vocab-item__word-block";
    if (ipa) {
      const ipaEl = document.createElement("span");
      ipaEl.className = "vocab-item__ipa";
      ipaEl.textContent = ipa;
      wordBlock.append(ipaEl);
    }
    const wordEl = document.createElement("span");
    wordEl.className = "vocab-item__word";
    wordEl.textContent = word;
    wordBlock.append(wordEl);

    const reveal = document.createElement("button");
    reveal.type = "button";
    reveal.className = "vocab-item__reveal is-masked";
    reveal.title = "点击显示释义与读音";
    reveal.setAttribute("aria-label", `显示 ${word} 的释义与读音`);
    const meaningEl = document.createElement("span");
    meaningEl.className = "vocab-item__meaning";
    meaningEl.textContent = `(${meaning || "…"})`;
    reveal.append(meaningEl);
    if (phonetic) {
      const phoneticEl = document.createElement("span");
      phoneticEl.className = "vocab-item__phonetic";
      phoneticEl.textContent = phonetic;
      reveal.append(phoneticEl);
    }
    reveal.addEventListener("click", () => {
      if (reveal.classList.contains("is-masked")) {
        reveal.classList.remove("is-masked");
        reveal.title = "点击隐藏";
      } else {
        reveal.classList.add("is-masked");
        reveal.title = "点击显示释义与读音";
      }
    });

    text.append(wordBlock, reveal);

    const actions = document.createElement("div");
    actions.className = "vocab-item__actions";

    const speakBtn = document.createElement("button");
    speakBtn.type = "button";
    speakBtn.className = "vocab-icon-btn vocab-icon-btn--speak";
    speakBtn.title = `朗读 ${word}（英→中，再点停止）`;
    speakBtn.setAttribute("aria-label", `朗读 ${word} 英文与中文释义`);
    speakBtn.innerHTML = SPEAK_ICON;
    speakButtons.push(speakBtn);
    bindSpeakOne(speakBtn, word, meaning);

    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "vocab-icon-btn";
    dismissBtn.title = "已会，剔除";
    dismissBtn.setAttribute("aria-label", `剔除 ${word}`);
    dismissBtn.innerHTML = DISMISS_ICON;
    dismissBtn.addEventListener("click", () => {
      if (!handlers.onDismiss) return;
      if (!window.confirm(`将「${word}」记为已会并换一个新词？`)) return;
      stopSpeaking();
      clearAllSpeakUi();
      dismissBtn.disabled = true;
      void Promise.resolve(handlers.onDismiss(word)).catch((error) => {
        dismissBtn.disabled = false;
        console.warn("[formant] vocab dismiss failed", error);
      });
    });

    actions.append(speakBtn, dismissBtn);
    li.append(text, actions);
    list.append(li);
  }
  hot.append(list);
  return finishVocabCard(card, hot, study, () => {
    stopSpeaking();
    clearAllSpeakUi();
    clearStudySpeakUi();
  });
}

/**
 * @param {HTMLElement} card
 * @param {HTMLElement} hot
 * @param {{ face?: "hot" | "study", words?: import("./study-words.js").StudyWord[] }} study
 * @param {() => void} stopAll
 */
function finishVocabCard(card, hot, study, stopAll) {
  const studyFace = renderStudyFace(Array.isArray(study.words) ? study.words : [], {
    speak(word, meaning, hooks) {
      stopAll();
      void speakVocabWord(word, speechMeaning(meaning), DEFAULT_ROUNDS, hooks);
    },
    stop() {
      stopAll();
    },
  });

  const inner = document.createElement("div");
  inner.className = "vocab-flip__inner";
  inner.append(hot, studyFace);

  const flip = document.createElement("div");
  flip.className = "vocab-flip";
  if (study.face === "study") flip.classList.add("is-study", "is-instant");
  flip.append(inner);
  card.append(flip);
  activeFlip = flip;
  if (study.face === "study") {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => flip.classList.remove("is-instant"));
    });
  }

  flip.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target?.closest(".vocab-flip-btn")) return;
    stopAll();
    const next = flip.classList.contains("is-study") ? "hot" : "study";
    card.classList.add("is-flipping");
    flip.classList.toggle("is-study", next === "study");
    void saveVocabFace(next);
  });
  inner.addEventListener("transitionend", (event) => {
    if (event.propertyName !== "transform") return;
    card.classList.remove("is-flipping");
  });
  return card;
}

/** @type {HTMLElement | null} */
let activeFlip = null;

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[VOCAB_FACE_KEY] || !activeFlip?.isConnected) return;
  const study = changes[VOCAB_FACE_KEY].newValue === "study";
  if (activeFlip.classList.contains("is-study") === study) return;
  activeFlip.classList.add("is-instant");
  activeFlip.classList.toggle("is-study", study);
  requestAnimationFrame(() => activeFlip?.classList.remove("is-instant"));
});
