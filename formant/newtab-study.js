/**
 * New Tab 生词本面：最近 5 条直接显示，更多走分页 dialog。
 */

import {
  STUDY_WORDS_KEY,
  backfillStudyIpa,
  normalizeStudyWords,
  removeStudyWord,
} from "./study-words.js";

const CARD_LIMIT = 5;
const PAGE_SIZE = 20;
const STUDY_DIALOG_MS = 220;

/**
 * @param {HTMLDialogElement} dialog
 */
function closeStudyDialog(dialog) {
  if (!dialog.open || dialog.classList.contains("is-closing")) return;
  dialog.classList.add("is-closing");
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    dialog.classList.remove("is-closing");
    dialog.close();
  };
  const onEnd = (event) => {
    if (event.target !== dialog) return;
    dialog.removeEventListener("transitionend", onEnd);
    finish();
  };
  dialog.addEventListener("transitionend", onEnd);
  window.setTimeout(finish, STUDY_DIALOG_MS);
}

/**
 * @param {HTMLDialogElement} dialog
 */
function openStudyDialogModal(dialog) {
  dialog.classList.remove("is-closing");
  dialog.showModal();
}

const SPEAK_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><polygon points="1.75 5.75 1.75 10.25 4.25 10.25 8.25 13.25 8.25 2.75 4.25 5.75"/><path d="m10.75 6.25s1 .5 1 1.75-1 1.75-1 1.75m1-6.5c2 1 3 2.5 3 4.75s-1 3.75-3 4.75"/></svg>`;

const FLIP_ICON = `<svg viewBox="0 0 16 16" fill="none" aria-hidden="true" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"><path d="M3.25 6.25h7.2L8.2 4"/><path d="M12.75 9.75H5.55L7.8 12"/></svg>`;

const DISMISS_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;

const DEFAULT_ROUNDS = 1;

/**
 * @typedef {import("./study-words.js").StudyWord} StudyWord
 * @typedef {{
 *   speak: (word: string, meaning: string, hooks: { onStart?: () => void, onRound?: (round: number, total: number) => void, onDone?: () => void }) => void,
 *   stop: () => void,
 * }} StudySpeak
 */

/** @type {HTMLElement | null} */
let activeBody = null;
/** @type {StudySpeak | null} */
let activeSpeak = null;
/** @type {StudyWord[]} */
let dialogWords = [];
let dialogPage = 0;
let dialogReady = false;

export function clearStudySpeakUi() {
  document.querySelectorAll(".vocab-item--study .vocab-icon-btn--speak.is-speaking").forEach((btn) => {
    btn.classList.remove("is-speaking");
    btn.querySelector(".vocab-speak-badge")?.remove();
  });
}

/**
 * @param {HTMLButtonElement} btn
 * @param {boolean} speaking
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
 * @param {HTMLElement} parent
 * @param {StudyWord} item
 * @param {StudySpeak} speakApi
 */
function appendStudyRow(parent, item, speakApi) {
  const li = document.createElement("li");
  li.className = "vocab-item vocab-item--study";

  const text = document.createElement("div");
  text.className = "vocab-item__text";

  const wordBlock = document.createElement("span");
  wordBlock.className = "vocab-item__word-block";
  if (item.ipa) {
    const ipaEl = document.createElement("span");
    ipaEl.className = "vocab-item__ipa";
    ipaEl.textContent = `/${item.ipa}/`;
    wordBlock.append(ipaEl);
  }
  const wordEl = document.createElement("span");
  wordEl.className = "vocab-item__word";
  wordEl.textContent = item.word;
  wordBlock.append(wordEl);

  const meaningEl = document.createElement("span");
  meaningEl.className = "vocab-item__meaning";
  meaningEl.textContent = item.meaning;
  meaningEl.title = item.meaning;
  text.append(wordBlock, meaningEl);

  const actions = document.createElement("div");
  actions.className = "vocab-item__actions";

  const speakBtn = document.createElement("button");
  speakBtn.type = "button";
  speakBtn.className = "vocab-icon-btn vocab-icon-btn--speak";
  speakBtn.title = `朗读 ${item.word}`;
  speakBtn.setAttribute("aria-label", `朗读 ${item.word}`);
  speakBtn.innerHTML = SPEAK_ICON;
  speakBtn.addEventListener("click", () => {
    if (speakBtn.classList.contains("is-speaking")) {
      speakApi.stop();
      clearStudySpeakUi();
      return;
    }
    clearStudySpeakUi();
    speakApi.speak(item.word, item.meaning, {
      onStart: () => setSpeakBtnState(speakBtn, true),
      onRound: (round, total) => setSpeakBtnState(speakBtn, true, total > 1 ? `${round}/${total}` : ""),
      onDone: () => setSpeakBtnState(speakBtn, false),
    });
  });

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "vocab-icon-btn vocab-icon-btn--quiet";
  removeBtn.title = "移出";
  removeBtn.setAttribute("aria-label", `移出 ${item.word}`);
  removeBtn.innerHTML = DISMISS_ICON;
  removeBtn.addEventListener("click", () => {
    removeBtn.disabled = true;
    void removeStudyWord(item.word).catch((error) => {
      removeBtn.disabled = false;
      console.warn("[formant] study word remove failed", error);
    });
  });

  actions.append(speakBtn, removeBtn);
  li.append(text, actions);
  parent.append(li);
}

/**
 * @param {HTMLElement} body
 * @param {StudyWord[]} words
 * @param {StudySpeak} speakApi
 */
function paintStudyBody(body, words, speakApi) {
  body.replaceChildren();
  if (!words.length) {
    const empty = document.createElement("p");
    empty.className = "empty-status";
    empty.textContent = "暂无生词";
    body.append(empty);
    return;
  }

  const list = document.createElement("ul");
  list.className = "vocab-list";
  for (const item of words.slice(0, CARD_LIMIT)) appendStudyRow(list, item, speakApi);
  body.append(list);

  if (words.length > CARD_LIMIT) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "study-more";
    more.textContent = "查看更多";
    more.addEventListener("click", () => openStudyDialog(words, speakApi));
    body.append(more);
  }
}

function ensureDialog() {
  const dialog = document.getElementById("studyDialog");
  if (!(dialog instanceof HTMLDialogElement)) return null;
  if (!dialogReady) {
    dialogReady = true;
    dialog.querySelector("[data-study-close]")?.addEventListener("click", () => closeStudyDialog(dialog));
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) closeStudyDialog(dialog);
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      closeStudyDialog(dialog);
    });
    dialog.querySelector("[data-study-prev]")?.addEventListener("click", () => {
      dialogPage = Math.max(0, dialogPage - 1);
      paintDialogPage();
    });
    dialog.querySelector("[data-study-next]")?.addEventListener("click", () => {
      dialogPage += 1;
      paintDialogPage();
    });
  }
  return dialog;
}

function paintDialogPage() {
  const dialog = ensureDialog();
  if (!dialog || !activeSpeak) return;
  const pages = Math.max(1, Math.ceil(dialogWords.length / PAGE_SIZE));
  if (dialogPage > pages - 1) dialogPage = pages - 1;
  if (dialogPage < 0) dialogPage = 0;
  const slice = dialogWords.slice(dialogPage * PAGE_SIZE, (dialogPage + 1) * PAGE_SIZE);
  const listHost = dialog.querySelector("[data-study-list]");
  const pageEl = dialog.querySelector("[data-study-page]");
  const prev = dialog.querySelector("[data-study-prev]");
  const next = dialog.querySelector("[data-study-next]");
  if (listHost) {
    listHost.replaceChildren();
    if (!slice.length) {
      const empty = document.createElement("p");
      empty.className = "empty-status";
      empty.textContent = "暂无生词";
      listHost.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "vocab-list study-dialog__list";
      for (const item of slice) appendStudyRow(list, item, activeSpeak);
      listHost.append(list);
    }
  }
  if (pageEl) pageEl.textContent = dialogWords.length ? `${dialogPage + 1} / ${pages}` : "";
  if (prev instanceof HTMLButtonElement) prev.disabled = dialogPage <= 0;
  if (next instanceof HTMLButtonElement) next.disabled = dialogPage >= pages - 1 || !dialogWords.length;
}

/**
 * @param {StudyWord[]} words
 * @param {StudySpeak} speakApi
 */
function openStudyDialog(words, speakApi) {
  const dialog = ensureDialog();
  if (!dialog) return;
  activeSpeak = speakApi;
  dialogWords = words;
  dialogPage = 0;
  paintDialogPage();
  if (!dialog.open) openStudyDialogModal(dialog);
}

/**
 * @param {StudyWord[]} words
 * @param {StudySpeak} speakApi
 */
export function renderStudyFace(words, speakApi) {
  const face = document.createElement("div");
  face.className = "vocab-flip__face vocab-flip__face--study";

  const head = document.createElement("div");
  head.className = "widget__head";
  head.innerHTML = `<h4 class="widget__title">生词本</h4>
    <div class="vocab-head-actions">
      <button type="button" class="vocab-icon-btn vocab-flip-btn" title="切换到热点英语" aria-label="切换到热点英语">
        ${FLIP_ICON}
      </button>
    </div>`;
  face.append(head);

  const body = document.createElement("div");
  body.className = "study-face__body";
  face.append(body);
  activeBody = body;
  activeSpeak = speakApi;
  paintStudyBody(body, words, speakApi);
  void backfillStudyIpa(words);
  return face;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[STUDY_WORDS_KEY] || !activeBody?.isConnected || !activeSpeak) return;
  const words = normalizeStudyWords(changes[STUDY_WORDS_KEY].newValue);
  dialogWords = words;
  paintStudyBody(activeBody, words, activeSpeak);
  void backfillStudyIpa(words);
  const dialog = document.getElementById("studyDialog");
  if (dialog instanceof HTMLDialogElement && dialog.open) paintDialogPage();
});
