// Build static MV3 DNR rulesets and fallback scriptlets from bundled uBO lists.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ext = resolve("formant");
const outDir = resolve(ext, "ublock/rulesets");

globalThis.chrome = {
  runtime: { getURL: (path) => pathToFileURL(resolve(ext, path)).href },
};
globalThis.fetch = async (url) => {
  try {
    return { ok: true, text: () => readFile(fileURLToPath(url), "utf8") };
  } catch {
    return { ok: false, status: 404 };
  }
};

const SEED_PATHS = {
  "ublock-filters": "ublock/assets/ublock/filters.min.txt",
  "ublock-badware": "ublock/assets/ublock/badware.min.txt",
  "ublock-privacy": "ublock/assets/ublock/privacy.min.txt",
  "ublock-quick-fixes": "ublock/assets/ublock/quick-fixes.min.txt",
  "ublock-unbreak": "ublock/assets/ublock/unbreak.min.txt",
  easylist: "ublock/assets/thirdparties/easylist/easylist.txt",
  easyprivacy: "ublock/assets/thirdparties/easylist/easyprivacy.txt",
  "CHN-0": "ublock/assets/thirdparties/adguard/chinese.txt",
  "plowe-0": "ublock/assets/thirdparties/pgl.yoyo.org/as/serverlist.txt",
  "urlhaus-1": "ublock/assets/thirdparties/urlhaus-filter/urlhaus-filter-online.txt",
};

await import("../formant/ublock/core/vapi-shim.js");
const { dnrRulesetFromRawLists } = await import("../formant/ublock/core/static-dnr-filtering.js");
const publicSuffixList = (await import("../formant/ublock/core/publicsuffix.js")).default;
const punycode = (await import("../formant/ublock/lib/punycode.js")).default;
const makeScriptlets = await import("../formant/ublock/core/make-scriptlets.js");
const { builtinScriptlets } = await import("../formant/ublock/core/resources/scriptlets.js");
const redirectResources = (await import("../formant/ublock/core/redirect-resources.js")).default;
const {
  ENV,
  STATIC_REGEX_BUDGET,
  STATIC_RULESETS,
  explodeDomains,
  extensionPaths,
  sanitizeRule,
} = await import("../formant/ublock-dnr-utils.js");

const pslText = await readFile(
  resolve(ext, "ublock/assets/thirdparties/publicsuffix.org/list/effective_tld_names.dat"),
  "utf8",
);
publicSuffixList.parse(pslText, punycode.toASCII);

await mkdir(outDir, { recursive: true });

const originalLog = console.log;
let totalRules = 0;
let totalRegex = 0;
let droppedRegex = 0;
const metaRulesets = [];

const rawListsForScriptlets = [];

for (const item of STATIC_RULESETS) {
  const text = await readFile(resolve(ext, SEED_PATHS[item.listId]), "utf8");
  const listInput = {
    name: item.listId,
    text,
    trustedSource: item.listId.startsWith("ublock-"),
  };
  rawListsForScriptlets.push(listInput);

  console.log = () => {};
  const result = await dnrRulesetFromRawLists([listInput], { env: ENV, extensionPaths });
  console.log = originalLog;

  const rawRules = Array.isArray(result?.network?.ruleset) ? result.network.ruleset : [];
  const rules = [];
  let regexCount = 0;
  for (const raw of rawRules) {
    const clean = sanitizeRule(raw);
    if (!clean) continue;
    for (const part of explodeDomains(clean)) {
      if (part.condition.regexFilter) {
        if (totalRegex >= STATIC_REGEX_BUDGET) {
          droppedRegex += 1;
          continue;
        }
        totalRegex += 1;
        regexCount += 1;
      }
      rules.push({
        ...part,
        id: rules.length + 1,
      });
    }
  }

  await writeFile(resolve(ext, item.path), JSON.stringify(rules), "utf8");
  totalRules += rules.length;
  metaRulesets.push({
    id: item.rulesetId,
    listId: item.listId,
    file: `${item.listId}.json`,
    count: rules.length,
    regexCount,
  });
}

// Compile combined scriptlets from all 10 lists into static JS files for scripting fallback.
console.log = () => {};
const combinedResult = await dnrRulesetFromRawLists(rawListsForScriptlets, { env: ENV, extensionPaths });
console.log = originalLog;

const [template, begin, end] = await Promise.all([
  readFile(resolve(ext, "ublock/core/scriptlet.template.js"), "utf8"),
  readFile(resolve(ext, "ublock/core/scriptlet-begin.template.js"), "utf8"),
  readFile(resolve(ext, "ublock/core/scriptlet-end.template.js"), "utf8"),
]);

makeScriptlets.resetAll();
makeScriptlets.init(builtinScriptlets);
await Promise.all(
  [...redirectResources]
    .filter(([name, details]) => name.endsWith(".js") && details.data === "text")
    .map(async ([name, details]) => {
      const code = await readFile(resolve(ext, `ublock/core/web_accessible_resources/${name}`), "utf8");
      makeScriptlets.importScriptlet({ name, code, ...details });
    }),
);
for (const details of combinedResult.scriptlet.values()) {
  makeScriptlets.compile("formant", structuredClone(details));
}
const secret = "formant_ubo_static_fallback";
const scripts = makeScriptlets.commit("formant", template, secret);
const frameworks = makeScriptlets.commitFramework(begin, end, secret);

const scriptletFiles = {};
for (const [world, filename] of [
  ["MAIN", "scriptlets-main.js"],
  ["ISOLATED", "scriptlets-isolated.js"],
]) {
  const code = scripts[world]
    ? `${frameworks[world].beginCode}\n${scripts[world].code}\n${frameworks[world].endCode}`
    : "";
  new Function(code);
  await writeFile(resolve(outDir, filename), code, "utf8");
  scriptletFiles[world] = filename;
}

const meta = {
  generatedAt: new Date().toISOString(),
  totalRules,
  totalRegex,
  droppedRegex,
  rulesets: metaRulesets,
  scriptlets: scriptletFiles,
};
await writeFile(resolve(outDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");

assert(totalRules > 100_000, `Expected >100,000 static rules, got ${totalRules}`);
assert(totalRegex <= STATIC_REGEX_BUDGET, `Expected <=${STATIC_REGEX_BUDGET} static regex rules, got ${totalRegex}`);

console.log("Static uBO rulesets built:", {
  totalRules,
  totalRegex,
  droppedRegex,
  lists: metaRulesets.length,
});
