/**
 * React DevTools Tool
 * 
 * Auto-detects React and provides React-specific debugging.
 * Works alongside Eruda/Chobitsu for comprehensive debugging.
 */

import { wrapInScript, createIIFE } from '../utils/injection.js';

/**
 * Get the React DevTools detection and integration script
 * @param {boolean} forceEnable - Force enable even without detection
 * @returns {string} - Script tag with React DevTools integration
 */
export function getReactDevToolsScript(forceEnable = false) {
  const code = createIIFE(`
    // Skip if already loaded
    if (window.__openchamberReactDevToolsInjected) return;
    window.__openchamberReactDevToolsInjected = true;

    var forceEnable = ${forceEnable};

    // React detection function
    function detectReact() {
      // Check for React DevTools hook (set by React itself)
      if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
        return { detected: true, method: 'devtools-hook' };
      }

      // Check for React on window
      if (window.React) {
        return { detected: true, method: 'window.React' };
      }

      // Check for React root containers
      var rootSelectors = [
        '[data-reactroot]',
        '#root',
        '#app',
        '#__next',
        '[id^="__gatsby"]'
      ];

      for (var i = 0; i < rootSelectors.length; i++) {
        var el = document.querySelector(rootSelectors[i]);
        if (el && (el._reactRootContainer || el.__reactContainer$)) {
          return { detected: true, method: 'root-container', selector: rootSelectors[i] };
        }
      }

      // Check DOM for React fiber
      var allElements = document.querySelectorAll('*');
      for (var j = 0; j < Math.min(allElements.length, 100); j++) {
        var keys = Object.keys(allElements[j]);
        for (var k = 0; k < keys.length; k++) {
          if (keys[k].startsWith('__reactFiber') || keys[k].startsWith('__reactProps')) {
            return { detected: true, method: 'fiber-props' };
          }
        }
      }

      return { detected: false };
    }

    // Run detection after DOM is ready
    function init() {
      var result = detectReact();

      if (result.detected || forceEnable) {
        // Notify parent about React detection
        window.parent.postMessage({
          type: 'OPENCHAMBER_REACT_DETECTED',
          data: {
            detected: result.detected,
            method: result.method || (forceEnable ? 'forced' : 'unknown'),
            selector: result.selector
          }
        }, '*');

        // Set up React DevTools global hook if not present
        if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
          window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
            renderers: new Map(),
            supportsFiber: true,
            inject: function(renderer) {
              var id = this.renderers.size + 1;
              this.renderers.set(id, renderer);
              return id;
            },
            onCommitFiberRoot: function() {},
            onCommitFiberUnmount: function() {},
            isDisabled: false,
            checkDCE: function() {}
          };
        }

        console.log('[OpenChamber] React detected via ' + (result.method || 'forced'));
      } else {
        console.log('[OpenChamber] React not detected');
      }

      // Notify parent about DevTools status
      window.parent.postMessage({
        type: 'OPENCHAMBER_DEVTOOLS_READY',
        data: {
          tool: 'react-devtools',
          detected: result.detected,
          forced: forceEnable
        }
      }, '*');
    }

    // Run on DOMContentLoaded or immediately if already loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      // Small delay to let React initialize
      setTimeout(init, 100);
    }
  `);

  return wrapInScript(code, { id: 'openchamber-react-devtools' });
}

export default { getReactDevToolsScript };
