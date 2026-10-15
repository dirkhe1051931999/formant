(() => {
  if (globalThis.__formantV2ex) return;

  const DEFAULT_OPTIONS = {
    checkin: 1,
    msgNote: 1,
    chickinNote: 1,
    preview: 1,
    ignore: 1,
    fold: 1,
    jump: 1,
    newWindow: 0,
    replyUserNum: 1,
    relateReply: 1,
    nestedComment: 1,
    autoNestedComment: 0,
    imageParsing: 1,
    opReplyBg: 0,
    replyColor: "#fff94d",
    replyA: 0.4,
    thankColor: "#cccccc",
    weekNewuser: 0,
    vDaily: 0,
    userinfo: 1,
    markColor: "#ff0000",
    userMarkList: [],
    sov2ex: 0,
    sov2exMenu: 0,
    searchShortcut: 1,
    dblclickToTop: 0,
    base64: 1,
  };

  /** @type {{ enabled: boolean, imgurClientId: string, options: typeof DEFAULT_OPTIONS, ready: boolean }} */
  let state = {
    enabled: false,
    imgurClientId: "",
    options: { ...DEFAULT_OPTIONS, userMarkList: [] },
    ready: false,
  };
  /** @type {((state: typeof state) => void)[]} */
  const readyListeners = [];
  /** @type {((state: typeof state) => void)[]} */
  const changeListeners = [];

  function normalizeOptions(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const next = { ...DEFAULT_OPTIONS, userMarkList: [] };
    for (const [key, fallback] of Object.entries(DEFAULT_OPTIONS)) {
      if (typeof fallback === "number" && (typeof source[key] === "boolean" || typeof source[key] === "number")) {
        next[key] = source[key] ? 1 : 0;
      }
    }
    for (const key of ["replyColor", "thankColor", "markColor"]) {
      if (/^#[0-9a-f]{6}$/i.test(String(source[key] || ""))) {
        next[key] = String(source[key]).toLowerCase();
      }
    }
    const opacity = Number(source.replyA);
    if (Number.isFinite(opacity)) next.replyA = Math.min(1, Math.max(0, opacity));
    if (Array.isArray(source.userMarkList)) {
      next.userMarkList = [...new Set(source.userMarkList.map((v) => String(v || "").trim()).filter(Boolean))];
    }
    return next;
  }

  function emit(list) {
    for (const listener of [...list]) {
      try {
        listener(state);
      } catch (error) {
        console.warn("[formant] V2EX content listener failed", error);
      }
    }
  }

  async function refresh() {
    const [featureData, optionsData] = await Promise.all([
      chrome.storage.local.get(["formantFeatures", "formantV2exImgurClientId"]),
      chrome.storage.sync.get("options"),
    ]);
    const priorEnabled = state.enabled;
    const priorImgurClientId = state.imgurClientId;
    const wasReady = state.ready;
    const features = featureData.formantFeatures;
    state = {
      enabled: features?.v2ex?.enabled !== false,
      imgurClientId: String(featureData.formantV2exImgurClientId || "").trim(),
      options: normalizeOptions(optionsData.options),
      ready: true,
    };

    if (optionsData.options === undefined) {
      void chrome.storage.sync.set({ options: state.options });
    }
    if (!wasReady) {
      const initialListeners = readyListeners.splice(0);
      emit(initialListeners);
    } else {
      emit(changeListeners);
    }

    // Master-switch and upload credential changes need a clean content setup.
    if (
      wasReady &&
      (priorEnabled !== state.enabled || priorImgurClientId !== state.imgurClientId)
    ) {
      window.location.reload();
    }
  }

  globalThis.__formantV2ex = {
    onReady(listener) {
      if (state.ready) listener(state);
      else readyListeners.push(listener);
    },
    onChange(listener) {
      changeListeners.push(listener);
    },
    getState() {
      return state;
    },
    mark(node) {
      if (node instanceof Element) node.dataset.formantV2ex = "true";
      return node;
    },
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (
      (area === "local" && (changes.formantFeatures || changes.formantV2exImgurClientId)) ||
      (area === "sync" && changes.options)
    ) {
      void refresh();
    }
  });

  void refresh();
})();
