# uBlock Origin 1.76.0 in formant

The vendored parser, DNR compiler, scriptlet compiler, scriptlet registry and
redirect resources come from `gorhill/uBlock` tag `1.76.0`. The 10 active lists
match uBO's default subscriptions in a Chinese UI, including the Chinese
regional list. List texts refresh from the URLs in upstream `assets.json`.
Bundled copies keep the integration usable without the separately installed
uBlock Origin extension and without network access.

At runtime formant uses the upstream compiler outputs for:

- Network `block`, `allow`, `redirect` and supported `modifyHeaders` rules.
- Generic and domain-specific CSS selectors, including CSSable `:style()`.
- Built-in and redirect-resource scriptlets, registered for the main and user
  script worlds. Edge must allow user scripts for formant on the extension's
  details page. Reload an open site after changing this permission or lists.

MV3 cannot reproduce uBO 1.76.0's MV2 `webRequestBlocking` behavior. DNR has
a 30,000 dynamic-rule budget and a 1,000 regex-rule budget; excess network
rules are reported in formant's settings. Procedural cosmetic rules and some
network modifiers are not applied. The settings page reports when scriptlet
registration is unavailable. For exact uBO 1.76.0 behavior, keep the original
extension installed.

Rebuild bundled list seeds:

```sh
node scripts/fetch-ublock-seeds.mjs
```

Run the offline compiler smoke test:

```sh
node scripts/test-ublock-compile.mjs
```
