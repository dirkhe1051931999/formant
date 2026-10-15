// AutoPagerize core - GPL licensed, derived from autopagerize.user.js by swdyh
// http://autopagerize.net/
(() => {
  "use strict";

  const xpath = globalThis.FormantAutopagerizeXPath;
  const bar = globalThis.FormantAutopagerizeBar;
  if (!xpath) return;

  const BASE_REMAIN_HEIGHT = 800;
  const MIN_REQUEST_INTERVAL = 800;

  function getElementsByXPath(expression, node) {
    return xpath.getElementsByXPath(expression, node);
  }
  function getFirstElementByXPath(expression, node) {
    return xpath.getFirstElementByXPath(expression, node);
  }

  function getElementPosition(elem) {
    let trail = elem;
    let left = 0;
    let top = 0;
    while (trail) {
      left += trail.offsetLeft;
      top += trail.offsetTop;
      trail = trail.offsetParent;
    }
    return { left: left || null, top: top || null };
  }

  function getElementBottom(elem) {
    const style = document.defaultView.getComputedStyle(elem, "");
    let height = 0;
    const props = [
      "height", "borderTopWidth", "borderBottomWidth",
      "paddingTop", "paddingBottom", "marginTop", "marginBottom",
    ];
    for (const prop of props) {
      const value = parseInt(style[prop], 10);
      if (typeof value === "number") height += value;
    }
    const top = getElementPosition(elem).top;
    return top ? top + height : null;
  }

  function getScrollHeight() {
    return Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0,
    );
  }

  function getRoot(element) {
    for (let i = 0; i < 1000; i += 1) {
      if (!element.parentNode) return element;
      element = element.parentNode;
    }
    return element;
  }

  function removeScripts(doc) {
    const scripts = doc.querySelectorAll("script");
    for (const script of scripts) script.parentNode.removeChild(script);
    return doc;
  }

  /**
   * @param {string} html
   * @param {string} baseHref
   */
  function parseHtmlDocument(html, baseHref) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    removeScripts(doc);
    if (baseHref) {
      const base = doc.createElement("base");
      base.href = baseHref;
      doc.head ? doc.head.insertBefore(base, doc.head.firstChild) : doc.documentElement.insertBefore(base, doc.documentElement.firstChild);
    }
    return doc;
  }

  function hostFamily(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (host.includes("google.")) return "google";
    if (host.includes("bing.")) return "bing";
    return host;
  }

  /** Allow google.com ↔ google.com.hk style redirects used by search engines. */
  function isSameSite(url) {
    try {
      const next = new URL(url, location.href);
      if (next.host === location.host) return true;
      return hostFamily(next.hostname) === hostFamily(location.hostname) &&
        hostFamily(location.hostname) !== location.hostname.toLowerCase();
    } catch {
      return false;
    }
  }

  /**
   * @param {{ url: string, nextLink: string, pageElement: string, insertBefore?: string }} info
   * @param {{ settings: object, fetchPage: (url: string) => Promise<{html:string,finalUrl:string}> }} env
   */
  function AutoPager(info, env) {
    this.pageNum = 1;
    this.info = info;
    this.env = env;
    this.state = env.settings.disable ? "disable" : "enable";
    const self = this;
    const url = this.getNextURL(info.nextLink, document, location.href);
    if (!url) return;

    if (info.insertBefore) {
      this.insertPoint = getFirstElementByXPath(info.insertBefore);
    }
    if (!this.insertPoint) {
      const lastPageElement = getElementsByXPath(info.pageElement).pop();
      if (lastPageElement) {
        this.insertPoint =
          lastPageElement.nextSibling ||
          lastPageElement.parentNode.appendChild(document.createTextNode(" "));
      }
    }
    if (!this.insertPoint) return;

    this.requestURL = url;
    this.loadedURLs = {};
    this.loadedURLs[location.href] = true;
    this.scroll = function () { self.onScroll(); };
    window.addEventListener("scroll", this.scroll, { passive: true });

    const scrollHeight = getScrollHeight();
    const bottom =
      getElementPosition(this.insertPoint).top ||
      this.getPageElementsBottom() ||
      Math.round(scrollHeight * 0.8);
    this.remainHeight = scrollHeight - bottom + BASE_REMAIN_HEIGHT;
    this.reqTime = 0;
    this.pendingTimer = 0;
    this.onScroll();
  }

  AutoPager.prototype.getPageElementsBottom = function () {
    try {
      const elems = getElementsByXPath(this.info.pageElement);
      const bottoms = elems.map((el) => getElementBottom(el));
      return Math.max.apply(Math, bottoms);
    } catch { return null; }
  };

  AutoPager.prototype.onScroll = function () {
    const scrollHeight = getScrollHeight();
    const remain = scrollHeight - window.innerHeight - window.scrollY;
    if (this.state === "enable" && remain < this.remainHeight) this.request();
  };

  AutoPager.prototype.stateToggle = function () {
    this.state = this.state === "enable" ? "disable" : "enable";
  };
  AutoPager.prototype.enable = function () { this.state = "enable"; };
  AutoPager.prototype.disable = function () { this.state = "disable"; };

  AutoPager.prototype.request = function () {
    if (!this.requestURL || this.lastRequestURL === this.requestURL) return;
    const self = this;
    const now = Date.now();
    const wait = this.reqTime ? MIN_REQUEST_INTERVAL - (now - this.reqTime) : 0;
    if (wait > 0) {
      if (!this.pendingTimer) {
        this.pendingTimer = window.setTimeout(() => {
          self.pendingTimer = 0;
          self.onScroll();
        }, wait);
      }
      return;
    }
    this.reqTime = now;
    this.lastRequestURL = this.requestURL;
    if (this.env.settings.displayMessageBar !== false) bar?.show("Loading...", "loading");
    this.env
      .fetchPage(this.requestURL)
      .then(({ html, finalUrl }) => {
        if (!html || html.length < 64) throw new Error("empty response");
        const doc = parseHtmlDocument(html, finalUrl);
        self.load(doc, finalUrl || self.requestURL);
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error || "fetch failed");
        console.warn("[formant] AutoPagerize request failed", this.requestURL, message);
        self.error(message);
      });
  };

  AutoPager.prototype.load = function (htmlDoc, url) {
    if (url && !isSameSite(url)) {
      this.error("cross-site redirect");
      return;
    }
    let page;
    let nextUrl;
    try {
      page = getElementsByXPath(this.info.pageElement, htmlDoc);
      nextUrl = this.getNextURL(this.info.nextLink, htmlDoc, this.requestURL);
    } catch (error) {
      const message = error instanceof Error ? error.message : "xpath failed";
      console.warn("[formant] AutoPagerize xpath failed", message);
      this.error(message);
      return;
    }

    if (!page || page.length < 1) {
      this.terminate("no page elements");
      return;
    }
    if (this.loadedURLs[this.requestURL]) {
      this.terminate("duplicate page");
      return;
    }
    this.loadedURLs[this.requestURL] = true;
    try {
      page = this.addPage(htmlDoc, page);
    } catch (error) {
      const message = error instanceof Error ? error.message : "insert failed";
      console.warn("[formant] AutoPagerize insert failed", message);
      this.error(message);
      return;
    }
    AutoPager.filters.forEach((filter) => filter(page));
    this.requestURL = nextUrl;
    bar?.hide();
    this.onScroll();
    if (!nextUrl) this.terminate("last page");
    document.dispatchEvent(new Event("GM_AutoPagerizeNextPageLoaded", { bubbles: true }));
  };

  AutoPager.prototype.resolveInsertPoint = function () {
    if (this.insertPoint && this.insertPoint.parentNode && getRoot(this.insertPoint) === document) {
      return this.insertPoint;
    }
    if (this.info.insertBefore) {
      const before = getFirstElementByXPath(this.info.insertBefore);
      if (before?.parentNode) {
        this.insertPoint = before;
        return before;
      }
    }
    const lastPageElement = getElementsByXPath(this.info.pageElement).pop();
    if (lastPageElement?.parentNode) {
      this.insertPoint =
        lastPageElement.nextSibling ||
        lastPageElement.parentNode.appendChild(document.createTextNode(" "));
      return this.insertPoint;
    }
    return null;
  };

  AutoPager.prototype.addPage = function (htmlDoc, page) {
    const HTML_NS = "http://www.w3.org/1999/xhtml";
    const hr = document.createElementNS(HTML_NS, "hr");
    const p = document.createElementNS(HTML_NS, "p");
    hr.setAttribute("class", "autopagerize_page_separator");
    p.setAttribute("class", "autopagerize_page_info");
    const self = this;
    const insertPoint = this.resolveInsertPoint();
    if (!insertPoint?.parentNode) throw new Error("insert point missing");
    this.insertPoint = insertPoint;

    if (page[0] && /tr/i.test(page[0].tagName)) {
      const insertParent = this.insertPoint.parentNode;
      const colNodes = getElementsByXPath(
        "child::tr[1]/child::*[self::td or self::th]",
        insertParent,
      );
      let columns = 0;
      for (const node of colNodes) {
        const col = node.getAttribute("colspan");
        columns += parseInt(col, 10) || 1;
      }
      const td = document.createElementNS(HTML_NS, "td");
      td.appendChild(p);
      const tr = document.createElementNS(HTML_NS, "tr");
      td.setAttribute("colspan", columns);
      tr.appendChild(td);
      insertParent.insertBefore(tr, this.insertPoint);
    } else {
      this.insertPoint.parentNode.insertBefore(hr, this.insertPoint);
      this.insertPoint.parentNode.insertBefore(p, this.insertPoint);
    }

    const link = document.createElement("a");
    link.className = "autopagerize_link";
    link.href = this.requestURL;
    link.appendChild(document.createTextNode(String(++this.pageNum)));
    p.appendChild(document.createTextNode("page: "));
    p.appendChild(link);

    return page.map((node) => {
      const imported = document.importNode(node, true);
      self.insertPoint.parentNode.insertBefore(imported, self.insertPoint);
      // MutationEvent was removed from Chromium; keep the legacy event name
      // via CustomEvent so filters / page scripts can still listen.
      imported.dispatchEvent(new CustomEvent("AutoPagerize_DOMNodeInserted", {
        bubbles: true,
        detail: {
          relatedNode: self.insertPoint.parentNode,
          newValue: self.requestURL,
        },
      }));
      return imported;
    });
  };

  AutoPager.prototype.getNextURL = function (expression, doc, url) {
    const nextLink = getFirstElementByXPath(expression, doc);
    if (!nextLink) return;
    const nextValue =
      nextLink.getAttribute("href") ||
      nextLink.getAttribute("action") ||
      nextLink.value;
    if (!nextValue) return;
    if (/^https?:/i.test(nextValue)) return nextValue;
    const base = getFirstElementByXPath("//base[@href]", doc);
    return resolvePath(nextValue, base ? base.href : url);
  };

  AutoPager.prototype.terminate = function (reason) {
    window.removeEventListener("scroll", this.scroll);
    if (this.pendingTimer) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = 0;
    }
    const text = reason ? `terminated: ${reason}` : "terminated";
    bar?.show(text, "info", 1800);
  };

  AutoPager.prototype.error = function (reason) {
    window.removeEventListener("scroll", this.scroll);
    if (this.pendingTimer) {
      window.clearTimeout(this.pendingTimer);
      this.pendingTimer = 0;
    }
    if (this.env.settings.displayMessageBar !== false) {
      const detail = reason ? String(reason).slice(0, 120) : "";
      bar?.show(detail ? `Error: ${detail}` : "Error!", "error", 4500);
    }
  };

  AutoPager.filters = [];

  AutoPager.launchAutoPager = function (list, env) {
    if (!list || list.length === 0) return false;
    for (const info of list) {
      try {
        if (env.ap) return true;
        if (!info || !info.url || !info.nextLink || !info.pageElement) continue;
        if (!location.href.match(info.url)) continue;
        if (!getFirstElementByXPath(info.nextLink)) continue;
        if (!getFirstElementByXPath(info.pageElement)) continue;
        const ap = new AutoPager(info, env);
        // Constructor may bail when next URL / insert point cannot be resolved.
        if (!ap.requestURL || !ap.insertPoint) continue;
        env.ap = ap;
        return true;
      } catch { continue; }
    }
    return false;
  };

  function resolvePath(path, base) {
    if (/^https?:\/\//.test(path)) return path;
    if (/^\?/.test(path)) return base.replace(/\?.+$/, "") + path;
    if (/^[^/]/.test(path)) return base.replace(/[^/]+$/, "") + path;
    return base.replace(/([^/]+:\/\/[^/]+)\/.*/, "$1") + path;
  }

  globalThis.FormantAutopagerizeCore = {
    AutoPager,
    resolvePath,
  };
})();
