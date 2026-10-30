import { evaluateExpression, formatCalcResult } from "./newtab-calc-eval.js";

const CLOSE_MS = 220;

/** @type {{ role: "user" | "bot", text: string, error?: boolean }[]} */
let messages = [];

export function mountNewtabMenu() {
  const root = document.querySelector(".top-menu");
  const button = document.getElementById("topMenuBtn");
  const list = document.getElementById("topMenuList");
  const dialog = document.getElementById("calcDialog");
  if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  if (!(list instanceof HTMLElement) || !(dialog instanceof HTMLDialogElement)) return;

  bindMenu(root, button, list, () => openCalcDialog(dialog));
  bindCalcDialog(dialog);
}

/**
 * @param {HTMLElement} root
 * @param {HTMLButtonElement} button
 * @param {HTMLElement} list
 * @param {() => void} openCalc
 */
function bindMenu(root, button, list, openCalc) {
  const items = () => [...list.querySelectorAll("[role='menuitem']")];

  const closeMenu = (focusButton = false) => {
    if (list.hidden) return;
    list.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focusButton) button.focus();
  };

  const openMenu = () => {
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const first = items()[0];
    if (first instanceof HTMLElement) first.focus();
  };

  button.addEventListener("click", () => {
    if (list.hidden) openMenu();
    else closeMenu();
  });

  list.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const item = target.closest("[data-menu]");
    if (!(item instanceof HTMLElement) || !list.contains(item)) return;
    closeMenu();
    if (item.dataset.menu === "calc") openCalc();
  });

  list.addEventListener("keydown", (event) => {
    const nodes = items();
    const current = document.activeElement;
    const index = nodes.indexOf(current);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!nodes.length) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = nodes[(index + step + nodes.length) % nodes.length];
      if (next instanceof HTMLElement) next.focus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      const next = event.key === "Home" ? nodes[0] : nodes[nodes.length - 1];
      if (next instanceof HTMLElement) next.focus();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (list.hidden) return;
    if (event.target instanceof Node && root.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || list.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu(true);
  });
}

/**
 * @param {HTMLDialogElement} dialog
 */
function bindCalcDialog(dialog) {
  const log = dialog.querySelector("[data-calc-log]");
  const form = dialog.querySelector("[data-calc-form]");
  const input = dialog.querySelector("[data-calc-input]");
  const send = dialog.querySelector("[data-calc-send]");
  if (!(log instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return;
  if (!(input instanceof HTMLInputElement) || !(send instanceof HTMLButtonElement)) return;

  const resetLog = () => {
    messages = [];
    input.value = "";
    syncSend();
    paintEmpty(log);
  };

  const syncSend = () => {
    send.disabled = input.value.trim() === "";
  };

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    syncSend();
    pushMessage(log, { role: "user", text });
    try {
      const value = evaluateExpression(text);
      pushMessage(log, { role: "bot", text: formatCalcResult(value) });
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "算式无法计算";
      pushMessage(log, { role: "bot", text: message, error: true });
    }
    input.focus();
  };

  dialog.querySelector("[data-calc-close]")?.addEventListener("click", () => closeCalcDialog(dialog));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeCalcDialog(dialog);
  });
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeCalcDialog(dialog);
  });
  dialog.addEventListener("close", resetLog);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  input.addEventListener("input", syncSend);
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    submit();
  });

  resetLog();
}

/**
 * @param {HTMLDialogElement} dialog
 */
function openCalcDialog(dialog) {
  if (dialog.open) return;
  messages = [];
  const log = dialog.querySelector("[data-calc-log]");
  const input = dialog.querySelector("[data-calc-input]");
  if (log instanceof HTMLElement) paintEmpty(log);
  if (input instanceof HTMLInputElement) input.value = "";
  dialog.querySelector("[data-calc-send]")?.toggleAttribute("disabled", true);
  dialog.classList.remove("is-closing");
  dialog.showModal();
  if (input instanceof HTMLInputElement) input.focus();
}

/**
 * @param {HTMLDialogElement} dialog
 */
function closeCalcDialog(dialog) {
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
  window.setTimeout(finish, CLOSE_MS);
}

/**
 * @param {HTMLElement} log
 */
function paintEmpty(log) {
  log.replaceChildren();
  const empty = document.createElement("p");
  empty.className = "calc-dialog__empty";
  empty.textContent = "输入算式后发送，例如 7*8+2";
  log.append(empty);
}

/**
 * @param {HTMLElement} log
 * @param {{ role: "user" | "bot", text: string, error?: boolean }} message
 */
function pushMessage(log, message) {
  messages.push(message);
  log.querySelector(".calc-dialog__empty")?.remove();
  const row = document.createElement("div");
  row.className = message.role === "user" ? "calc-msg calc-msg--user" : "calc-msg calc-msg--bot";
  if (message.error) row.classList.add("calc-msg--error");
  row.textContent = message.text;
  log.append(row);
  log.scrollTop = log.scrollHeight;
}
