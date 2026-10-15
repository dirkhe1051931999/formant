(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  runtime.onReady(({ enabled, options }) => {
    if (!enabled || !options.dblclickToTop) return;
    document.addEventListener("dblclick", (event) => {
      if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable='true']")) {
        return;
      }
      window.getSelection()?.removeAllRanges();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
})();
