(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  function addSlashIcon(container) {
    if (container.querySelector("[data-formant-v2ex-slash]")) return;
    const icon = runtime.mark(document.createElement("span"));
    icon.dataset.formantV2exSlash = "true";
    icon.className = "formant-v2ex-search-key";
    icon.textContent = "/";
    container.append(icon);
  }

  runtime.onReady(({ enabled, options }) => {
    if (!enabled) return;
    const nativeSearch = /** @type {HTMLInputElement | null} */ (document.getElementById("search"));
    const container = document.getElementById("search-container");
    if (!nativeSearch || !container) return;

    /** @type {HTMLInputElement} */
    let activeSearch = nativeSearch;
    if (options.sov2ex && !document.querySelector("[data-formant-v2ex-sov2ex]")) {
      const replacement = /** @type {HTMLInputElement} */ (nativeSearch.cloneNode(true));
      replacement.dataset.formantV2exSov2ex = "true";
      replacement.placeholder = "使用 sov2ex 搜索";
      nativeSearch.id = "formant-v2ex-native-search";
      nativeSearch.hidden = true;
      nativeSearch.after(replacement);
      activeSearch = replacement;

      replacement.addEventListener("input", () => {
        nativeSearch.value = replacement.value;
        nativeSearch.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      });
      replacement.addEventListener("keyup", () => {
        const lastItem = document.querySelector(".search-item:last-child");
        if (lastItem instanceof HTMLAnchorElement) {
          lastItem.href = `https://www.sov2ex.com/?q=${encodeURIComponent(replacement.value)}`;
          lastItem.textContent = `sov2ex ${replacement.value}`;
        }
      });
      replacement.addEventListener("keydown", (event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        window.location.assign(`https://www.sov2ex.com/?q=${encodeURIComponent(replacement.value)}`);
      });
    }

    if (!options.searchShortcut) return;
    addSlashIcon(container);
    document.addEventListener("keydown", (event) => {
      if (
        event.key !== "/" ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        document.activeElement?.matches("input, textarea, [contenteditable='true']")
      ) {
        return;
      }
      event.preventDefault();
      container.classList.add("active");
      activeSearch.focus();
    });
  });
})();
