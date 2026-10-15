(() => {
  "use strict";

  /**
   * MAIN world: neutralize disable-devtool punishment (history.back / wipe)
   * before the CDN script runs. Isolated world toggles via CustomEvent.
   */
  const CMD = "formant-huavod-cmd";
  let enabled = true;
  /** @type {unknown} */
  let ddRef = undefined;
  let ddHooked = false;

  function userGesture() {
    try {
      return Boolean(navigator.userActivation?.isActive);
    } catch {
      return false;
    }
  }

  function suspendDisableDevtool(value) {
    if (!value || (typeof value !== "object" && typeof value !== "function")) return;
    try {
      value.isSuspend = true;
    } catch {
      /* ignore */
    }
  }

  function hookDisableDevtool() {
    if (ddHooked) return;
    ddHooked = true;
    try {
      if ("DisableDevtool" in window) {
        ddRef = window.DisableDevtool;
        suspendDisableDevtool(ddRef);
      }
      Object.defineProperty(window, "DisableDevtool", {
        configurable: true,
        enumerable: true,
        get() {
          return ddRef;
        },
        set(value) {
          ddRef = value;
          if (enabled) suspendDisableDevtool(value);
        },
      });
    } catch (error) {
      console.warn("[formant] huavod DisableDevtool hook failed", error);
    }
  }

  function patchHistory() {
    const proto = History.prototype;
    const rawBack = proto.back;
    const rawGo = proto.go;
    proto.back = function formantHuavodBack(...args) {
      if (!enabled || userGesture()) return rawBack.apply(this, args);
    };
    proto.go = function formantHuavodGo(delta, ...rest) {
      const n = Number(delta);
      if (!enabled || userGesture() || !(n < 0)) return rawGo.call(this, delta, ...rest);
    };
  }

  function tick() {
    if (!enabled) return;
    suspendDisableDevtool(ddRef);
    try {
      if (window.DisableDevtool) suspendDisableDevtool(window.DisableDevtool);
    } catch {
      /* ignore */
    }
  }

  hookDisableDevtool();
  patchHistory();
  window.setInterval(tick, 250);

  window.addEventListener(CMD, (event) => {
    const detail = event instanceof CustomEvent ? event.detail : null;
    if (!detail || typeof detail !== "object") return;
    if (detail.type !== "SET_ENABLED") return;
    enabled = detail.enabled === true;
    if (enabled) tick();
  });
})();
