/* a license is filled in when its entry is opened: from texts.json (each kept once), or from its own file */
void (async () => {
  let TEXTS = {};
  try {
    const res = await fetch("texts.json");
    if (res.ok) TEXTS = await res.json();
  } catch (e) {
    /* details fall back to dataset.src files */
  }
  for (const d of document.querySelectorAll("details")) {
    d.addEventListener("toggle", async () => {
      const pre = d.querySelector("pre");
      if (!d.open || pre.textContent) return;
      if (d.dataset.texts) {
        pre.textContent = d.dataset.texts
          .split(" ")
          .map((k) => TEXTS[k])
          .join("\n\n" + "-".repeat(60) + "\n\n");
        return;
      }
      try {
        const res = await fetch(d.dataset.src);
        pre.textContent = res.ok ? await res.text() : "See " + d.dataset.src + ".";
      } catch (e) {
        pre.textContent = "See " + d.dataset.src + ".";
      }
    });
  }
})();
