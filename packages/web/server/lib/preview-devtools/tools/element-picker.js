/**
 * Element Picker Tool
 * 
 * Enables visual element selection in the preview iframe.
 * Always enabled as the foundation layer of DevTools.
 */

import { wrapInScript, createIIFE } from '../utils/injection.js';

/**
 * Get the element picker injection script
 * @returns {string} - Script tag with element picker code
 */
export function getElementPickerScript() {
  const code = createIIFE(ELEMENT_PICKER_CODE);
  return wrapInScript(code, { id: 'openchamber-element-picker' });
}

/**
 * Element picker implementation
 * Handles element selection, highlighting, and data capture
 */
const ELEMENT_PICKER_CODE = `
  // Prevent double initialization
  if (window.__openchamberElementPickerInjected) return;
  window.__openchamberElementPickerInjected = true;

  // Get original URL from meta tag
  var originalUrlMeta = document.querySelector('meta[name="openchamber-original-url"]');
  var originalUrl = originalUrlMeta ? originalUrlMeta.getAttribute('content') : window.location.href;

  // State
  var isPickerActive = false;
  var overlayElement = null;
  var lastHoveredElement = null;

  // Console interception
  var originalConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  function formatConsoleArg(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }

  function forwardConsole(level, args) {
    var message = Array.prototype.slice.call(args).map(formatConsoleArg).join(' ');
    window.parent.postMessage({
      type: 'OPENCHAMBER_CONSOLE',
      data: { level: level, message: message }
    }, '*');
  }

  console.log = function() {
    originalConsole.log.apply(console, arguments);
    forwardConsole('log', arguments);
  };

  console.info = function() {
    originalConsole.info.apply(console, arguments);
    forwardConsole('info', arguments);
  };

  console.warn = function() {
    originalConsole.warn.apply(console, arguments);
    forwardConsole('warn', arguments);
  };

  console.error = function() {
    originalConsole.error.apply(console, arguments);
    forwardConsole('error', arguments);
  };

  console.debug = function() {
    originalConsole.debug.apply(console, arguments);
    forwardConsole('debug', arguments);
  };

  // Error capturing
  window.addEventListener('error', function(event) {
    forwardConsole('error', [event.message + ' at ' + event.filename + ':' + event.lineno]);
  });

  window.addEventListener('unhandledrejection', function(event) {
    var reason = event.reason;
    var message = reason ? (reason.message || reason.toString()) : 'Unknown rejection';
    forwardConsole('error', ['Unhandled Promise Rejection: ' + message]);
  });

  // Create highlight overlay
  function createOverlay() {
    if (overlayElement) return overlayElement;
    
    overlayElement = document.createElement('div');
    overlayElement.id = '__openchamber_overlay';
    overlayElement.style.cssText = [
      'position: fixed',
      'pointer-events: none',
      'z-index: 2147483647',
      'border: 2px solid #3b82f6',
      'background-color: rgba(59, 130, 246, 0.1)',
      'transition: all 0.05s ease-out',
      'display: none',
    ].join(';');
    document.body.appendChild(overlayElement);
    return overlayElement;
  }

  // Generate unique CSS selector
  function generateSelector(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return el && el.tagName ? el.tagName.toLowerCase() : 'html';
    }
    
    if (el.id) {
      return '#' + CSS.escape(el.id);
    }
    
    var path = [];
    var current = el;
    
    while (current && current !== document.body && current !== document.documentElement) {
      var selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector = '#' + CSS.escape(current.id);
        path.unshift(selector);
        break;
      }
      
      // Add class names (first 2)
      var classes = Array.from(current.classList || [])
        .filter(function(c) { return c && !c.startsWith('__'); })
        .slice(0, 2);
      if (classes.length > 0) {
        selector += '.' + classes.map(function(c) { return CSS.escape(c); }).join('.');
      }
      
      // Add nth-of-type if needed
      var siblings = current.parentElement ? current.parentElement.children : [];
      var sameTagSiblings = Array.from(siblings).filter(function(s) {
        return s.tagName === current.tagName;
      });
      if (sameTagSiblings.length > 1) {
        var index = sameTagSiblings.indexOf(current) + 1;
        selector += ':nth-of-type(' + index + ')';
      }
      
      path.unshift(selector);
      current = current.parentElement;
    }
    
    return path.join(' > ');
  }

  // Generate XPath
  function generateXPath(el) {
    if (!el) return '';
    if (el === document.body) return '/html/body';
    if (el === document.documentElement) return '/html';
    
    var parts = [];
    var current = el;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      var index = 1;
      var sibling = current.previousSibling;
      
      while (sibling) {
        if (sibling.nodeType === Node.ELEMENT_NODE && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }
      
      var tagName = current.tagName.toLowerCase();
      parts.unshift(tagName + '[' + index + ']');
      current = current.parentElement;
    }
    
    return '/' + parts.join('/');
  }

  // Get computed styles subset
  function getComputedStylesSubset(el) {
    var computed = window.getComputedStyle(el);
    var importantProps = [
      'display', 'position', 'width', 'height', 'margin', 'padding',
      'color', 'backgroundColor', 'fontSize', 'fontFamily', 'fontWeight',
      'border', 'borderRadius', 'opacity', 'visibility', 'overflow',
      'flexDirection', 'justifyContent', 'alignItems', 'gap'
    ];
    
    var styles = {};
    importantProps.forEach(function(prop) {
      var cssName = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
      var value = computed.getPropertyValue(cssName);
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
        styles[prop] = value;
      }
    });
    return styles;
  }

  // Capture element data
  function captureElementData(el) {
    var rect = el.getBoundingClientRect();
    var attributes = {};
    var dataAttributes = {};
    
    Array.from(el.attributes || []).forEach(function(attr) {
      if (attr.name.startsWith('data-')) {
        dataAttributes[attr.name] = attr.value;
      } else {
        attributes[attr.name] = attr.value;
      }
    });
    
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
        childCount: el.children ? el.children.length : 0,
        siblingCount: el.parentElement && el.parentElement.children ? el.parentElement.children.length : 0
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

  // Update overlay position
  function updateOverlayPosition(el) {
    if (!overlayElement || !el) return;
    
    var rect = el.getBoundingClientRect();
    overlayElement.style.top = rect.top + 'px';
    overlayElement.style.left = rect.left + 'px';
    overlayElement.style.width = rect.width + 'px';
    overlayElement.style.height = rect.height + 'px';
    overlayElement.style.display = 'block';
  }

  // Event handlers
  function handleMouseMove(e) {
    if (!isPickerActive) return;
    
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlayElement || el === document.body || el === document.documentElement) {
      return;
    }
    
    if (el !== lastHoveredElement) {
      lastHoveredElement = el;
      updateOverlayPosition(el);
    }
  }

  function handleClick(e) {
    if (!isPickerActive) return;
    
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === overlayElement) {
      return;
    }
    
    var elementData = captureElementData(el);
    
    window.parent.postMessage({
      type: 'OPENCHAMBER_ELEMENT_SELECTED',
      data: elementData
    }, '*');
    
    disablePicker();
  }

  function handleKeyDown(e) {
    if (!isPickerActive) return;
    
    if (e.key === 'Escape') {
      e.preventDefault();
      window.parent.postMessage({ type: 'OPENCHAMBER_PICKER_CANCELLED' }, '*');
      disablePicker();
    }
  }

  // Enable/disable picker
  function enablePicker() {
    if (isPickerActive) return;
    
    isPickerActive = true;
    createOverlay();
    
    document.addEventListener('mousemove', handleMouseMove, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('keydown', handleKeyDown, true);
    
    document.body.style.cursor = 'crosshair';
  }

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
    
    document.body.style.cursor = '';
  }

  // Message listener
  window.addEventListener('message', function(event) {
    var type = event.data && event.data.type;
    
    switch (type) {
      case 'OPENCHAMBER_PICKER_ENABLE':
        enablePicker();
        break;
      case 'OPENCHAMBER_PICKER_DISABLE':
        disablePicker();
        break;
    }
  });

  // Notify parent that script is ready
  window.parent.postMessage({
    type: 'OPENCHAMBER_SCRIPT_READY',
    data: {
      originalUrl: originalUrl,
      url: window.location.href,
      title: document.title,
      tools: ['elementPicker']
    }
  }, '*');

  console.log('[OpenChamber] Element Picker ready: ' + originalUrl);
`;

export default { getElementPickerScript };
