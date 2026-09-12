/**
 * AIR10 Gemini SPA Route Observer Module
 * Seamlessly tracks navigation across Gemini Students, Study Notebook, and chat pages.
 */
(() => {
  'use strict';

  if (window.__AIR10_ROUTE__) return;

  let currentUrl = typeof location !== 'undefined' ? location.href : '';
  let currentPageKind = classifyUrl(currentUrl);
  let pageGeneration = 1;

  function classifyUrl(url) {
    if (!url) return 'UNKNOWN';
    if (url.includes('gemini.google.com/students')) return 'STUDENTS';
    if (url.includes('/notebook/') || url.includes('notebook.google.com') || url.includes('notebooklm.google.com')) return 'STUDY_NOTEBOOK';
    if (url.includes('chatgpt.com')) return 'CHATGPT';
    if (url.includes('gemini.google.com/app') || url.endsWith('gemini.google.com/')) return 'HOME';
    if (url.includes('gemini.google.com')) return 'STUDENTS';
    return 'UNKNOWN';
  }

  function handleRouteChange(newUrl, reason = 'route_change') {
    if (newUrl === currentUrl && reason !== 'force') return;
    const oldUrl = currentUrl;
    currentUrl = newUrl;
    currentPageKind = classifyUrl(newUrl);
    pageGeneration++;
    window.__AIR10_PAGE_GENERATION__ = pageGeneration;

    if (window.__AIR10_TELEMETRY__) {
      window.__AIR10_TELEMETRY__.emit('NAVIGATION_CHANGE', {
        old_url: oldUrl,
        new_url: newUrl,
        page_kind: currentPageKind,
        reason: reason,
        page_generation: pageGeneration
      });
    }
  }

  // Intercept history.pushState & replaceState
  if (typeof history !== 'undefined') {
    const origPushState = history.pushState;
    history.pushState = function(...args) {
      const res = origPushState.apply(this, args);
      handleRouteChange(location.href, 'pushState');
      return res;
    };

    const origReplaceState = history.replaceState;
    history.replaceState = function(...args) {
      const res = origReplaceState.apply(this, args);
      handleRouteChange(location.href, 'replaceState');
      return res;
    };
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      handleRouteChange(location.href, 'popstate');
    });

    // Fallback URL checker
    const routeTimer = setInterval(() => {
      if (typeof location !== 'undefined' && location.href !== currentUrl) {
        handleRouteChange(location.href, 'interval_detect');
      }
    }, 500);
    if (routeTimer && typeof routeTimer.unref === 'function') {
      routeTimer.unref();
    }

    // Initial page ready notification
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(() => {
        if (window.__AIR10_TELEMETRY__) {
          window.__AIR10_TELEMETRY__.emit('PAGE_READY', {
            url: currentUrl,
            page_kind: currentPageKind,
            page_generation: pageGeneration
          });
        }
      }, 100);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (window.__AIR10_TELEMETRY__) {
          window.__AIR10_TELEMETRY__.emit('PAGE_READY', {
            url: currentUrl,
            page_kind: currentPageKind,
            page_generation: pageGeneration
          });
        }
      });
    }
  }

  window.__AIR10_ROUTE__ = {
    getUrl: () => currentUrl,
    getPageKind: () => currentPageKind,
    getGeneration: () => pageGeneration,
    classifyUrl: classifyUrl,
    forceCheck: () => handleRouteChange(location.href, 'force')
  };

  console.log('[AIR10 Route Observer] Initialized for: ' + currentPageKind);
})();
