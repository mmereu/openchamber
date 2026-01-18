/**
 * Injection Utilities
 * 
 * Helper functions for injecting scripts and metadata into HTML content.
 */

/**
 * Escape HTML special characters
 * @param {string} str - String to escape
 * @returns {string} - Escaped string
 */
export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Wrap code in a script tag
 * @param {string} code - JavaScript code
 * @param {Object} [options] - Options
 * @param {string} [options.id] - Script ID
 * @param {boolean} [options.async] - Async loading
 * @returns {string} - Script tag
 */
export function wrapInScript(code, options = {}) {
  const attrs = [];
  if (options.id) attrs.push(`id="${escapeHtml(options.id)}"`);
  if (options.async) attrs.push('async');
  
  const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
  return `<script${attrStr}>${code}</script>`;
}

/**
 * Create a script tag that loads from URL
 * @param {string} src - Script URL
 * @param {Object} [options] - Options
 * @param {string} [options.id] - Script ID
 * @param {boolean} [options.async] - Async loading
 * @param {string} [options.crossOrigin] - Cross-origin setting
 * @param {string} [options.onload] - Onload handler code
 * @param {string} [options.onerror] - Onerror handler code
 * @returns {string} - Script tag
 */
export function createScriptTag(src, options = {}) {
  const attrs = [`src="${escapeHtml(src)}"`];
  if (options.id) attrs.push(`id="${escapeHtml(options.id)}"`);
  if (options.async) attrs.push('async');
  if (options.crossOrigin) attrs.push(`crossorigin="${escapeHtml(options.crossOrigin)}"`);
  if (options.onload) attrs.push(`onload="${escapeHtml(options.onload)}"`);
  if (options.onerror) attrs.push(`onerror="${escapeHtml(options.onerror)}"`);
  
  return `<script ${attrs.join(' ')}></script>`;
}

/**
 * Inject scripts into HTML content
 * @param {string} html - Original HTML
 * @param {string} originalUrl - Original URL being proxied
 * @param {string[]} scripts - Array of script tags to inject
 * @returns {string} - Modified HTML
 */
export function injectScripts(html, originalUrl, scripts) {
  let result = html;
  
  // Create metadata tags
  const metaTags = [
    `<meta name="openchamber-original-url" content="${escapeHtml(originalUrl)}">`,
    `<meta name="openchamber-injected" content="true">`,
  ].join('\n');
  
  // Inject metadata in <head>
  if (result.includes('<head>')) {
    result = result.replace('<head>', `<head>\n${metaTags}`);
  } else if (result.includes('<html>')) {
    result = result.replace('<html>', `<html>\n<head>${metaTags}</head>`);
  } else if (result.toLowerCase().includes('<!doctype')) {
    // Insert after doctype
    result = result.replace(/(<!doctype[^>]*>)/i, `$1\n<head>${metaTags}</head>`);
  } else {
    result = `<head>${metaTags}</head>\n` + result;
  }
  
  // Inject scripts before </body>
  const scriptTags = scripts.join('\n');
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${scriptTags}\n</body>`);
  } else if (result.includes('</html>')) {
    result = result.replace('</html>', `${scriptTags}\n</html>`);
  } else {
    result = result + '\n' + scriptTags;
  }
  
  return result;
}

/**
 * Create an IIFE (Immediately Invoked Function Expression)
 * @param {string} code - Code to wrap
 * @returns {string} - IIFE wrapped code
 */
export function createIIFE(code) {
  return `(function() {\n${code}\n})();`;
}

/**
 * Create a deferred script loader
 * @param {string} src - Script URL
 * @param {string} onloadCode - Code to run after load
 * @returns {string} - Loader script
 */
export function createDeferredLoader(src, onloadCode) {
  return createIIFE(`
    var script = document.createElement('script');
    script.src = '${escapeHtml(src)}';
    script.crossOrigin = 'anonymous';
    script.onload = function() {
      ${onloadCode}
    };
    script.onerror = function() {
      console.error('[OpenChamber] Failed to load: ${escapeHtml(src)}');
    };
    document.head.appendChild(script);
  `);
}
