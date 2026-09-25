export function buildUtmPassthroughSnippet(lpDomains: string[], checkoutDomains: string[]): string {
  const targets = Array.from(
    new Set([...checkoutDomains, ...lpDomains, 'pay.hotmart.com', 'go.hotmart.com'].filter(Boolean))
  )
  const targetsJs = targets.map(d => `    '${d}'`).join(',\n')
  return `<script>
(function () {
  // Repassa fbclid/utm_* (e sck/src/xcod da Hotmart) de página em página do
  // funil, inclusive pro botão final de checkout — sem isso, link fixo de
  // botão perde o rastreio do anúncio e a venda não conta pro Meta.
  var TARGET_DOMAINS = [
${targetsJs}
  ];

  var PARAMS_TO_TRACK = [
    'src', 'sck', 'xcod',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
    'fbclid', 'gclid', 'ttclid'
  ];

  var STORAGE_KEY = 'track_utm_passthrough';

  function parseQueryString(qs) {
    var params = {};
    if (!qs) return params;
    qs.split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      var key = decodeURIComponent(kv[0]);
      var value = kv[1] ? decodeURIComponent(kv[1].replace(/\\+/g, ' ')) : '';
      params[key] = value;
    });
    return params;
  }

  function getUrlParams() {
    return parseQueryString(window.location.search.substring(1));
  }

  function loadStoredParams() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveParams(params) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(params));
    } catch (e) {}
  }

  function mergeParams() {
    var current = getUrlParams();
    var stored = loadStoredParams();
    var merged = stored;
    PARAMS_TO_TRACK.forEach(function (key) {
      if (current[key]) {
        merged[key] = current[key];
      }
    });
    saveParams(merged);
    return merged;
  }

  function buildQueryString(params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      if (params[key]) {
        parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    });
    return parts.join('&');
  }

  function mergeParamsIntoUrl(originalUrl, newParams) {
    var hashSplit = originalUrl.split('#');
    var withoutHash = hashSplit[0];
    var hash = hashSplit.length > 1 ? '#' + hashSplit.slice(1).join('#') : '';

    var qIndex = withoutHash.indexOf('?');
    var base = qIndex !== -1 ? withoutHash.substring(0, qIndex) : withoutHash;
    var existingQs = qIndex !== -1 ? withoutHash.substring(qIndex + 1) : '';
    var existingParams = parseQueryString(existingQs);

    Object.keys(newParams).forEach(function (key) {
      var newValue = newParams[key];
      if (!newValue) return;
      if (!existingParams[key]) {
        existingParams[key] = newValue;
      }
    });

    var newQs = buildQueryString(existingParams);
    return base + (newQs ? '?' + newQs : '') + hash;
  }

  function isTargetLink(href) {
    return TARGET_DOMAINS.some(function (domain) {
      return href.indexOf(domain) !== -1;
    });
  }

  function appendParamsToLink(link, params) {
    if (link.dataset.utmApplied === '1') return;
    var href = link.getAttribute('href');
    if (!href) return;
    link.setAttribute('href', mergeParamsIntoUrl(href, params));
    link.dataset.utmApplied = '1';
  }

  function applyToAllLinks() {
    var params = mergeParams();
    if (Object.keys(params).length === 0) return;

    document.querySelectorAll('a[href]').forEach(function (link) {
      var href = link.getAttribute('href');
      if (!href) return;

      if (isTargetLink(href)) {
        appendParamsToLink(link, params);
        return;
      }

      var isAnchorOrSpecial =
        href.indexOf('#') === 0 ||
        href.indexOf('mailto:') === 0 ||
        href.indexOf('tel:') === 0 ||
        href.indexOf('javascript:') === 0;
      var isExternal = /^https?:\\/\\//i.test(href) && href.indexOf(window.location.hostname) === -1;

      if (!isAnchorOrSpecial && !isExternal) {
        appendParamsToLink(link, params);
      }
    });
  }

  function processOnclickButtons() {
    var params = mergeParams();
    if (Object.keys(params).length === 0) return;

    document.querySelectorAll('[onclick]').forEach(function (el) {
      if (el.dataset.utmAppliedOnclick === '1') return;
      var onclickAttr = el.getAttribute('onclick');
      if (!onclickAttr) return;
      var isTarget = TARGET_DOMAINS.some(function (domain) {
        return onclickAttr.indexOf(domain) !== -1;
      });
      if (!isTarget) return;
      var urlMatch = onclickAttr.match(/(['"])(https?:\\/\\/[^'"]+)\\1/);
      if (!urlMatch) return;
      var newUrl = mergeParamsIntoUrl(urlMatch[2], params);
      el.setAttribute('onclick', onclickAttr.split(urlMatch[2]).join(newUrl));
      el.dataset.utmAppliedOnclick = '1';
    });
  }

  function processDataUrlButtons() {
    var params = mergeParams();
    if (Object.keys(params).length === 0) return;

    document.querySelectorAll('[data-url]').forEach(function (el) {
      if (el.dataset.utmAppliedDataUrl === '1') return;
      var encoded = el.getAttribute('data-url');
      if (!encoded) return;
      var decoded;
      try { decoded = atob(encoded); } catch (e) { return; }
      var isTarget = TARGET_DOMAINS.some(function (domain) {
        return decoded.indexOf(domain) !== -1;
      });
      if (!isTarget) return;
      var newUrl = mergeParamsIntoUrl(decoded, params);
      var newEncoded;
      try { newEncoded = btoa(newUrl); } catch (e) { return; }
      el.setAttribute('data-url', newEncoded);
      el.dataset.utmAppliedDataUrl = '1';
    });
  }

  function applyToEverything() {
    applyToAllLinks();
    processOnclickButtons();
    processDataUrlButtons();
  }

  document.addEventListener('DOMContentLoaded', function () {
    applyToEverything();
    new MutationObserver(applyToEverything).observe(document.body, { childList: true, subtree: true });
  });
})();
</script>`
}

export function buildFullHeadSnippet(workerSubdomain: string, lpDomains: string[], checkoutDomains: string[]): string {
  const trackerTag = `<script src="https://${workerSubdomain}/t.js"></script>`
  return `${trackerTag}\n\n${buildUtmPassthroughSnippet(lpDomains, checkoutDomains)}`
}
