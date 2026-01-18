/**
 * Chobitsu Tool
 * 
 * Chrome DevTools Protocol implementation in JavaScript.
 * Used by CodeSandbox and StackBlitz for advanced debugging.
 * Enabled in "advanced" mode.
 */

import { wrapInScript, createIIFE } from '../utils/injection.js';

// Chobitsu CDN URL
const CHOBITSU_CDN = 'https://cdn.jsdelivr.net/npm/chobitsu@1.8.3/dist/chobitsu.min.js';
// Chii (Chrome DevTools frontend) CDN
const CHII_CDN = 'https://cdn.jsdelivr.net/npm/chii@1.8.3/public/front_end/chii_app.html';

/**
 * Get the Chobitsu injection script
 * @returns {string} - Script tag with Chobitsu initialization
 */
export function getChobitsuScript() {
  const initCode = `
    // Set up message bridge for Chrome DevTools Protocol
    chobitsu.setOnMessage(function(message) {
      window.parent.postMessage({
        type: 'OPENCHAMBER_CDP_MESSAGE',
        data: message
      }, '*');
    });

    // Listen for CDP messages from parent
    window.addEventListener('message', function(event) {
      var data = event.data;
      if (!data) return;

      if (data.type === 'OPENCHAMBER_CDP_SEND') {
        chobitsu.sendRawMessage(data.data);
      }
    });

    // Store reference
    window.__openchamberChobitsu = chobitsu;

    // Notify parent that Chobitsu is ready
    window.parent.postMessage({
      type: 'OPENCHAMBER_DEVTOOLS_READY',
      data: {
        tool: 'chobitsu',
        version: chobitsu.version || '1.8.3',
        protocol: 'CDP',
        features: ['DOM', 'CSS', 'Network', 'Console', 'Debugger', 'Runtime']
      }
    }, '*');

    console.log('[OpenChamber] Chobitsu CDP ready');
  `;

  const loaderCode = createIIFE(`
    // Skip if already loaded
    if (window.__openchamberChobitsuInjected) return;
    window.__openchamberChobitsuInjected = true;

    // Load Chobitsu from CDN
    var script = document.createElement('script');
    script.src = '${CHOBITSU_CDN}';
    script.crossOrigin = 'anonymous';
    
    script.onload = function() {
      try {
        ${initCode}
      } catch (e) {
        console.error('[OpenChamber] Failed to initialize Chobitsu:', e);
      }
    };

    script.onerror = function() {
      console.error('[OpenChamber] Failed to load Chobitsu from CDN');
      window.parent.postMessage({
        type: 'OPENCHAMBER_DEVTOOLS_ERROR',
        data: { tool: 'chobitsu', error: 'Failed to load from CDN' }
      }, '*');
    };

    document.head.appendChild(script);
  `);

  return wrapInScript(loaderCode, { id: 'openchamber-chobitsu' });
}

/**
 * Get the Chii DevTools frontend URL
 * @returns {string} - URL for the DevTools frontend
 */
export function getChiiUrl() {
  return CHII_CDN;
}

export default { getChobitsuScript, getChiiUrl };
