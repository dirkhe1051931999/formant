window.addEventListener("message", (event) => {
  if (event.source && event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "formant-vue-detect") return;
  chrome.runtime.sendMessage({
    type: "FORMANT_VUE_DETECTED",
    present: Boolean(data.present),
  }).catch(() => {});
});
