(() => {
  "use strict";

  const bootstrap = globalThis.FormantHuavodBootstrap;
  if (!bootstrap) return;

  const CMD = "formant-huavod-cmd";

  /**
   * @param {{ enabled: boolean }} state
   */
  function apply(state) {
    window.dispatchEvent(
      new CustomEvent(CMD, {
        detail: { type: "SET_ENABLED", enabled: state.enabled === true },
      }),
    );
  }

  void bootstrap.ready.then(apply);
  bootstrap.subscribe(apply);
})();
