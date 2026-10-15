(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  const ENDPOINT = "https://vdaily.huguotao.com";
  const VERSION = "1.0.3";

  function textOf(root, selector, fallback = "") {
    return root.querySelector(selector)?.textContent?.trim() || fallback;
  }

  function numberOf(text, pattern) {
    return Number(String(text || "").match(pattern)?.[1] || 0);
  }

  function spiderTopic(topicId, page) {
    const buttonsText = textOf(document, ".topic_buttons, #Main .box .inner");
    const replies = [...document.querySelectorAll('[alt="❤️"]')].map((heart) => {
      const cell = heart.closest(".cell");
      return {
        spiderTime: new Date(),
        topicId,
        topicPage: page,
        id: Number(cell?.id?.replace(/^r_/, "") || 0),
        author: textOf(cell || document, ".avatar"),
        avatar: cell?.querySelector(".avatar")?.src || "",
        date: new Date(cell?.querySelector(".ago")?.getAttribute("title") || ""),
        thank: Number(heart.nextSibling?.textContent || 0),
        content: cell?.querySelector(".reply_content")?.innerHTML || "",
      };
    });

    const topic = {
      spiderTime: new Date(),
      id: topicId,
      name: textOf(document, "h1"),
      node: textOf(document, ".header a[href^='/go']"),
      author: textOf(document, "div.header small a[href^='/member']"),
      avatar: document.querySelector(".header .avatar")?.src || "",
      date: new Date(document.querySelector("div.header small span[title^='20']")?.getAttribute("title") || ""),
      reply: numberOf(textOf(document, "span.gray"), /(\d+)\s*条回复/),
      vote: Number(textOf(document, ".votes a") || 0),
      click: numberOf(buttonsText, /(\d+)\s*次点击/),
      collect: numberOf(buttonsText, /(\d+)\s*人收藏/),
      thank: numberOf(buttonsText, /(\d+)\s*人感谢/),
      content: document.querySelector(".topic_content")?.innerHTML || "",
      append: [...document.querySelectorAll(".subtle")].map((item) => item.innerHTML),
      replys: replies,
    };
    topic.score =
      topic.click +
      topic.reply * 10 +
      topic.replys.length * 30 +
      topic.collect * 30 +
      topic.thank * 100 +
      topic.vote * 300;
    return topic;
  }

  async function post(path, body) {
    const response = await fetch(`${ENDPOINT}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        version: VERSION,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response;
  }

  runtime.onReady(({ enabled, options }) => {
    if (!enabled || !options.vDaily || !/\/t\/\d+/.test(location.pathname)) return;
    const notesLink = document.querySelector('.tools [href="/notes"]');
    if (!notesLink || notesLink.textContent?.trim() !== "记事本") return;

    void (async () => {
      try {
        const topicId = Number(location.pathname.match(/\/t\/(\d+)/)?.[1] || 0);
        const page = Number(new URLSearchParams(location.search).get("p") || 1);
        const topic = spiderTopic(topicId, page);
        const response = await post(`/api/topic/info?task=${crypto.randomUUID()}`, topic);
        const json = await response.json();
        if (json.code !== 0) throw new Error("vDaily 返回错误");
      } catch (error) {
        console.warn("[formant] V2EX vDaily spider failed", error);
        void post("/api/error/info", {
          type: "read",
          url: location.href,
          error: error instanceof Error ? error.stack : String(error),
          time: new Date(),
        }).catch(() => {});
      }
    })();
  });
})();
