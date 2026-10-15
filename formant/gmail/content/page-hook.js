(() => {
  "use strict";

  const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i;
  const ATTR = "data-formant-gmail-email";

  function fromGlobals() {
    const list = globalThis.GLOBALS;
    if (!Array.isArray(list)) return "";
    const preferred = list[10];
    if (typeof preferred === "string" && EMAIL_RE.test(preferred.trim())) return preferred.trim();
    const limit = Math.min(list.length, 30);
    for (let i = 0; i < limit; i += 1) {
      const item = list[i];
      if (typeof item !== "string") continue;
      const value = item.trim();
      if (value.length > 120) continue;
      if (EMAIL_RE.test(value)) return value;
    }
    return "";
  }

  function publish() {
    const email = fromGlobals();
    if (!email) return false;
    if (document.documentElement.getAttribute(ATTR) === email) return true;
    document.documentElement.setAttribute(ATTR, email);
    return true;
  }

  if (publish()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (publish() || tries > 40) clearInterval(timer);
  }, 500);
})();
