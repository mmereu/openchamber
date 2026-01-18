/**
 * Eruda Tool
 * 
 * Mobile-friendly DevTools console (used by Replit).
 * Provides Console, Elements, Network, Resources, Sources panels.
 * Default tool in "basic" mode.
 */

import { wrapInScript, createIIFE } from '../utils/injection.js';

// Eruda CDN URL (v3.0.1 - stable)
const ERUDA_CDN = 'https://cdn.jsdelivr.net/npm/eruda@3.0.1/eruda.min.js';

/**
 * Get the Eruda injection script
 * @returns {string} - Script tag with Eruda initialization
 */
export function getErudaScript() {
  const initCode = `
    // Configure Eruda
    var erudaConfig = {
      container: document.body,
      tool: ['console', 'elements', 'network', 'resources', 'sources', 'info'],
      useShadowDom: true,
      autoScale: true,
      defaults: {
        displaySize: 50,
        transparency: 0.95,
        theme: 'Auto'
      }
    };

    // Initialize Eruda
    eruda.init(erudaConfig);

    // Hide initially - let user toggle via toolbar
    eruda.hide();

    // Store reference for external control
    window.__openchamberEruda = eruda;

    // Listen for parent commands
    window.addEventListener('message', function(event) {
      var data = event.data;
      if (!data || !data.type) return;

      switch (data.type) {
        case 'OPENCHAMBER_DEVTOOLS_SHOW':
          eruda.show();
          break;
        case 'OPENCHAMBER_DEVTOOLS_HIDE':
          eruda.hide();
          break;
        case 'OPENCHAMBER_DEVTOOLS_TOGGLE':
          if (eruda._isShow) {
            eruda.hide();
          } else {
            eruda.show();
          }
          break;
        case 'OPENCHAMBER_DEVTOOLS_TOOL':
          if (data.data && data.data.tool) {
            eruda.show(data.data.tool);
          }
          break;
      }
    });

    // Notify parent that Eruda is ready
    window.parent.postMessage({
      type: 'OPENCHAMBER_DEVTOOLS_READY',
      data: {
        tool: 'eruda',
        version: eruda.version || '3.0.1',
        panels: ['console', 'elements', 'network', 'resources', 'sources', 'info']
      }
    }, '*');

    console.log('[OpenChamber] Eruda DevTools ready');
  `;

  const loaderCode = createIIFE(`
    // Skip if already loaded
    if (window.__openchamberErudaInjected) return;
    window.__openchamberErudaInjected = true;

    // Load Eruda from CDN
    var script = document.createElement('script');
    script.src = '${ERUDA_CDN}';
    script.crossOrigin = 'anonymous';
    
    script.onload = function() {
      try {
        ${initCode}
      } catch (e) {
        console.error('[OpenChamber] Failed to initialize Eruda:', e);
      }
    };

    script.onerror = function() {
      console.error('[OpenChamber] Failed to load Eruda from CDN');
      window.parent.postMessage({
        type: 'OPENCHAMBER_DEVTOOLS_ERROR',
        data: { tool: 'eruda', error: 'Failed to load from CDN' }
      }, '*');
    };

    document.head.appendChild(script);
  `);

  return wrapInScript(loaderCode, { id: 'openchamber-eruda' });
}

export default { getErudaScript };
