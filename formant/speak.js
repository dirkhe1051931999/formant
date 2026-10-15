/** @type {HTMLAudioElement | null} */
let currentAudio = null;
/** @type {HTMLElement | null} */
let activeSpeakBtn = null;

/**
 * @param {string} text
 * @returns {string}
 */
export function guessSpeakLang(text) {
  const s = String(text || "");
  if (/[\u4e00-\u9fff]/.test(s)) return "zh-CN";
  if (/[\u3040-\u30ff]/.test(s)) return "ja";
  if (/[\uac00-\ud7af]/.test(s)) return "ko";
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s)) return "tr";
  if (/[àâäéèêëïîôùûüç]/i.test(s)) return "fr";
  if (/[äöüß]/i.test(s)) return "de";
  if (/[áéíóúñ¿¡]/i.test(s)) return "es";
  return "en";
}

/**
 * @param {string} lang
 */
function toTtsLang(lang) {
  const raw = String(lang || "en").replace("_", "-");
  if (raw.toLowerCase().startsWith("zh")) return "zh-CN";
  return raw.split("-")[0] || "en";
}

function clearSpeakingUi() {
  if (!activeSpeakBtn) return;
  activeSpeakBtn.classList.remove("is-speaking");
  activeSpeakBtn.removeAttribute("aria-busy");
  activeSpeakBtn = null;
}

/**
 * @param {HTMLElement | null | undefined} button
 */
function setSpeakingUi(button) {
  clearSpeakingUi();
  if (!(button instanceof HTMLElement)) return;
  activeSpeakBtn = button;
  button.classList.add("is-speaking");
  button.setAttribute("aria-busy", "true");
}

function stopCurrentPlayback() {
  if (currentAudio) {
    const prev = currentAudio;
    currentAudio = null;
    try {
      prev.pause();
      prev.removeAttribute("src");
      prev.load();
    } catch {
      // ignore
    }
  }
  if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
}

/**
 * Pronounce text via Google Translate TTS, with speechSynthesis fallback.
 * Pass the speaker button to show a playing animation while audio runs.
 * @param {string} text
 * @param {string} [lang]
 * @param {HTMLElement | null} [button]
 */
export async function speakText(text, lang, button) {
  const q = String(text || "").trim();
  if (!q) return;
  const tl = toTtsLang(lang || guessSpeakLang(q));
  const clip = q.slice(0, 200);

  stopCurrentPlayback();
  setSpeakingUi(button);

  try {
    const url =
      "https://translate.googleapis.com/translate_tts" +
      `?client=gtx&ie=UTF-8&tl=${encodeURIComponent(tl)}&q=${encodeURIComponent(clip)}`;
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      if (currentAudio !== audio) return;
      currentAudio = null;
      clearSpeakingUi();
    };
    audio.addEventListener("ended", done);
    audio.addEventListener("error", done);
    await audio.play();
    return;
  } catch {
    // fall through to speechSynthesis
  }

  if (typeof speechSynthesis === "undefined") {
    clearSpeakingUi();
    return;
  }

  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clip);
  utterance.lang = tl === "zh-CN" ? "zh-CN" : tl;
  utterance.onend = () => clearSpeakingUi();
  utterance.onerror = () => clearSpeakingUi();
  speechSynthesis.speak(utterance);
}
