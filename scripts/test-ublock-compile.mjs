// Exercises the uBO 1.76.0 compiler, formant's hybrid static+dynamic DNR, CSS, procedural & scriptlets.
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
const enabledRulesets = new Set();
let scriptletCount = 0;
let fallbackCount = 0;
let tencentScriptlet = false;
let allowUserScripts = true;
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
    updateEnabledRulesets: async ({ enableRulesetIds = [], disableRulesetIds = [] }) => {
      for (const id of disableRulesetIds) enabledRulesets.delete(id);
      for (const id of enableRulesetIds) enabledRulesets.add(id);
    },
  },
  scripting: {
    unregisterContentScripts: async () => { fallbackCount = 0; },
    registerContentScripts: async (scripts) => { fallbackCount = scripts.length; },
  },
  userScripts: {
    unregister: async () => { scriptletCount = 0; },
    register: async (scripts) => {
      if (!allowUserScripts) throw new Error('User scripts not allowed');
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
  try { return { ok: true, text: () => readFile(fileURLToPath(url), 'utf8'), json: async () => JSON.parse(await readFile(fileURLToPath(url), 'utf8')) }; }
  catch { return { ok: false }; }
};

const { applyUblockLists } = await import('../formant/ublock-apply.js');
const { getPageCss, getGenericCss } = await import('../formant/ublock-page-rules.js');
const { sanitizeRule } = await import('../formant/ublock-dnr-utils.js');
const lists = Object.fromEntries(await Promise.all(Object.entries(source).map(async ([id, path]) => [
  id,
  { id, text: await readFile(resolve(ext, 'ublock/assets', path), 'utf8'), source: 'seed' },
])));
const state = { catalogSource: 'seed', catalogFetchedAt: 0, lists };
const originalLog = console.log;
console.log = () => {}; // uBO logs unsupported post-1.76.0 scriptlet tokens.
const status = await applyUblockLists(state, { enabled: true });
console.log = originalLog;

assert(status.ruleCount > 100_000, `Expected >100k static rules, got ${status.ruleCount}`);
assert.equal(status.skipped, 0);
assert.equal(enabledRulesets.size, 10);
assert.equal(dnr.size, 1); // Only unrelated formant rule 91001; seed lists are in static rulesets.
assert.equal(scriptletCount, 2);
assert.equal(status.scriptlets, '2 worlds (userScripts)');

// Verify manifest static rulesets and fallback scriptlets exist on disk.
const manifest = JSON.parse(await readFile(resolve(ext, 'manifest.json'), 'utf8'));
for (const res of manifest.declarative_net_request.rule_resources) {
  assert(existsSync(resolve(ext, res.path)), `Missing ruleset file: ${res.path}`);
}
assert(existsSync(resolve(ext, 'ublock/rulesets/scriptlets-main.js')));
assert(existsSync(resolve(ext, 'ublock/rulesets/scriptlets-isolated.js')));

// Verify CDN delta adds only newly added rules to dynamic DNR.
const cdnLists = {
  ...lists,
  'ublock-quick-fixes': {
    ...lists['ublock-quick-fixes'],
    source: 'cdn',
    text: `${lists['ublock-quick-fixes'].text}\n||formant-cdn-delta-ad.example^\n`,
  },
};
console.log = () => {};
const cdnStatus = await applyUblockLists({ catalogSource: 'cdn', catalogFetchedAt: Date.now(), lists: cdnLists }, { enabled: true });
console.log = originalLog;
assert.equal(cdnStatus.ruleCount, status.ruleCount + 1);
assert.equal(cdnStatus.skipped, 0);
assert.equal(dnr.size, 2); // 91001 + 1 CDN delta rule.

// Verify procedural rules and scriptlet fallback when userScripts is disabled.
assert(getPageCss('https://sports.qq.com/').specific.includes('txp'));
assert(getPageCss('https://www.facebook.com/').procedural.length > 0);
assert(tencentScriptlet);
assert(getGenericCss('https://sports.qq.com/', ['.ad', '.ads']).length > 0);

allowUserScripts = false;
console.log = () => {};
const fbStatus = await applyUblockLists(state, { enabled: true });
console.log = originalLog;
assert.equal(fbStatus.scriptlets, '2 worlds (static fallback)');
assert.equal(fallbackCount, 2);

// Verify sanitizeRule drops rules with unsupported condition keys instead of widening them.
assert.equal(sanitizeRule({
  action: { type: 'block' },
  condition: {
    regexFilter: '^https:\\/\\/[a-z]{3,}\\.[a-z]{7,}\\.[a-z]{2,4}\\/',
    resourceTypes: ['script'],
    domainType: 'thirdParty',
    responseHeaders: [{ header: 'x-xcxurl', values: ['https://*'] }],
  },
}), null);
assert.equal(sanitizeRule({
  action: { type: 'block' },
  condition: { urlFilter: '||example.com^', topDomains: ['foo.example'] },
}), null);
assert.equal(sanitizeRule({
  action: { type: 'block' },
  condition: { urlFilter: '||example.com^', unknownFutureCondition: true },
}), null);

// Verify ublock-filters.json does not contain the broad third-party script regex rules that lost responseHeaders.
const ublockFiltersRules = JSON.parse(await readFile(resolve(ext, 'ublock/rulesets/ublock-filters.json'), 'utf8'));
const broadScriptRule = ublockFiltersRules.find((r) =>
  r.action?.type === 'block' &&
  typeof r.condition?.regexFilter === 'string' &&
  r.condition.regexFilter.startsWith('^https:\\/\\/[a-z]{3,}\\.[a-z]{7,}\\.[a-z]{2,4}\\/') &&
  !r.condition.initiatorDomains &&
  !r.condition.requestDomains,
);
assert.equal(broadScriptRule, undefined, `Unexpected broad regex rule in ublock-filters.json: ${JSON.stringify(broadScriptRule)}`);

const disabled = await applyUblockLists(state, { enabled: false });
assert.equal(disabled.ruleCount, 0);
assert.equal(enabledRulesets.size, 0);
assert.equal(scriptletCount, 0);
assert.equal(fallbackCount, 0);
assert(dnr.has(91001));
assert.equal(dnr.size, 1);
console.log('uBO compile verified', { rules: status.ruleCount, cdnDelta: cdnStatus.ruleCount - status.ruleCount, skipped: status.skipped, cosmetics: status.cosmeticCount, scriptlets: status.scriptlets, fallback: fbStatus.scriptlets });
