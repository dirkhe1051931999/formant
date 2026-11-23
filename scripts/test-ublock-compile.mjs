// Exercises the uBO 1.76.0 compiler, formant's DNR quota, CSS and scriptlets.
// No browser or network required: uses the bundled offline lists.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ext = resolve('formant');
const source = {
  'ublock-filters': 'ublock/filters.min.txt',
  'ublock-badware': 'ublock/badware.min.txt',
  'ublock-privacy': 'ublock/privacy.min.txt',
  'ublock-quick-fixes': 'ublock/quick-fixes.min.txt',
  'ublock-unbreak': 'ublock/unbreak.min.txt',
  easylist: 'thirdparties/easylist/easylist.txt',
  easyprivacy: 'thirdparties/easylist/easyprivacy.txt',
  'CHN-0': 'thirdparties/adguard/chinese.txt',
  'plowe-0': 'thirdparties/pgl.yoyo.org/as/serverlist.txt',
  'urlhaus-1': 'thirdparties/urlhaus-filter/urlhaus-filter-online.txt',
};

const dnr = new Map([[91001, { id: 91001, action: { type: 'block' }, condition: { urlFilter: 'huavod' } }]]);
let scriptletCount = 0;
let tencentScriptlet = false;
const saved = {};
globalThis.chrome = {
  runtime: { getURL: (path) => pathToFileURL(resolve(ext, path)).href },
  storage: { local: { set: async (value) => Object.assign(saved, value) } },
  declarativeNetRequest: {
    MAX_NUMBER_OF_DYNAMIC_RULES: 30_000,
    MAX_NUMBER_OF_REGEX_RULES: 1_000,
    MAX_NUMBER_OF_UNSAFE_DYNAMIC_RULES: 5_000,
    getDynamicRules: async () => [...dnr.values()],
    updateDynamicRules: async ({ removeRuleIds, addRules }) => {
      for (const id of removeRuleIds) dnr.delete(id);
      for (const rule of addRules) dnr.set(rule.id, rule);
    },
  },
  userScripts: {
    unregister: async () => { scriptletCount = 0; },
    register: async (scripts) => {
      for (const script of scripts) {
        const code = script.js[0].code;
        new Function(code);
        if (code.includes('CreativePlayerwebPlugin.AD_EVENT.AD_LOAD_START') && code.includes('sports.qq.com')) tencentScriptlet = true;
      }
      scriptletCount = scripts.length;
    },
  },
};
globalThis.fetch = async (url) => {
  try { return { ok: true, text: () => readFile(fileURLToPath(url), 'utf8') }; }
  catch { return { ok: false }; }
};

const { applyUblockLists } = await import('../formant/ublock-apply.js');
const { getPageCss, getGenericCss } = await import('../formant/ublock-page-rules.js');
const lists = Object.fromEntries(await Promise.all(Object.entries(source).map(async ([id, path]) => [
  id,
  { id, text: await readFile(resolve(ext, 'ublock/assets', path), 'utf8'), source: 'seed' },
])));
const state = { catalogSource: 'seed', catalogFetchedAt: 0, lists };
const originalLog = console.log;
console.log = () => {}; // uBO logs unsupported post-1.76.0 scriptlet tokens.
const status = await applyUblockLists(state, { enabled: true });
console.log = originalLog;
assert(status.ruleCount > 20_000);
assert(status.ruleCount <= 30_000);
assert.equal(scriptletCount, 2);
assert.equal(status.scriptlets, '2 worlds');
const redirects = [...dnr.values()].filter((rule) => rule.action.type === 'redirect').length;
assert(redirects > 100);
for (const rule of dnr.values()) {
  if (rule.action.type !== 'redirect') continue;
  assert(existsSync(resolve(ext, rule.action.redirect.extensionPath.slice(1))));
}
assert(getPageCss('https://sports.qq.com/').specific.includes('txp'));
assert(tencentScriptlet);
assert(getGenericCss('https://sports.qq.com/', ['.ad', '.ads']).length > 0);
assert(dnr.has(91001)); // Other formant rules are untouched.
const disabled = await applyUblockLists(state, { enabled: false });
assert.equal(disabled.ruleCount, 0);
assert.equal(scriptletCount, 0);
assert(dnr.has(91001));
assert.equal(dnr.size, 1);
console.log('uBO compile verified', { rules: status.ruleCount, redirects, skipped: status.skipped, cosmetics: status.cosmeticCount, scriptlets: status.scriptlets });
