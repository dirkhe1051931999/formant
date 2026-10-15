(() => {
  const runtime = globalThis.__formantV2ex;
  if (!runtime) return;

  let hideTimer = 0;
  let showToken = 0;

  function usernameForAvatar(avatar) {
    const link = avatar.closest("a[href*='/member/']");
    const fromLink = link?.getAttribute("href")?.match(/\/member\/([^/?#]+)/)?.[1];
    if (fromLink) return fromLink;
    return String(avatar.getAttribute("alt") || "").trim();
  }

  function extractProfile(html, username) {
    const memberId = html.match(/V2EX 第 ([0-9]+?) 号会员/)?.[1] || "";
    const created = html.match(/加入于 (.+?) /)?.[1] || "";
    const tagline = html.match(/class="bigger">([\s\S]*?)<\/span>/)?.[1]?.replace(/<[^>]*>/g, "").trim() || "";
    const online = /ONLINE/.test(html);
    const followUrl = html.match(/href="(\/(?:follow|unfollow)\/[^"]+\?once=\d+)"/)?.[1] || "";
    const blockUrl = html.match(/href="(\/(?:block|unblock)\/[^"]+\?once=\d+)"/)?.[1] || "";
    return {
      memberId,
      created,
      tagline,
      online,
      followUrl,
      blockUrl,
      followed: !/加入特别关注/.test(html),
      blocked: !/\bBlock\b/.test(html),
      username,
    };
  }

  function closeCard() {
    document.querySelector("[data-formant-v2ex-user-card]")?.remove();
  }

  function cancelHide() {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = window.setTimeout(() => {
      hideTimer = 0;
      closeCard();
    }, 180);
  }

  async function setMarked(username, marked) {
    const result = await chrome.storage.sync.get("options");
    const options = result.options && typeof result.options === "object" ? result.options : {};
    const list = Array.isArray(options.userMarkList) ? options.userMarkList.map(String) : [];
    options.userMarkList = marked
      ? [...new Set([...list, username])]
      : list.filter((item) => item !== username);
    await chrome.storage.sync.set({ options });
  }

  async function showCard(avatar, options) {
    const username = usernameForAvatar(avatar);
    if (!username) return;

    const token = (showToken += 1);
    cancelHide();
    closeCard();
    avatar.dataset.formantV2exLoading = "true";

    try {
      const response = await fetch(`/member/${encodeURIComponent(username)}`, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const profile = extractProfile(await response.text(), username);

      // Fetch 期间已移开 / 又悬停了别人：丢弃过期结果，避免“粘住”的卡。
      if (token !== showToken) return;
      if (!avatar.isConnected || !avatar.matches(":hover")) return;

      const card = runtime.mark(document.createElement("section"));
      card.dataset.formantV2exUserCard = "true";
      card.className = "formant-v2ex-user-card";
      const title = document.createElement("strong");
      title.textContent = `${profile.username}${profile.memberId ? ` · V2EX 第 ${profile.memberId} 号会员` : ""}`;
      const meta = document.createElement("small");
      meta.textContent = `${profile.online ? "在线" : "离线"}${profile.created ? ` · 加入于 ${profile.created}` : ""}`;
      card.append(title, meta);
      if (profile.tagline) {
        const tagline = document.createElement("p");
        tagline.textContent = profile.tagline;
        card.append(tagline);
      }

      const actions = document.createElement("div");
      actions.className = "formant-v2ex-user-card__actions";
      const follow = document.createElement("button");
      follow.type = "button";
      follow.textContent = profile.followed ? "取消关注" : "关注";
      follow.disabled = !profile.followUrl;
      follow.addEventListener("click", async () => {
        if (!profile.followUrl) return;
        await fetch(profile.followUrl, { credentials: "include" });
        follow.textContent = follow.textContent === "关注" ? "取消关注" : "关注";
      });

      const block = document.createElement("button");
      block.type = "button";
      block.textContent = profile.blocked ? "取消屏蔽" : "屏蔽";
      block.disabled = !profile.blockUrl;
      block.addEventListener("click", async () => {
        if (!profile.blockUrl) return;
        await fetch(profile.blockUrl, { credentials: "include" });
        window.location.reload();
      });

      const isMarked = options.userMarkList.includes(username);
      const mark = document.createElement("button");
      mark.type = "button";
      mark.textContent = isMarked ? "取消标记" : "标记";
      mark.addEventListener("click", async () => {
        const next = mark.textContent === "标记";
        await setMarked(username, next);
        mark.textContent = next ? "取消标记" : "标记";
      });
      actions.append(follow, block, mark);
      card.append(actions);
      card.addEventListener("mouseenter", cancelHide);
      card.addEventListener("mouseleave", scheduleHide);
      document.body.append(card);

      const rect = avatar.getBoundingClientRect();
      card.style.top = `${Math.max(8, rect.top + window.scrollY - card.offsetHeight - 8)}px`;
      card.style.left = `${Math.max(8, rect.left + window.scrollX - 80)}px`;

      // 定位后若已不在头像上，交给延时关闭（移入卡片会 cancelHide）。
      if (!avatar.matches(":hover") && !card.matches(":hover")) scheduleHide();
    } catch (error) {
      console.warn("[formant] V2EX user card failed", error);
    } finally {
      delete avatar.dataset.formantV2exLoading;
    }
  }

  runtime.onReady(({ enabled, options }) => {
    if (!enabled || !options.userinfo) return;
    document.querySelectorAll(".avatar").forEach((avatar) => {
      if (!(avatar instanceof HTMLImageElement) || avatar.dataset.formantV2exUserinfo) return;
      avatar.dataset.formantV2exUserinfo = "true";
      avatar.addEventListener("mouseenter", () => void showCard(avatar, options));
      avatar.addEventListener("mouseleave", scheduleHide);
    });
  });
})();
