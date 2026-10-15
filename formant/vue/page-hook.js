(() => {
  "use strict";

  if (window.__FORMANT_VUE__) return;

  const $ = (sel, root = document) => root.querySelector(sel);
  const MAX_DEPTH = 12;
  const MAX_NODES = 400;
  const HOST_ID = "formant-vue-box";

  function trackVue2(Vue) {
    if (!Vue || Vue.__formantTracked || typeof Vue.mixin !== "function") return;
    Vue.__formantTracked = true;
    if (!Array.isArray(hook.__formantRoots)) hook.__formantRoots = [];
    Vue.mixin({
      beforeCreate() {
        if (this.$parent) return;
        const roots = hook.__formantRoots;
        if (roots.indexOf(this) === -1) roots.push(this);
      },
      destroyed() {
        const roots = hook.__formantRoots || [];
        const index = roots.indexOf(this);
        if (index >= 0) roots.splice(index, 1);
      },
    });
  }

  function createHook() {
    /** @type {Map<string, Function[]>} */
    const listeners = new Map();
    const hook = {
      devtoolsVersion: "formant",
      Vue: null,
      enabled: true,
      apps: [],
      /**
       * @param {string} event
       * @param {Function} fn
       */
      on(event, fn) {
        const list = listeners.get(event) || [];
        list.push(fn);
        listeners.set(event, list);
      },
      /**
       * @param {string} event
       * @param {Function} fn
       */
      once(event, fn) {
        const wrap = (/** @type {unknown[]} */ ...args) => {
          hook.off(event, wrap);
          fn(...args);
        };
        hook.on(event, wrap);
      },
      /**
       * @param {string} event
       * @param {Function} [fn]
       */
      off(event, fn) {
        const list = listeners.get(event);
        if (!list) return;
        if (!fn) listeners.delete(event);
        else listeners.set(event, list.filter((item) => item !== fn));
      },
      /**
       * @param {string} event
       * @param {...unknown} args
       */
      emit(event, ...args) {
        const list = (listeners.get(event) || []).slice();
        for (const fn of list) {
          try {
            fn(...args);
          } catch (error) {
            console.error("[formant] vue hook", event, error);
          }
        }
      },
      cleanupBuffer() {
        return false;
      },
    };
    hook.on("init", (Vue) => {
      hook.Vue = Vue;
      trackVue2(Vue);
    });
    hook.on("vuex:init", (store) => {
      hook.store = store;
    });
    hook.on("app:init", (app, version, types) => {
      hook.apps.push({ app, version, types });
    });
    hook.on("app:unmount", (app) => {
      hook.apps = hook.apps.filter((entry) => entry.app !== app);
    });
    return hook;
  }

  const existing = window.__VUE_DEVTOOLS_GLOBAL_HOOK__;
  const hook = existing || createHook();
  if (!existing) {
    Object.defineProperty(window, "__VUE_DEVTOOLS_GLOBAL_HOOK__", {
      configurable: true,
      get() {
        return hook;
      },
    });
    const queued = window.__VUE_DEVTOOLS_HOOK_REPLAY__;
    if (Array.isArray(queued)) {
      for (const replay of queued) {
        try {
          replay(hook);
        } catch (error) {
          console.error("[formant] vue hook replay", error);
        }
      }
      window.__VUE_DEVTOOLS_HOOK_REPLAY__ = [];
    }
  }
  if (hook.Vue) trackVue2(hook.Vue);

  /** @type {Map<number, { kind: "vue3" | "vue2", target: any }>} */
  let registry = new Map();
  let seq = 1;
  let nodes = 0;
  let enabled = true;
  /** @type {number | null} */
  let highlightedId = null;

  /**
   * @param {unknown} value
   * @param {number} depth
   * @param {WeakSet<object>} seen
   */
  function clone(value, depth, seen) {
    if (value == null) return value;
    const kind = typeof value;
    if (kind === "string") return value.length > 160 ? `${value.slice(0, 160)}…` : value;
    if (kind === "number" || kind === "boolean") return value;
    if (kind === "bigint") return String(value);
    if (kind === "function") return "[Function]";
    if (kind !== "object") return String(value);
    if (value instanceof Date) return value.toISOString();
    if (typeof Node === "function" && value instanceof Node) {
      return value.nodeType === 1 ? `<${value.nodeName.toLowerCase()}>` : "[Node]";
    }
    if (depth <= 0) return "[…]";
    if (seen.has(value)) return "[Circular]";
    if (value.__v_isRef) return clone(value.value, depth - 1, seen);
    if (value.vnode && value.type && typeof value.uid === "number") return "[Component]";
    seen.add(value);
    if (Array.isArray(value)) {
      return value.slice(0, 16).map((item) => clone(item, depth - 1, seen));
    }
    /** @type {Record<string, unknown>} */
    const out = {};
    let count = 0;
    for (const key of Object.keys(value)) {
      if (count >= 20) {
        out["…"] = true;
        break;
      }
      if (key === "__proto__" || key === "constructor" || key === "__ob__" || key.startsWith("__v_") || key === "dep") continue;
      count += 1;
      try {
        out[key] = clone(value[key], depth - 1, seen);
      } catch {
        out[key] = "[Unreadable]";
      }
    }
    return out;
  }

  /**
   * @param {any} type
   */
  function componentName(type) {
    if (!type) return "Anonymous";
    if (typeof type === "string") return type;
    if (typeof type.name === "string" && type.name) return type.name;
    if (typeof type.__name === "string" && type.__name) return type.__name;
    if (typeof type.__file === "string" && type.__file) {
      const part = type.__file.split(/[/\\]/).pop() || "";
      return part.replace(/\.\w+$/, "") || "Anonymous";
    }
    return "Anonymous";
  }

  /**
   * @param {any} instance
   * @param {number} depth
   * @param {Set<any>} trail
   */
  function walk3(instance, depth, trail) {
    if (!instance || trail.has(instance) || nodes >= MAX_NODES) return null;
    trail.add(instance);
    nodes += 1;
    const id = seq++;
    registry.set(id, { kind: "vue3", target: instance });
    /** @type {any[]} */
    const children = [];
    if (depth < MAX_DEPTH && instance.subTree) {
      /** @type {any[]} */
      const found = [];
      const seenVnode = new Set();
      const visit = (/** @type {any} */ vnode) => {
        if (!vnode || typeof vnode !== "object" || seenVnode.has(vnode) || found.length >= 40) return;
        seenVnode.add(vnode);
        if (vnode.component && vnode.component !== instance) {
          found.push(vnode.component);
          return;
        }
        const kids = vnode.children;
        if (Array.isArray(kids)) kids.forEach(visit);
        else if (kids && typeof kids === "object") visit(kids);
        if (vnode.suspense?.activeBranch) visit(vnode.suspense.activeBranch);
        if (Array.isArray(vnode.dynamicChildren)) vnode.dynamicChildren.forEach(visit);
      };
      visit(instance.subTree);
      for (const child of found) {
        const node = walk3(child, depth + 1, trail);
        if (node) children.push(node);
      }
    }
    return { id, name: componentName(instance.type), children };
  }

  /**
   * @param {any} vm
   * @param {number} depth
   * @param {Set<any>} trail
   */
  function walk2(vm, depth, trail) {
    if (!vm || trail.has(vm) || nodes >= MAX_NODES) return null;
    trail.add(vm);
    nodes += 1;
    const id = seq++;
    registry.set(id, { kind: "vue2", target: vm });
    /** @type {any[]} */
    const children = [];
    if (depth < MAX_DEPTH) {
      for (const child of vue2Kids(vm)) {
        const node = walk2(child, depth + 1, trail);
        if (node) children.push(node);
      }
    }
    return { id, name: vue2Name(vm), children };
  }

  function rememberMountedApps() {
    const nodesInPage = document.getElementsByTagName("*");
    const limit = Math.min(nodesInPage.length, 5000);
    for (let i = 0; i < limit; i += 1) {
      const app = nodesInPage[i].__vue_app__;
      if (!app || hook.apps.some((entry) => entry.app === app)) continue;
      hook.apps.push({ app, version: app.version || "", types: null });
    }
  }

  function vue2Name(vm) {
    const options = vm?.$options || {};
    if (options.name) return String(options.name);
    if (options._componentTag) return String(options._componentTag);
    if (typeof options.__file === "string" && options.__file) {
      const part = options.__file.split(/[/\\]/).pop() || "";
      return part.replace(/\.\w+$/, "") || "Anonymous";
    }
    return vm?.$root === vm ? "Root" : "Anonymous";
  }

  function vue2Roots() {
    /** @type {any[]} */
    const roots = [];
    const seen = new Set();
    const push = (vm) => {
      if (!vm || vm.$parent || seen.has(vm)) return;
      seen.add(vm);
      roots.push(vm);
    };
    for (const vm of hook.__formantRoots || []) push(vm);
    const nodesInPage = document.getElementsByTagName("*");
    const limit = Math.min(nodesInPage.length, 20000);
    for (let i = 0; i < limit; i += 1) push(nodesInPage[i].__vue__);
    return roots;
  }

  function vue2Kids(vm) {
    if (Array.isArray(vm.$children) && vm.$children.length) return vm.$children.slice(0, 40);
    /** @type {any[]} */
    const found = [];
    const visit = (/** @type {any} */ vnode) => {
      if (!vnode || found.length >= 40) return;
      if (vnode.componentInstance && vnode.componentInstance !== vm) {
        found.push(vnode.componentInstance);
        return;
      }
      if (Array.isArray(vnode.children)) vnode.children.forEach(visit);
    };
    visit(vm._vnode || vm.$vnode);
    return found;
  }

  /**
   * @param {any} app
   */
  function vue3Stores(app) {
    const globals = app?.config?.globalProperties;
    return {
      pinia: Boolean(globals?.$pinia?.state?.value),
      vuex: Boolean(globals?.$store?.state),
    };
  }

  /** @type {any[]} */
  let lastVue2Roots = [];

  function snapshot() {
    if (!enabled) return { enabled: false, apps: [] };
    rememberMountedApps();
    registry = new Map();
    seq = 1;
    nodes = 0;
    /** @type {any[]} */
    const apps = [];
    hook.apps.forEach((entry, index) => {
      const root = entry.app?._instance;
      if (!root) return;
      const tree = walk3(root, 0, new Set());
      if (!tree) return;
      const stores = vue3Stores(entry.app);
      apps.push({
        index,
        version: String(entry.version || entry.app?.version || "3"),
        hasPinia: stores.pinia,
        hasVuex: stores.vuex,
        tree,
      });
    });
    lastVue2Roots = vue2Roots();
    lastVue2Roots.forEach((vm, index) => {
      const tree = walk2(vm, 0, new Set());
      if (!tree) return;
      apps.push({
        index,
        version: String(hook.Vue?.version || "2"),
        hasPinia: Boolean(vm.$pinia?.state?.value),
        hasVuex: Boolean(vm.$store?.state || hook.store?.state),
        tree,
        vue2: true,
      });
    });
    if (!lastVue2Roots.length && hook.store?.state && !apps.some((app) => app.hasVuex)) {
      const id = seq++;
      apps.push({
        index: 0,
        version: String(hook.Vue?.version || "2"),
        hasPinia: false,
        hasVuex: true,
        tree: { id, name: "Vuex", children: [] },
        vue2: true,
      });
    }
    return { enabled: true, apps };
  }

  /**
   * @param {number} id
   */
  function details(id) {
    const hit = registry.get(id);
    if (!enabled || !hit) return null;
    const seen = new WeakSet();
    if (hit.kind === "vue3") {
      const instance = hit.target;
      return {
        name: componentName(instance.type),
        props: clone(instance.props, 4, seen),
        setup: clone(instance.setupState, 4, seen),
        data: clone(instance.data, 4, seen),
        attrs: clone(instance.attrs, 3, seen),
      };
    }
    const vm = hit.target;
    return {
      name: vue2Name(vm),
      props: clone(vm.$props, 4, seen),
      data: clone(vm.$data, 4, seen),
      attrs: clone(vm.$attrs, 3, seen),
    };
  }

  /**
   * @param {number} index
   * @param {boolean} vue2
   * @param {string} kind
   */
  function store(index, vue2, kind) {
    if (!enabled) return null;
    const seen = new WeakSet();
    if (vue2) {
      const vm = lastVue2Roots[index];
      if (kind === "pinia" && vm?.$pinia?.state?.value) {
        return { kind: "pinia", state: clone(vm.$pinia.state.value, 4, seen) };
      }
      const raw = vm?.$store || hook.store;
      if (raw?.state) return { kind: "vuex", state: clone(raw.state, 4, seen) };
      return null;
    }
    const globals = hook.apps[index]?.app?.config?.globalProperties;
    if (kind === "pinia" && globals?.$pinia?.state?.value) {
      return { kind: "pinia", state: clone(globals.$pinia.state.value, 4, seen) };
    }
    if (globals?.$store?.state) return { kind: "vuex", state: clone(globals.$store.state, 4, seen) };
    return null;
  }

  function clearHighlight() {
    highlightedId = null;
    $(`#${HOST_ID}`)?.remove();
  }

  function positionHighlight() {
    if (highlightedId == null) return;
    const hit = registry.get(highlightedId);
    const raw = hit?.kind === "vue3" ? hit.target?.vnode?.el || hit.target?.subTree?.el : hit?.target?.$el;
    const el = raw && raw.nodeType === 1 ? raw : null;
    const host = $(`#${HOST_ID}`);
    if (!el || !host?.shadowRoot) {
      clearHighlight();
      return;
    }
    const rect = el.getBoundingClientRect();
    const box = host.shadowRoot.querySelector(".box");
    const tag = host.shadowRoot.querySelector(".tag");
    if (!box || !tag) return;
    box.style.top = `${rect.top}px`;
    box.style.left = `${rect.left}px`;
    box.style.width = `${rect.width}px`;
    box.style.height = `${rect.height}px`;
    tag.style.top = `${Math.max(0, rect.top - 18)}px`;
    tag.style.left = `${rect.left}px`;
    tag.textContent = hit.kind === "vue3" ? componentName(hit.target.type) : hit.target.$options?.name || "Anonymous";
  }

  /**
   * @param {number | null} id
   */
  function highlight(id) {
    if (!enabled || id == null) {
      clearHighlight();
      return;
    }
    highlightedId = id;
    let host = $(`#${HOST_ID}`);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483646";
      const root = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = ".box{position:fixed;border:2px solid #1f4b99;background:rgba(31,75,153,.16);box-sizing:border-box}.tag{position:fixed;background:#1f4b99;color:#fff;font:12px/1.2 sans-serif;padding:2px 6px;border-radius:4px}";
      const box = document.createElement("div");
      box.className = "box";
      const tag = document.createElement("div");
      tag.className = "tag";
      root.append(style, box, tag);
      document.documentElement.append(host);
    }
    positionHighlight();
  }

  let sawVue = false;
  function announce() {
    const roots = hook.__formantRoots;
    const present = enabled && (hook.apps.some((entry) => entry.app && entry.app._instance) || Boolean(hook.Vue || hook.store) || (Array.isArray(roots) && roots.length > 0) || vue2Roots().length > 0);
    if (present) sawVue = true;
    window.postMessage({ source: "formant-vue-detect", present }, "*");
  }
  const reportVue = () => { if (!sawVue) announce(); };

  window.addEventListener("scroll", positionHighlight, true);
  window.addEventListener("resize", positionHighlight);
  for (const event of ["init", "vuex:init", "app:init", "flush"]) hook.on(event, reportVue);
  for (const wait of [400, 1600]) window.setTimeout(reportVue, wait);

  window.__FORMANT_VUE__ = {
    setEnabled(on) {
      enabled = !!on;
      hook.enabled = enabled;
      if (!enabled) clearHighlight();
      announce();
    },
    snapshot,
    details,
    store,
    highlight,
  };
})();
