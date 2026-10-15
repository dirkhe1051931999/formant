(() => {
  "use strict";

  const RESERVED_ROOTS = new Set([
    "about",
    "account",
    "apps",
    "collections",
    "contact",
    "customer-stories",
    "enterprise",
    "events",
    "explore",
    "features",
    "github",
    "issues",
    "join",
    "login",
    "marketplace",
    "new",
    "notifications",
    "orgs",
    "pricing",
    "pulls",
    "readme",
    "search",
    "security",
    "settings",
    "site",
    "sponsors",
    "stars",
    "topics",
    "trending",
    "users",
  ]);

  /**
   * @param {string} part
   */
  function decodePart(part) {
    try {
      return decodeURIComponent(part);
    } catch {
      return part;
    }
  }

  function currentContext() {
    if (location.hostname !== "github.com") return null;
    const parts = location.pathname
      .split("/")
      .filter(Boolean)
      .map(decodePart);
    if (parts.length < 2 || RESERVED_ROOTS.has(parts[0].toLowerCase())) return null;
    const [owner, repo, kind] = parts;
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) return null;
    if (kind && kind !== "tree" && kind !== "blob") return null;
    return {
      owner,
      repo,
      kind: kind || "",
      tail: kind ? parts.slice(3) : [],
      root: !kind,
    };
  }

  /**
   * Finds explicit current-branch values before falling back to the branches API.
   * GitHub puts these in slightly different menus across its React and legacy UIs.
   * @param {{ owner: string, repo: string, tail: string[] }} context
   */
  function getDomRefCandidates(context) {
    const prefix = `/${context.owner}/${context.repo}/tree/`;
    const tail = context.tail.join("/");
    const values = new Set();
    const branchScopes = [
      "[data-testid*='branch']",
      "[data-target*='branch']",
      "#branch-select-menu",
      "[data-hotkey='w']",
      ".branch-select-menu",
    ];

    for (const scope of branchScopes) {
      const nodes = new Set([
        ...document.querySelectorAll(scope),
        ...document.querySelectorAll(`${scope} a[href], ${scope} button`),
      ]);
      nodes.forEach((node) => {
        const href = node instanceof HTMLAnchorElement ? node.getAttribute("href") || "" : "";
        if (href.startsWith(prefix)) {
          values.add(decodePart(href.slice(prefix.length).replace(/\/+$/, "")));
        }
        const label = node.textContent?.trim() || "";
        if (label && (tail === label || tail.startsWith(`${label}/`))) values.add(label);
      });
    }

    return [...values];
  }

  /**
   * @param {string[]} tail
   * @param {string[]} refs
   */
  function chooseLongestRef(tail, refs) {
    const remaining = tail.join("/");
    return refs
      .map((ref) => String(ref || "").replace(/^\/+|\/+$/g, ""))
      .filter((ref) => ref && (remaining === ref || remaining.startsWith(`${ref}/`)))
      .sort((left, right) => right.length - left.length)[0];
  }

  /**
   * @param {{ tail: string[] }} context
   * @param {string} ref
   */
  function pathAfterRef(context, ref) {
    const tail = context.tail.join("/");
    if (!ref || tail === ref) return "";
    return tail.startsWith(`${ref}/`) ? tail.slice(ref.length + 1) : "";
  }

  /**
   * @param {{ owner: string, repo: string }} context
   * @param {string} kind
   */
  function hrefPrefix(context, kind) {
    return `/${context.owner}/${context.repo}/${kind}/`;
  }

  globalThis.FormantGitzipGithub = {
    chooseLongestRef,
    currentContext,
    getDomRefCandidates,
    hrefPrefix,
    pathAfterRef,
  };
})();
