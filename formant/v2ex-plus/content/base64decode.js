(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  function isPrintable(text) {
    for (let i = 0; i < text.length; i += 1) {
      const code = text.charCodeAt(i);
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) return false;
    }
    return true;
  }

  function decode(text) {
    const normalized = text.replace(/\s+/g, "");
    if (normalized.length < 12 || normalized.length % 4 !== 0) return "";
    try {
      let result = atob(normalized);
      if (!isPrintable(result)) return "";
      try {
        result = decodeURIComponent(
          [...result].map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, "0")}`).join(""),
        );
      } catch {
        // ASCII result is already suitable.
      }
      return result;
    } catch {
      return "";
    }
  }

  runtime.onReady(({ enabled, options }) => {
    if (!enabled || !options.base64) return;
    document.addEventListener(
      "mouseup",
      (event) => {
        const text = window.getSelection()?.toString() || "";
        const result = decode(text);
        if (!result) return;

        document.querySelector("[data-formant-v2ex-base64]")?.remove();
        const popup = runtime.mark(document.createElement("div"));
        popup.dataset.formantV2exBase64 = "true";
        popup.className = "formant-v2ex-base64";
        popup.textContent = result;

        const copy = runtime.mark(document.createElement("button"));
        copy.type = "button";
        copy.textContent = "复制";
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(result);
            copy.textContent = "已复制";
          } catch {
            copy.textContent = "复制失败";
          }
        });
        popup.append(" ", copy);
        document.body.append(popup);

        const target = event.target instanceof Element ? event.target : document.body;
        const rect = target.getBoundingClientRect();
        popup.style.top = `${Math.max(8, rect.top + window.scrollY - popup.offsetHeight - 8)}px`;
        popup.style.left = `${Math.max(8, rect.left + window.scrollX)}px`;
        window.setTimeout(() => popup.remove(), 5_000);
      },
      true,
    );
  });
})();
