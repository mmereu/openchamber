/**
 * Preview Proxy Library
 * 
 * Provides functionality to proxy web pages and inject element selection scripts.
 * This enables element picking in the preview iframe even for cross-origin pages.
 */

/**
 * The injection script that enables element selection in proxied pages.
 * This script is injected into every HTML page served through the proxy.
 */
const OPENCHAMBER_INJECT_SCRIPT = `
(function() {
  // Prevent double initialization
  if (window.__openchamberInjected) return;
  window.__openchamberInjected = true;

  // Get the original URL from the meta tag injected by the proxy
  const originalUrlMeta = document.querySelector('meta[name="openchamber-original-url"]');
  const originalUrl = originalUrlMeta ? originalUrlMeta.getAttribute('content') : window.location.href;

  // Element picker state
  let isPickerActive = false;
  let overlayElement = null;
  let lastHoveredElement = null;

  // Intercept console methods and forward to parent
  const originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  function formatConsoleArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }

  function forwardConsole(level, args) {
    const message = Array.from(args).map(formatConsoleArg).join(' ');
    window.parent.postMessage({
      type: 'OPENCHAMBER_CONSOLE',
      data: { level, message }
    }, '*');
  }

  console.log = function(...args) {
    originalConsole.log(...args);
    forwardConsole('log', args);
  };

  console.info = function(...args) {
    originalConsole.info(...args);
    forwardConsole('info', args);
  };

  console.warn = function(...args) {
    originalConsole.warn(...args);
    forwardConsole('warn', args);
  };

  console.error = function(...args) {
    originalConsole.error(...args);
    forwardConsole('error', args);
  };

  // Capture uncaught errors
  window.addEventListener('error', (event) => {
    forwardConsole('error', [event.message + ' at ' + event.filename + ':' + event.lineno]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    forwardConsole('error', ['Unhandled Promise Rejection: ' + (event.reason?.message || event.reason)]);
  });

  // Create highlight overlay element
  function createOverlay() {
    if (overlayElement) return overlayElement;
    
    overlayElement = document.createElement('div');
    overlayElement.id = '__openchamber_overlay';
    overlayElement.style.cssText = \`
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      border: 2px solid #3b82f6;
      background-color: rgba(59, 130, 246, 0.1);
      transition: all 0.05s ease-out;
      display: none;
    \`;
    document.body.appendChild(overlayElement);
    return overlayElement;
  }

  // Generate a unique CSS selector for an element
  function generateSelector(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return el?.tagName?.toLowerCase() || 'html';
    }
    
    if (el.id) {
      return '#' + CSS.escape(el.id);
    }
    
    const path = [];
    let current = el;
    
    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }
      
      // Add class names for specificity (first 2 classes only)
      const classes = Array.from(current.classList || [])
        .filter(c => c && !c.startsWith('__'))
        .slice(0, 2);
      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }
      
      // Add nth-of-type if needed for uniqueness
      const siblings = current.parentElement?.children || [];
      const sameTagSiblings = Array.from(siblings).filter(
        s => s.tagName === current.tagName
      );
      if (sameTagSiblings.length > 1) {
        const index = sameTagSiblings.indexOf(current) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join(' > ');
  }

  // Generate XPath for an element
  function generateXPath(el) {
    if (!el) return '';
    if (el === document.body) return '/html/body';
    if (el === document.documentElement) return '/html';
    
    const parts = [];
    let current = el;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousSibling;
      
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && 
            sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      const tagName = current.tagName.toLowerCase();
      parts.unshift(tagName + '[' + index + ']');
      current = current.parentElement;
    }
    
    return '/' + parts.join('/');
  }

  // Get computed styles for an element (subset of important properties)
  function getComputedStylesSubset(el) {
    const computed = window.getComputedStyle(el);
    const importantProps = [
      'display', 'position', 'width', 'height', 'margin', 'padding',
      'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight',
      'border', 'borderRadius', 'opacity', 'visibility', 'overflow',
      'flexDirection', 'justifyContent', 'alignItems', 'gap'
    ];
    
    const styles = {};
    for (const prop of importantProps) {
      const value = computed.getPropertyValue(prop.replace(/([A-Z])/g, '-$1').toLowerCase());
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
        styles[prop] = value;
      }
    }
    return styles;
  }

  // Capture comprehensive element data
  function captureElementData(el) {
    const rect = el.getBoundingClientRect();
    const attributes = {};
    const dataAttributes = {};
    
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith('data-')) {
        dataAttributes[attr.name] = attr.value;
      } else {
        attributes[attr.name] = attr.value;
      }
    }
    
    return {
      selector: generateSelector(el),
      xpath: generateXPath(el),
      tagName: el.tagName.toLowerCase(),
      outerHTML: el.outerHTML.substring(0, 5000),
      innerHTML: el.innerHTML.substring(0, 2000),
      innerText: (el.innerText || '').substring(0, 1000),
      textContent: (el.textContent || '').substring(0, 1000),
      attributes: attributes,
      dataAttributes: dataAttributes,
      computedStyles: getComputedStylesSubset(el),
      boundingRect: {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        bottom: rect.bottom,
        right: rect.right,
        x: rect.x,
        y: rect.y
      },
      accessibility: {
        role: el.getAttribute('role') || el.tagName.toLowerCase(),
        ariaLabel: el.getAttribute('aria-label'),
        ariaDescribedBy: el.getAttribute('aria-describedby'),
        ariaLabelledBy: el.getAttribute('aria-labelledby'),
        tabIndex: el.tabIndex,
        title: el.title || null
      },
      context: {
        url: originalUrl,
        title: document.title,
        parentSelector: el.parentElement ? generateSelector(el.parentElement) : null,
        childCount: el.children?.length || 0,
        siblingCount: el.parentElement?.children?.length || 0
      },
      metadata: {
        timestamp: Date.now(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        scroll: {
          x: window.scrollX,
          y: window.scrollY
        }
      }
    };
  }

  // Update overlay position to match element
  function updateOverlayPosition(el) {
    if (!overlayElement || !el) return;
    
    const rect = el.getBoundingClientRect();
    overlayElement.style.top = rect.top + 'px';
    overlayElement.style.left = rect.left + 'px';
    overlayElement.style.width = rect.width + 'px';
    overlayElement.style.height = rect.height + 'px';
    overlayElement.style.display = 'block';
  }

  // Mouse move handler
  function handleMouseMove(e) {
    if (!isPickerActive) return;
    
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlayElement || el === document.body || el === document.documentElement) {
      return;
    }
    
    if (el !== lastHoveredElement) {
      lastHoveredElement = el;
      updateOverlayPosition(el);
    }
  }

  // Click handler
  function handleClick(e) {
    if (!isPickerActive) return;
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlayElement) {
      return;
    }
    
    const elementData = captureElementData(el);
    
    // Send data to parent
    window.parent.postMessage({
      type: 'OPENCHAMBER_ELEMENT_SELECTED',
      data: elementData
    }, '*');
    
    // Disable picker after selection
    disablePicker();
  }

  // Keyboard handler (Escape to cancel)
  function handleKeyDown(e) {
    if (!isPickerActive) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      window.parent.postMessage({ type: 'OPENCHAMBER_PICKER_CANCELLED' }, '*');
      disablePicker();
    }
  }

  // Enable element picker
  function enablePicker() {
    if (isPickerActive) return;
    
    isPickerActive = true;
    createOverlay();
    
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    
    // Change cursor
    document.body.style.cursor = 'crosshair';
  }

  // Disable element picker
  function disablePicker() {
    if (!isPickerActive) return;
    
    isPickerActive = false;
    lastHoveredElement = null;
    
    if (overlayElement) {
      overlayElement.style.display = 'none';
    }
    
    document.removeEventListener('mousemove', handleMouseMove, true);
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('keydown', handleKeyDown, true);
    
    // Restore cursor
    document.body.style.cursor = '';
  }

  // Resolve a URL relative to the original URL
  function resolveUrl(href) {
    if (!href) return null;
    try {
      // Handle absolute URLs
      if (href.startsWith('http://') || href.startsWith('https://')) {
        return href;
      }
      // Handle protocol-relative URLs
      if (href.startsWith('//')) {
        return new URL(originalUrl).protocol + href;
      }
      // Handle root-relative URLs
      if (href.startsWith('/')) {
        const base = new URL(originalUrl);
        return base.origin + href;
      }
      // Handle relative URLs
      const base = new URL(originalUrl);
      const basePath = base.pathname.replace(/[^/]*$/, '');
      return base.origin + basePath + href;
    } catch {
      return null;
    }
  }

  // Track URL changes and notify parent
  function notifyUrlChange(newOriginalUrl) {
    window.parent.postMessage({
      type: 'OPENCHAMBER_URL_CHANGED',
      data: { 
        originalUrl: newOriginalUrl,
        title: document.title 
      }
    }, '*');
  }

  // Message listener for commands from parent
  window.addEventListener('message', (event) => {
    const { type } = event.data || {};
    
    switch (type) {
      case 'OPENCHAMBER_PICKER_ENABLE':
        enablePicker();
        break;
      case 'OPENCHAMBER_PICKER_DISABLE':
        disablePicker();
        break;
    }
  });

  // Notify parent that script is ready with the original URL
  window.parent.postMessage({
    type: 'OPENCHAMBER_SCRIPT_READY',
    data: {
      originalUrl: originalUrl,
      url: window.location.href,
      title: document.title
    }
  }, '*');

  // Add initial log entry
  console.log('[OpenChamber] Preview loaded: ' + originalUrl);
})();
`;

/**
 * Injects the element selector script into HTML content.
 * @param {string} html - The original HTML content
 * @param {string} originalUrl - The original URL being proxied
 * @returns {string} - HTML with injected script and metadata
 */
function injectScript(html, originalUrl) {
  // Create meta tag with original URL for the script to read
  const metaTag = `<meta name="openchamber-original-url" content="${escapeHtml(originalUrl)}">`;
  const scriptTag = `<script>${OPENCHAMBER_INJECT_SCRIPT}</script>`;
  
  // Try to inject meta in head and script before </body>
  let result = html;
  
  // Inject meta tag in head
  if (result.includes('<head>')) {
    result = result.replace('<head>', `<head>${metaTag}`);
  } else if (result.includes('<html>')) {
    result = result.replace('<html>', `<html><head>${metaTag}</head>`);
  } else {
    result = metaTag + result;
  }
  
  // Inject script before </body>
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${scriptTag}</body>`);
  } else if (result.includes('</html>')) {
    result = result.replace('</html>', `${scriptTag}</html>`);
  } else {
    result = result + scriptTag;
  }
  
  return result;
}

/**
 * Escapes HTML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strips security headers that prevent iframe embedding.
 * @param {Headers|Object} headers - The response headers
 * @returns {Object} - Cleaned headers object
 */
function stripSecurityHeaders(headers) {
  const headersObj = {};
  const blockedHeaders = new Set([
    'x-frame-options',
    'content-security-policy',
    'content-security-policy-report-only',
    'x-content-type-options',
    'cross-origin-opener-policy',
    'cross-origin-embedder-policy',
    'cross-origin-resource-policy'
  ]);
  
  // Handle both Headers object and plain object
  const entries = headers.entries ? headers.entries() : Object.entries(headers);
  
  for (const [key, value] of entries) {
    const lowerKey = key.toLowerCase();
    if (!blockedHeaders.has(lowerKey)) {
      headersObj[key] = value;
    }
  }
  
  return headersObj;
}

/**
 * Rewrites URLs in HTML to go through the proxy.
 * This handles relative URLs and makes them work through the proxy.
 * @param {string} html - The HTML content
 * @param {string} baseUrl - The base URL of the original page
 * @param {string} proxyBase - The proxy endpoint base URL
 * @param {string} [proxyServerOrigin] - The origin of the proxy server (for same-origin detection)
 * @returns {string} - HTML with rewritten URLs
 */
function rewriteUrls(html, baseUrl, proxyBase, proxyServerOrigin) {
  const base = new URL(baseUrl);
  const baseOrigin = base.origin;
  const basePath = base.pathname.replace(/[^/]*$/, '');
  
  let result = html;
  
  let shouldInjectBaseTag = true;
  if (proxyServerOrigin) {
    try {
      const proxyHost = new URL(proxyServerOrigin).hostname;
      const targetHost = new URL(baseOrigin).hostname;
      if (proxyHost === targetHost) {
        shouldInjectBaseTag = false;
      }
    } catch (e) {
      shouldInjectBaseTag = true;
    }
  }
  
  if (shouldInjectBaseTag) {
    const baseTag = `<base href="${baseOrigin}${basePath}">`;
    
    if (result.includes('<head>')) {
      result = result.replace('<head>', `<head>${baseTag}`);
    } else if (result.includes('<html>')) {
      result = result.replace('<html>', `<html><head>${baseTag}</head>`);
    } else {
      result = baseTag + result;
    }
  } else {
    const makeAbsoluteUrl = (url) => {
      try {
        if (url.startsWith('http://') || url.startsWith('https://')) {
          return url;
        } else if (url.startsWith('//')) {
          return base.protocol + url;
        } else if (url.startsWith('/')) {
          return baseOrigin + url;
        } else if (url.startsWith('data:') || url.startsWith('blob:')) {
          return url;
        } else {
          return baseOrigin + basePath + url;
        }
      } catch {
        return url;
      }
    };
    
    result = result.replace(
      /<script\s+([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*)>/gi,
      (match, before, src, after) => {
        const absoluteSrc = makeAbsoluteUrl(src);
        return `<script ${before}src="${absoluteSrc}"${after}>`;
      }
    );
    
    result = result.replace(
      /<link\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi,
      (match, before, href, after) => {
        const absoluteHref = makeAbsoluteUrl(href);
        return `<link ${before}href="${absoluteHref}"${after}>`;
      }
    );
    
    result = result.replace(
      /<img\s+([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*)>/gi,
      (match, before, src, after) => {
        const absoluteSrc = makeAbsoluteUrl(src);
        return `<img ${before}src="${absoluteSrc}"${after}>`;
      }
    );
    
    result = result.replace(
      /<source\s+([^>]*?)src\s*=\s*["']([^"']+)["']([^>]*)>/gi,
      (match, before, src, after) => {
        const absoluteSrc = makeAbsoluteUrl(src);
        return `<source ${before}src="${absoluteSrc}"${after}>`;
      }
    );
  }
  
  // Rewrite anchor href attributes to go through proxy
  // This allows in-page navigation to work through the proxy
  result = result.replace(
    /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    (match, before, href, after) => {
      // Skip javascript:, mailto:, tel:, and anchor links
      if (href.startsWith('javascript:') || 
          href.startsWith('mailto:') || 
          href.startsWith('tel:') ||
          href.startsWith('#')) {
        return match;
      }
      
      let absoluteUrl;
      try {
        if (href.startsWith('http://') || href.startsWith('https://')) {
          absoluteUrl = href;
        } else if (href.startsWith('//')) {
          absoluteUrl = base.protocol + href;
        } else if (href.startsWith('/')) {
          absoluteUrl = baseOrigin + href;
        } else {
          absoluteUrl = baseOrigin + basePath + href;
        }
        
        const proxiedHref = `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        return `<a ${before}href="${proxiedHref}" data-original-href="${escapeHtml(absoluteUrl)}"${after}>`;
      } catch {
        return match;
      }
    }
  );
  
  // Rewrite form actions to go through proxy
  result = result.replace(
    /<form\s+([^>]*?)action\s*=\s*["']([^"']+)["']([^>]*)>/gi,
    (match, before, action, after) => {
      if (action.startsWith('javascript:')) {
        return match;
      }
      
      let absoluteUrl;
      try {
        if (action.startsWith('http://') || action.startsWith('https://')) {
          absoluteUrl = action;
        } else if (action.startsWith('//')) {
          absoluteUrl = base.protocol + action;
        } else if (action.startsWith('/')) {
          absoluteUrl = baseOrigin + action;
        } else {
          absoluteUrl = baseOrigin + basePath + action;
        }
        
        const proxiedAction = `${proxyBase}?url=${encodeURIComponent(absoluteUrl)}`;
        return `<form ${before}action="${proxiedAction}" data-original-action="${escapeHtml(absoluteUrl)}"${after}>`;
      } catch {
        return match;
      }
    }
  );
  
  return result;
}

export {
  OPENCHAMBER_INJECT_SCRIPT,
  injectScript,
  stripSecurityHeaders,
  rewriteUrls,
  escapeHtml
};
