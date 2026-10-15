(() => {
  "use strict";

  /**
   * High-priority rules for common search engines whose wedata XPath is outdated.
   * Kept small and explicit; users can still override via customSiteinfo.
   */
  const BUILTIN_SITEINFO = [
    {
      url: "^https?://(?:www|encrypted)\\.google(?:\\.[^./]{2,3}){1,2}/(?:c(?:se|ustom)|search|webhp)",
      nextLink:
        'id("pnnext") | //a[@id="pnnext"] | //a[@aria-label="Next page" or @aria-label="下一页" or @aria-label="下一頁" or @aria-label="次へ"] | id("navbar")//td[last()]/a | id("nn")/parent::a | id("nav")//td[last()]/a',
      pageElement:
        'id("rso")/* | id("search")//div[contains(concat(" ", normalize-space(@class), " "), " g ")] | id("res")//div[contains(concat(" ", normalize-space(@class), " "), " g ")] | id("res")/div[ol or div] | id("ofr")',
      insertBefore: 'id("botstuff") | id("navcnt") | id("foot")',
    },
    {
      url: "^https?://(?:www|cn|cnweb)\\.bing\\.com/(?:[^/]+/)*?(?:results\\.aspx|search)",
      nextLink:
        '//a[contains(concat(" ", normalize-space(@class), " "), " sb_pagN ")] | //a[@title="Next page" or @aria-label="Next page" or @title="下一页"]',
      pageElement:
        'id("b_results")/li[contains(concat(" ", normalize-space(@class), " "), " b_algo ") or contains(concat(" ", normalize-space(@class), " "), " b_ans ")] | id("results")/ul[@class="sb_results"]/*',
      insertBefore: 'id("b_results")/li[@class="b_pag"] | id("b_results")/aside',
    },
  ];

  globalThis.FormantAutopagerizeBuiltinSiteinfo = BUILTIN_SITEINFO;
})();
