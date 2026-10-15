(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  function addMarkedUserOutlines(markedUsers, color) {
    for (const username of markedUsers) {
      for (const avatar of document.querySelectorAll(`img[alt="${CSS.escape(username)}"]`)) {
        avatar.style.outline = `3px solid ${color}`;
        avatar.dataset.formantV2ex = "true";
      }
    }
  }

  function appendSeparator(info) {
    info.append(document.createTextNode(" \u00a0•\u00a0"));
  }

  function makeAction(label) {
    const action = runtime.mark(document.createElement("button"));
    action.type = "button";
    action.className = "formant-v2ex-topic-action";
    action.textContent = label;
    return action;
  }

  function safeV2exFragment(html) {
    const parsed = new DOMParser().parseFromString(String(html || ""), "text/html");
    parsed.querySelectorAll("script, style, iframe, object, embed, form").forEach((node) => node.remove());
    parsed.querySelectorAll("*").forEach((node) => {
      for (const attribute of [...node.attributes]) {
        const name = attribute.name.toLowerCase();
        const value = attribute.value.trim().toLowerCase();
        if (
          name.startsWith("on") ||
          ((name === "href" || name === "src") &&
            !/^(https?:|\/|#|mailto:)/.test(value))
        ) {
          node.removeAttribute(attribute.name);
        }
      }
    });
    const fragment = document.createDocumentFragment();
    while (parsed.body.firstChild) fragment.append(parsed.body.firstChild);
    return fragment;
  }

  function topicIdFromAnchor(anchor) {
    const match = anchor?.pathname.match(/\/t\/(\d+)/);
    return match?.[1] || "";
  }

  async function previewTopic(cell, anchor, action) {
    const existing = cell.querySelector("[data-formant-v2ex-preview]");
    if (existing) {
      existing.remove();
      action.textContent = "预览";
      return;
    }

    action.disabled = true;
    action.textContent = "加载中…";
    try {
      const response = await fetch(anchor.href, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const content = doc.querySelector(".topic_content");
      if (!content) throw new Error("未找到主题正文");

      const preview = runtime.mark(document.createElement("div"));
      preview.dataset.formantV2exPreview = "true";
      preview.className = "formant-v2ex-preview";
      preview.append(safeV2exFragment(content.innerHTML));
      cell.append(preview);
      action.textContent = "收起";
    } catch (error) {
      action.textContent = "预览失败";
      console.warn("[formant] V2EX topic preview failed", error);
    } finally {
      action.disabled = false;
    }
  }

  function ignoreTopic(anchor) {
    const topicId = topicIdFromAnchor(anchor);
    const once = document.body.innerHTML.match(/signout\?once=(\d+)/)?.[1];
    if (!topicId || !once) {
      window.alert("请先登录 V2EX 后再忽略主题。");
      return;
    }
    if (!window.confirm("确定不想再看到这个主题？")) return;
    window.location.assign(`/ignore/topic/${topicId}?once=${encodeURIComponent(once)}`);
  }

  async function renderVDaily() {
    const hot = document.querySelector("#TopicsHot");
    if (!hot || document.querySelector("[data-formant-v2ex-vdaily]")) return;
    const wrap = runtime.mark(document.createElement("section"));
    wrap.dataset.formantV2exVdaily = "true";
    wrap.className = "formant-v2ex-vdaily";
    wrap.innerHTML = `
      <div class="formant-v2ex-vdaily__head">vDaily 推荐主题 <a href="https://vdaily.huguotao.com" target="_blank" rel="noreferrer">更多</a></div>
      <div class="formant-v2ex-vdaily__topics">加载中…</div>
      <div class="formant-v2ex-vdaily__head">vDaily 高赞回复</div>
      <div class="formant-v2ex-vdaily__replies">加载中…</div>
    `;
    hot.after(wrap);

    const topics = wrap.querySelector(".formant-v2ex-vdaily__topics");
    const replies = wrap.querySelector(".formant-v2ex-vdaily__replies");
    try {
      const [topicResponse, replyResponse] = await Promise.all([
        fetch("https://vdaily.huguotao.com/api/topic/recommend"),
        fetch("https://vdaily.huguotao.com/api/reply/recommend"),
      ]);
      const [topicData, replyData] = await Promise.all([topicResponse.json(), replyResponse.json()]);
      if (topics) {
        topics.replaceChildren(
          ...topicData.slice(0, 8).map((item) => {
            const link = document.createElement("a");
            link.href = `/t/${item.id}`;
            link.textContent = `${item.score} · ${item.name}`;
            return link;
          }),
        );
      }
      if (replies) {
        replies.replaceChildren(
          ...replyData.slice(0, 8).map((item) => {
            const link = document.createElement("a");
            link.href = `/t/${item.topicId}?p=${item.topicPage}#r_${item.id}`;
            link.textContent = `${item.thank} · ${String(item.content || "").replace(/<[^>]*>/g, " ")}`;
            return link;
          }),
        );
      }
    } catch (error) {
      if (topics) topics.textContent = "暂时无法加载推荐。";
      if (replies) replies.textContent = "";
      console.warn("[formant] V2EX vDaily failed", error);
    }
  }

  runtime.onReady(({ enabled, options }) => {
    if (!enabled) return;
    addMarkedUserOutlines(options.userMarkList, options.markColor);
    if (options.newWindow) {
      document.querySelectorAll(".item_title a, .item_hot_topic_title a").forEach((anchor) => {
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      });
    }

    document.querySelectorAll(".topic_info").forEach((info) => {
      if (info.querySelector("[data-formant-v2ex-topic-tools]")) return;
      const cell = info.closest(".cell");
      const anchor = cell?.querySelector(".item_title a");
      if (!cell || !(anchor instanceof HTMLAnchorElement)) return;

      const tools = runtime.mark(document.createElement("span"));
      tools.dataset.formantV2exTopicTools = "true";
      tools.className = "formant-v2ex-topic-tools";
      if (options.preview) {
        const preview = makeAction("预览");
        preview.addEventListener("click", () => void previewTopic(cell, anchor, preview));
        tools.append(preview);
      }
      if (options.ignore) {
        const ignore = makeAction("忽略");
        ignore.addEventListener("click", () => ignoreTopic(anchor));
        if (tools.childElementCount) tools.prepend(document.createTextNode(" \u00a0•\u00a0"));
        tools.append(ignore);
      }
      if (tools.childElementCount) {
        appendSeparator(info);
        info.append(tools);
      }
    });

    if (options.vDaily) void renderVDaily();
  });
})();
