(() => {
  "use strict";

  const FEATURES_KEY = "formantFeatures";
  const $ = (sel, root = document) => root.querySelector(sel);

  if (!location.href.startsWith("file:")) return;

  const receiver = $("#axureEventReceiverDiv");
  const sender = $("#axureEventSenderDiv");
  if (!receiver || !sender) return;

  let enabled = true;
  /** @type {Event | null} */
  let routedEvent = null;

  /**
   * @param {unknown} raw
   */
  function isOn(raw) {
    const features = raw && typeof raw === "object" ? raw : {};
    const axure = /** @type {{ enabled?: boolean }} */ (features).axure;
    return !axure || axure.enabled !== false;
  }

  function markIndex(on) {
    if (!$("#mainFrame") || !document.body) return;
    if (on) document.body.setAttribute("pluginDetected", "true");
    else document.body.removeAttribute("pluginDetected");
  }

  /**
   * @param {string} requestJson
   */
  function deliver(requestJson) {
    if (!enabled || !routedEvent) return;
    receiver.innerText = requestJson;
    receiver.dispatchEvent(routedEvent);
  }

  function onSent() {
    if (!enabled) return;
    chrome.runtime.sendMessage({
      type: "FORMANT_AXURE_ROUTE",
      data: sender.innerText,
    }).catch(() => {});
  }

  /**
   * @param {unknown} request
   */
  function onRuntime(request) {
    if (!enabled || !request || typeof request !== "object") return;
    if (/** @type {{ type?: string }} */ (request).type !== "FORMANT_AXURE_ROUTE") return;
    const data = /** @type {{ data?: unknown }} */ (request).data;
    deliver(typeof data === "string" ? data : "");
  }

  function start() {
    if (routedEvent) return;
    routedEvent = document.createEvent("Event");
    routedEvent.initEvent("axureMessageReceiverEvent", true, true);
    sender.addEventListener("axureMessageSenderEvent", onSent);
    chrome.runtime.onMessage.addListener(onRuntime);
    markIndex(true);
    deliver(JSON.stringify({ message: "initialize" }));
  }

  function stop() {
    sender.removeEventListener("axureMessageSenderEvent", onSent);
    chrome.runtime.onMessage.removeListener(onRuntime);
    routedEvent = null;
    markIndex(false);
  }

  start();

  chrome.storage.local.get(FEATURES_KEY).then((data) => {
    enabled = isOn(data[FEATURES_KEY]);
    if (!enabled) stop();
  }).catch(() => {});

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[FEATURES_KEY]) return;
    const next = isOn(changes[FEATURES_KEY].newValue);
    if (next === enabled) return;
    enabled = next;
    if (enabled) start();
    else stop();
  });
})();
