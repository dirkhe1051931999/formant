(() => {
  "use strict";

  function isHtmlDocument(doc) {
    return Boolean(
      doc &&
        (doc instanceof HTMLDocument ||
          doc.contentType === "text/html" ||
          doc.documentElement?.namespaceURI === "http://www.w3.org/1999/xhtml"),
    );
  }

  function getXPathResult(xpath, node, resultType) {
    const target = node || document;
    const doc = target.ownerDocument || target;
    // HTML search pages (Google etc.): never rewrite XPath with namespace
    // prefixes — DOMParser docs report XHTML NS and prefixing can make
    // evaluate() throw, which surfaces as the red "Error!" bar.
    if (isHtmlDocument(doc)) {
      return doc.evaluate(xpath, target, null, resultType, null);
    }

    const resolver = doc.createNSResolver(target.documentElement || target);
    const defaultNS = typeof target.lookupNamespaceURI === "function"
      ? target.lookupNamespaceURI(null)
      : null;

    if (defaultNS) {
      const defaultPrefix = "__default__";
      const resolved = addDefaultPrefix(xpath, defaultPrefix);
      const defaultResolver = resolver;
      const customResolver = (prefix) =>
        prefix === defaultPrefix
          ? defaultNS
          : defaultResolver.lookupNamespaceURI(prefix);
      return doc.evaluate(resolved, target, customResolver, resultType, null);
    }
    return doc.evaluate(xpath, target, resolver, resultType, null);
  }

  function addDefaultPrefix(xpath, prefix) {
    const tokenPattern =
      /([A-Za-z_\u00c0-\ufffd][\w\-.\u00b7-\ufffd]*|\*)\s*(::?|\()?|(".*?"|'.*?'|\d+(?:\.\d*)?|\.(?:\.|\d+)?|[\)\]])|(\/\/?|!=|[<>]=?|[\(\[|,=+-])|([@$])/g;
    const TERM = 1;
    const OPERATOR = 2;
    const MODIFIER = 3;
    let tokenType = OPERATOR;
    const prefixed = prefix + ":";
    function replacer(token, identifier, suffix, term, operator) {
      if (suffix) {
        tokenType =
          suffix === ":" || (suffix === "::" && identifier !== "attribute" && identifier !== "namespace")
            ? MODIFIER
            : OPERATOR;
      } else if (identifier) {
        if (tokenType === OPERATOR && identifier !== "*") token = prefixed + token;
        tokenType = tokenType === TERM ? OPERATOR : TERM;
      } else {
        tokenType = term ? TERM : operator ? OPERATOR : MODIFIER;
      }
      return token;
    }
    return xpath.replace(tokenPattern, replacer);
  }

  function getElementsByXPath(xpath, node) {
    const snapshot = getXPathResult(
      xpath,
      node,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE || 7,
    );
    const data = [];
    for (let i = 0; i < snapshot.snapshotLength; i += 1) {
      data.push(snapshot.snapshotItem(i));
    }
    return data;
  }

  function getFirstElementByXPath(xpath, node) {
    const result = getXPathResult(
      xpath,
      node,
      XPathResult.FIRST_ORDERED_NODE_TYPE || 9,
    );
    return result.singleNodeValue;
  }

  globalThis.FormantAutopagerizeXPath = {
    getElementsByXPath,
    getFirstElementByXPath,
  };
})();
