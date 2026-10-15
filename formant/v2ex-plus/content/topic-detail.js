(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  function topicId() {
    return Number(location.pathname.match(/\/t\/(\d+)/)?.[1] || 0);
  }

  function usernameFromCell(cell) {
    return String(cell?.querySelector(".avatar")?.getAttribute("alt") || "").trim();
  }

  function replyFromCell(cell, index) {
    return {
      member: { username: usernameFromCell(cell), created: 0 },
      content_rendered: cell?.querySelector(".reply_content")?.innerHTML || "",
      index,
    };
  }

  async function loadReplies() {
    const rendered = [...document.querySelectorAll("div[id^='r_']")].map((cell, index) =>
      replyFromCell(cell, index + 1),
    );
    const id = topicId();
    if (!id) return rendered;
    try {
      const response = await fetch(`/api/replies/show.json?topic_id=${id}`, {
        credentials: "include",
      });
      if (!response.ok) return rendered;
      const apiReplies = await response.json();
      if (!Array.isArray(apiReplies)) return rendered;
      return apiReplies.map((reply, index) => ({
        ...reply,
        member: reply.member || rendered[index]?.member || {},
        content_rendered: reply.content_rendered || rendered[index]?.content_rendered || "",
        index: index + 1,
      }));
    } catch {
      return rendered;
    }
  }

  function mark(node) {
    return runtime.mark(node);
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

  function addUserOutlines(marked, color) {
    for (const username of marked) {
      document.querySelectorAll(`img[alt="${CSS.escape(username)}"]`).forEach((avatar) => {
        avatar.style.outline = `3px solid ${color}`;
        avatar.dataset.formantV2ex = "true";
      });
    }
  }

  function installFold() {
    const topic = document.querySelector("#Main > div:nth-of-type(2) .topic_content");
    if (topic instanceof HTMLElement && topic.offsetHeight >= 1800 && !topic.dataset.formantV2exFolded) {
      topic.dataset.formantV2exFolded = "true";
      topic.classList.add("formant-v2ex-topic-folded");
      const expand = mark(document.createElement("button"));
      expand.type = "button";
      expand.className = "formant-v2ex-expand";
      expand.textContent = "展开主题";
      expand.addEventListener("click", () => {
        topic.classList.remove("formant-v2ex-topic-folded");
        expand.remove();
      });
      topic.after(expand);
    }
    document.querySelectorAll("div[id^='r_'] .reply_content").forEach((content) => {
      // 只折叠真正超高的内容，避免短回复也出现「点击展开」条；懒加载图片稍后撑高的不再追加折叠。
      if (content.scrollHeight <= 320) return;
      content.classList.add("formant-v2ex-reply-folded");
      content.dataset.formantV2ex = "true";
      if (content.dataset.formantV2exFoldBound) return;
      content.dataset.formantV2exFoldBound = "true";
      content.addEventListener("click", (event) => {
        if (event.target.closest("a, img, button, input, textarea, video")) return;
        content.classList.toggle("is-expanded");
      });
    });
  }

  function installJump() {
    if (!document.referrer.includes(location.pathname) || !location.search.includes("p=")) return;
    window.setTimeout(() => document.querySelector(".topic_buttons")?.scrollIntoView(), 60);
  }

  function installReplyFloor(replyInput) {
    document.querySelectorAll("[alt='Reply']").forEach((button) => {
      if (button.dataset.formantV2exFloor) return;
      button.dataset.formantV2exFloor = "true";
      button.addEventListener("click", () => {
        window.setTimeout(() => {
          const no = button.closest(".cell")?.querySelector(".no")?.textContent?.trim();
          if (!no || replyInput.value.includes(`#${no} `)) return;
          replyInput.value += `#${no} `;
          replyInput.focus();
        }, 50);
      });
    });
  }

  function installOpColor(color, opacity) {
    const match = String(color || "").match(/^#(..)(..)(..)$/);
    if (!match) return;
    const rgb = match.slice(1).map((part) => Number.parseInt(part, 16)).join(",");
    document.querySelectorAll(".badge.op").forEach((badge) => {
      const cell = badge.closest(".cell");
      if (cell instanceof HTMLElement) {
        cell.classList.add("formant-v2ex-op-reply");
        cell.style.background = `rgba(${rgb},${opacity})`;
        cell.dataset.formantV2ex = "true";
      }
    });
  }

  function installThankColor(color) {
    document.querySelectorAll(".cell .small.fade").forEach((element) => {
      element.style.color = color;
      element.dataset.formantV2ex = "true";
    });
  }

  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    input.value = `${input.value.slice(0, start)}${text}${input.value.slice(start)}`;
    input.selectionStart = input.selectionEnd = start + text.length;
    input.focus();
  }

  function installEmojiPicker(replyInput) {
    const head = document.querySelector("#reply-box .flex-one-row div:first-child");
    if (!head || head.querySelector("[data-formant-v2ex-emoji]")) return;
    const toggle = mark(document.createElement("button"));
    toggle.type = "button";
    toggle.dataset.formantV2exEmoji = "true";
    toggle.className = "formant-v2ex-text-action";
    toggle.textContent = "表情";
    const list = mark(document.createElement("div"));
    list.className = "formant-v2ex-emojis";
    list.hidden = true;
    for (let code = 0x1f601; code <= 0x1f64f; code += 1) {
      const emoji = String.fromCodePoint(code);
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = emoji;
      button.addEventListener("click", () => insertAtCursor(replyInput, emoji));
      list.append(button);
    }
    toggle.addEventListener("click", () => {
      list.hidden = !list.hidden;
    });
    head.append(toggle);
    document.querySelector("#reply-box")?.prepend(list);
  }

  async function uploadImage(file, replyInput, clientId, button) {
    if (!(file instanceof File) || !file.type.startsWith("image/")) return;
    if (!clientId) {
      window.alert("请先在 formant 扩展设置 → V2EX 中保存自己的 Imgur Client ID。");
      return;
    }
    const initial = button?.textContent;
    if (button) button.textContent = "上传中…";
    try {
      const body = new FormData();
      body.append("image", file);
      const response = await fetch("https://api.imgur.com/3/image", {
        method: "POST",
        headers: { Authorization: `Client-ID ${clientId}` },
        body,
      });
      const json = await response.json();
      if (!response.ok || !json?.data?.link) throw new Error(json?.data?.error || "Imgur 上传失败");
      insertAtCursor(replyInput, ` ${json.data.link} `);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "图片上传失败");
    } finally {
      if (button) button.textContent = initial || "插入图片";
    }
  }

  function installImageUpload(replyInput, clientId) {
    const head = document.querySelector("#reply-box .flex-one-row div:first-child");
    if (!head || head.querySelector("[data-formant-v2ex-upload]")) return;
    const trigger = mark(document.createElement("button"));
    trigger.type = "button";
    trigger.dataset.formantV2exUpload = "true";
    trigger.className = "formant-v2ex-text-action";
    trigger.textContent = "插入图片";
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    trigger.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      void uploadImage(input.files?.[0], replyInput, clientId, trigger);
      input.value = "";
    });
    document.addEventListener("paste", (event) => {
      const item = [...(event.clipboardData?.items || [])].find(
        (candidate) => candidate.kind === "file" && candidate.type.startsWith("image/"),
      );
      if (!item || !document.activeElement?.closest("#reply-box")) return;
      event.preventDefault();
      void uploadImage(item.getAsFile(), replyInput, clientId, trigger);
    });
    replyInput.addEventListener("dragover", (event) => event.preventDefault());
    replyInput.addEventListener("drop", (event) => {
      event.preventDefault();
      void uploadImage(event.dataTransfer?.files?.[0], replyInput, clientId, trigger);
    });
    head.append(trigger, input);
  }

  function imageUrl(value) {
    return /^https?:\/\/[^\s]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s]*)?$/i.test(value);
  }

  function installImageParsing() {
    document.querySelectorAll(".topic_content a, .reply_content a").forEach((link) => {
      if (!(link instanceof HTMLAnchorElement) || link.querySelector("img") || !imageUrl(link.href)) return;
      const image = mark(document.createElement("img"));
      image.className = "formant-v2ex-parsed-image";
      image.src = link.href.replace(/^http:/, "https:");
      image.loading = "lazy";
      image.alt = link.textContent?.trim() || "V2EX image";
      link.after(image);
    });
  }

  function latestReplyForUser(replies, username, before) {
    for (let i = Math.min(before - 1, replies.length - 1); i >= 0; i -= 1) {
      if (replies[i]?.member?.username === username) return replies[i];
    }
    return null;
  }

  function removeRelatedCard() {
    document.querySelector("[data-formant-v2ex-related-card]")?.remove();
  }

  function installRelatedReplies(replies) {
    let hideTimer = 0;
    const scheduleHide = () => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(removeRelatedCard, 160);
    };
    const cancelHide = () => window.clearTimeout(hideTimer);

    document.querySelectorAll(".reply_content a[href*='/member/']").forEach((link) => {
      if (!(link instanceof HTMLAnchorElement) || link.dataset.formantV2exRelatedBound) return;
      link.dataset.formantV2exRelatedBound = "true";
      const username = link.pathname.match(/\/member\/([^/?#]+)/)?.[1];
      const cell = link.closest(".cell");
      const floor = Number(cell?.querySelector(".no")?.textContent || 0);
      if (!username || !cell || !floor) return;

      link.addEventListener("mouseenter", () => {
        cancelHide();
        removeRelatedCard();
        const reply = latestReplyForUser(replies, username, floor);
        if (!reply) return;
        const card = mark(document.createElement("aside"));
        card.dataset.formantV2exRelatedCard = "true";
        card.className = "formant-v2ex-related";
        const title = document.createElement("strong");
        title.textContent = username;
        const content = document.createElement("div");
        content.append(safeV2exFragment(reply.content_rendered));
        const meta = document.createElement("small");
        meta.textContent = `第 ${reply.index || floor} 楼`;
        card.append(title, content, meta);
        card.addEventListener("mouseenter", cancelHide);
        card.addEventListener("mouseleave", scheduleHide);
        document.body.append(card);
        const rect = link.getBoundingClientRect();
        card.style.top = `${rect.top + window.scrollY - card.offsetHeight - 8}px`;
        card.style.left = `${rect.left + window.scrollX - 18}px`;
      });
      link.addEventListener("mouseleave", scheduleHide);
    });
  }

  function installNestedComments() {
    const MAX_DEPTH = 10;
    const cells = [...document.querySelectorAll("div[id^='r_']")];
    if (cells.length < 2) return;
    const byFloor = new Map();
    const latestByUser = new Map();

    const subtreeCount = (container) => container.querySelectorAll("div[id^='r_']").length;
    const toggleLabel = (container) => {
      const count = subtreeCount(container);
      return container.classList.contains("is-collapsed") ? `展开 ${count} 条回复` : `共 ${count} 条回复 · 收起`;
    };

    const containerFor = (parent) => {
      let container = parent.querySelector(":scope > .formant-v2ex-tree-children");
      if (container) return container;
      container = mark(document.createElement("div"));
      container.className = "formant-v2ex-tree-children";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "formant-v2ex-tree-toggle";
      toggle.addEventListener("click", () => {
        container.classList.toggle("is-collapsed");
        toggle.textContent = toggleLabel(container);
      });
      container.append(toggle);
      parent.append(container);
      return container;
    };

    const depthOf = (cell) => {
      let depth = 0;
      let node = cell.parentElement;
      while (node) {
        if (node.classList?.contains("formant-v2ex-tree-children")) depth += 1;
        node = node.parentElement;
      }
      return depth;
    };

    for (const cell of cells) {
      const floor = Number(cell.querySelector(".no")?.textContent || 0);
      if (floor && !byFloor.has(floor)) byFloor.set(floor, cell);
      const username = usernameFromCell(cell);
      const content = cell.querySelector(".reply_content");

      let parent = null;
      const mention = content?.querySelector("a[href*='/member/']");
      const mentioned = mention?.getAttribute("href")?.match(/\/member\/([^/?#]+)/)?.[1];
      if (mentioned && mentioned !== username) parent = latestByUser.get(mentioned) || null;
      if (!parent && content) {
        const ref = content.textContent.match(/#(\d{1,5})/);
        const target = ref ? byFloor.get(Number(ref[1])) : null;
        if (target && target !== cell) parent = target;
      }

      if (parent && depthOf(parent) < MAX_DEPTH) containerFor(parent).append(cell);
      if (username) latestByUser.set(username, cell);
    }

    document.querySelectorAll(".formant-v2ex-tree-children").forEach((container) => {
      const toggle = container.querySelector(":scope > .formant-v2ex-tree-toggle");
      if (toggle) toggle.textContent = toggleLabel(container);
    });
  }

  function installNewUserFade(replies) {
    const monthAgo = Date.now() / 1000 - 30 * 24 * 60 * 60;
    for (const reply of replies) {
      const username = reply?.member?.username;
      if (!username || Number(reply.member?.created || 0) < monthAgo) continue;
      document.querySelectorAll(`img[alt="${CSS.escape(username)}"]`).forEach((avatar) => {
        avatar.closest(".cell")?.classList.add("formant-v2ex-new-user");
      });
    }
  }

  async function init(options, imgurClientId) {
    if (!/\/t\/\d+/.test(location.pathname)) return;
    const replyInput = /** @type {HTMLTextAreaElement | null} */ (document.querySelector("#reply_content"));
    if (replyInput) {
      replyInput.placeholder = "可粘贴、拖拽或选择图片上传到 Imgur";
      if (options.replyUserNum) installReplyFloor(replyInput);
      installEmojiPicker(replyInput);
      installImageUpload(replyInput, imgurClientId);
    }

    const expander = globalThis.FormantV2exReplyPages;
    if (expander?.expandAll) await expander.expandAll();

    if (options.fold) installFold();
    if (options.jump) installJump();
    if (options.opReplyBg) installOpColor(options.replyColor, options.replyA);
    addUserOutlines(options.userMarkList, options.markColor);
    installThankColor(options.thankColor);
    if (options.imageParsing) installImageParsing();
    document.querySelectorAll("img[src^='http:']").forEach((image) => {
      image.src = image.src.replace(/^http:/, "https:");
    });

    const replies = options.relateReply || options.weekNewuser ? await loadReplies() : [];
    if (options.relateReply) installRelatedReplies(replies);
    if (options.weekNewuser) installNewUserFade(replies);
    // 树形重组放最后：先让折叠/悬停卡等按单元格绑定完，再整体移动节点。
    if (options.nestedComment) installNestedComments();
  }

  runtime.onReady(({ enabled, options, imgurClientId }) => {
    if (enabled) void init(options, imgurClientId);
  });
})();
