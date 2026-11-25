(() => {
  if (window.__FORMANT_UBO_PROCEDURAL__) return;

  let activeRules = [];
  const hiddenElements = new Set();

  function toMatcher(pattern, isCss = false) {
    if (typeof pattern !== "string") return () => false;
    if (pattern.length >= 2 && pattern.startsWith("/")) {
      const lastSlash = pattern.lastIndexOf("/");
      if (lastSlash > 0) {
        try {
          const re = new RegExp(pattern.slice(1, lastSlash), pattern.slice(lastSlash + 1));
          return (text) => re.test(text);
        } catch {}
      }
    }
    if (isCss) {
      try {
        const re = new RegExp(pattern);
        return (text) => re.test(text);
      } catch {
        return (text) => text.includes(pattern);
      }
    }
    return (text) => text.includes(pattern);
  }

  function querySafe(root, selector) {
    if (!selector) return root === document ? (document.documentElement ? [document.documentElement] : []) : [root];
    const trimmed = selector.trim();
    if (!trimmed) return [];
    try {
      if (root instanceof Element && (/^[>+~]/.test(trimmed))) {
        return [...root.querySelectorAll(`:scope ${trimmed}`)];
      }
      return [...root.querySelectorAll(trimmed)];
    } catch {
      return [];
    }
  }

  function evalXpath(expr, contextNode) {
    const out = [];
    try {
      const doc = contextNode.ownerDocument || document;
      const res = doc.evaluate(expr, contextNode, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < res.snapshotLength; i += 1) {
        const node = res.snapshotItem(i);
        if (node instanceof Element) out.push(node);
      }
    } catch {}
    return out;
  }

  function matchSubRule(el, arg) {
    if (typeof arg === "string") return querySafe(el, arg).length > 0;
    if (!arg || typeof arg !== "object") return false;
    const candidates = arg.selector ? querySafe(el, arg.selector) : [el];
    if (!candidates.length) return false;
    if (!Array.isArray(arg.tasks) || !arg.tasks.length) return true;
    return runTasks(candidates, arg.tasks).length > 0;
  }

  function runSingleTask(nodes, task) {
    const [op, arg] = task;
    if (op === "has-text") {
      const match = toMatcher(arg);
      return nodes.filter((el) => match(el.textContent || ""));
    }
    if (op === "has") {
      return nodes.filter((el) => matchSubRule(el, arg));
    }
    if (op === "not") {
      return nodes.filter((el) => !matchSubRule(el, arg));
    }
    if (op === "upward") {
      const out = new Set();
      if (typeof arg === "number") {
        for (let el of nodes) {
          for (let i = 0; i < arg && el; i += 1) el = el.parentElement;
          if (el) out.add(el);
        }
      } else if (typeof arg === "string") {
        for (const el of nodes) {
          try {
            const found = el.parentElement?.closest(arg);
            if (found) out.add(found);
          } catch {}
        }
      }
      return [...out];
    }
    if (op === "spath") {
      const out = new Set();
      for (const el of nodes) {
        for (const child of querySafe(el, arg)) out.add(child);
      }
      return [...out];
    }
    if (op === "xpath") {
      const out = new Set();
      for (const el of nodes) {
        for (const hit of evalXpath(arg, el)) out.add(hit);
      }
      return [...out];
    }
    if (op === "matches-css" || op === "matches-css-before" || op === "matches-css-after") {
      const pseudo = op === "matches-css-before" ? "::before" : op === "matches-css-after" ? "::after" : null;
      const name = arg?.name;
      if (!name) return [];
      const match = toMatcher(arg.value || "", true);
      return nodes.filter((el) => {
        try {
          const val = getComputedStyle(el, pseudo).getPropertyValue(name);
          return match(val);
        } catch {
          return false;
        }
      });
    }
    if (op === "matches-attr") {
      const attrRaw = arg?.attr || "";
      const valRaw = arg?.value;
      const attrIsRegex = attrRaw.length >= 2 && attrRaw.startsWith("/");
      const attrMatch = attrIsRegex ? toMatcher(attrRaw) : null;
      const valMatch = typeof valRaw === "string" ? toMatcher(valRaw) : null;
      return nodes.filter((el) => {
        if (!attrIsRegex) {
          if (!el.hasAttribute(attrRaw)) return false;
          if (!valMatch) return true;
          return valMatch(el.getAttribute(attrRaw) || "");
        }
        for (const attr of el.attributes) {
          if (!attrMatch(attr.name)) continue;
          if (!valMatch || valMatch(attr.value)) return true;
        }
        return false;
      });
    }
    if (op === "matches-path") {
      const match = toMatcher(arg);
      return match(location.pathname + location.search) ? nodes : [];
    }
    if (op === "others") {
      if (!document.body) return [];
      const keep = new Set(nodes);
      const out = [];
      for (const el of document.body.querySelectorAll("*")) {
        if (keep.has(el)) continue;
        let skip = false;
        for (const k of keep) {
          if (k.contains(el) || el.contains(k)) {
            skip = true;
            break;
          }
        }
        if (!skip) out.push(el);
      }
      return out;
    }
    return nodes;
  }

  function runTasks(initialNodes, tasks) {
    let nodes = initialNodes;
    for (const task of tasks) {
      if (!nodes.length) break;
      nodes = runSingleTask(nodes, task);
    }
    return nodes;
  }

  function applyAction(el, action) {
    if (!action) {
      if (el.dataset.formantUboHidden !== "1") {
        el.dataset.formantUboHidden = "1";
        el.style.setProperty("display", "none", "important");
        hiddenElements.add(el);
      }
      return;
    }
    const [kind, arg] = action;
    if (kind === "remove") {
      el.remove();
    } else if (kind === "remove-attr" && typeof arg === "string") {
      if (arg.startsWith("/") && arg.lastIndexOf("/") > 0) {
        const match = toMatcher(arg);
        for (const attr of [...el.attributes]) {
          if (match(attr.name)) el.removeAttribute(attr.name);
        }
      } else {
        el.removeAttribute(arg);
      }
    } else if (kind === "remove-class" && typeof arg === "string") {
      if (arg.startsWith("/") && arg.lastIndexOf("/") > 0) {
        const match = toMatcher(arg);
        for (const cls of [...el.classList]) {
          if (match(cls)) el.classList.remove(cls);
        }
      } else {
        el.classList.remove(arg);
      }
    } else if (kind === "style" && typeof arg === "string") {
      if (el.dataset.formantUboStyled !== "1") {
        el.dataset.formantUboStyled = "1";
        el.style.cssText += `;${arg}`;
        hiddenElements.add(el);
      }
    }
  }

  function runAll() {
    if (!activeRules.length || !document.documentElement) return;
    for (const rule of activeRules) {
      const initial = rule.selector ? querySafe(document, rule.selector) : [document.documentElement];
      if (!initial.length) continue;
      const targets = Array.isArray(rule.tasks) && rule.tasks.length
        ? runTasks(initial, rule.tasks)
        : initial;
      for (const el of targets) applyAction(el, rule.action);
    }
  }

  function clear() {
    activeRules = [];
    for (const el of hiddenElements) {
      if (el.dataset.formantUboHidden === "1") {
        delete el.dataset.formantUboHidden;
        el.style.removeProperty("display");
      }
      if (el.dataset.formantUboStyled === "1") {
        delete el.dataset.formantUboStyled;
      }
    }
    hiddenElements.clear();
  }

  window.__FORMANT_UBO_PROCEDURAL__ = {
    setRules(rules) {
      activeRules = Array.isArray(rules) ? rules : [];
      runAll();
    },
    run: runAll,
    hasRules() {
      return activeRules.length > 0;
    },
    clear,
  };
})();
