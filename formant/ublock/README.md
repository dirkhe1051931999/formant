# uBlock Origin 1.76.0 in formant

The vendored parser, DNR compiler, scriptlet compiler, scriptlet registry and
redirect resources come from `gorhill/uBlock` tag `1.76.0`. The 10 active lists
match uBO's default subscriptions in a Chinese UI, including the Chinese
regional list. List texts refresh from the URLs in upstream `assets.json`.
Bundled copies keep the integration usable without the separately installed
uBlock Origin extension and without network access.

At runtime formant uses a hybrid MV3 pipeline:

- **Static DNR rulesets (`ublock/rulesets/*.json`)**: All 10 bundled lists are
  pre-compiled into MV3 `rule_resources` (~134k network rules), avoiding the
  30,000 dynamic-rule cap so no bundled network rules are dropped.
- **Dynamic DNR delta**: When CDN updates arrive, only rules that differ from
  the bundled static rulesets are installed via `updateDynamicRules` within the
  30,000 dynamic-rule and remaining regex budget.
- **Cosmetic & procedural filtering**: Generic and domain-specific CSS
  selectors, CSSable `:style()`, plus a procedural DOM engine (`procedural.js`)
  supporting `:has-text()`, `:upward()`, `:has()`, `:not()`, `:matches-css*()`,
  `:matches-attr()`, `:matches-path()`, `:xpath()`, `:spath()`, `:others()`,
  `:remove()`, `:remove-attr()`, `:remove-class()`, and `:style()`.
- **Dual-channel scriptlets**: Uses `chrome.userScripts` for dynamic CDN-updated
  scriptlets when allowed, and automatically falls back to pre-compiled static
  scriptlets (`ublock/rulesets/scriptlets-{main,isolated}.js`) registered via
  `chrome.scripting.registerContentScripts` when user scripts are not enabled.

Rebuild bundled list seeds:

```sh
node scripts/fetch-ublock-seeds.mjs
```

Rebuild static DNR rulesets & fallback scriptlets after updating seeds:

```sh
node scripts/build-ublock-static.mjs
```

Run the offline compiler smoke test:

```sh
node scripts/test-ublock-compile.mjs
```
