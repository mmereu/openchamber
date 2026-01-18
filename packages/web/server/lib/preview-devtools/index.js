/**
 * Preview DevTools Manager
 * 
 * Manages injection of developer tools into proxied preview pages.
 * Supports multiple tool layers:
 * - Element Picker (always enabled)
 * - Eruda (basic mode - default)
 * - Chobitsu (advanced mode - Chrome DevTools Protocol)
 * - React DevTools (auto-detection)
 */

import { getElementPickerScript } from './tools/element-picker.js';
import { getErudaScript } from './tools/eruda.js';
import { getChobitsuScript } from './tools/chobitsu.js';
import { getReactDevToolsScript } from './tools/react-devtools.js';
import { injectScripts, escapeHtml } from './utils/injection.js';

/**
 * @typedef {Object} DevToolsConfig
 * @property {'basic' | 'advanced'} mode - DevTools mode
 * @property {Object} tools - Enabled tools
 * @property {boolean} tools.elementPicker - Element picker (always true)
 * @property {boolean} tools.eruda - Eruda DevTools
 * @property {boolean} tools.chobitsu - Chobitsu (Chrome DevTools Protocol)
 * @property {'auto' | 'on' | 'off'} tools.reactDevTools - React DevTools
 * @property {Object} [auth] - Authentication configuration
 * @property {string} [auth.type] - Auth type ('header' | 'cookie')
 * @property {Record<string, string>} [auth.credentials] - Auth credentials
 */

/**
 * Default DevTools configuration
 * @type {DevToolsConfig}
 */
const DEFAULT_CONFIG = {
  mode: 'basic',
  tools: {
    elementPicker: true,
    eruda: true,
    chobitsu: false,
    reactDevTools: 'auto',
  },
};

/**
 * Preview DevTools Manager
 */
export class PreviewDevTools {
  /**
   * Inject DevTools into HTML content
   * @param {string} html - Original HTML content
   * @param {string} originalUrl - Original URL being proxied
   * @param {Partial<DevToolsConfig>} userConfig - User configuration
   * @returns {string} - HTML with injected DevTools
   */
  static inject(html, originalUrl, userConfig = {}) {
    const config = { ...DEFAULT_CONFIG, ...userConfig };
    
    // Validate mode
    if (config.mode === 'advanced') {
      config.tools.eruda = false;
      config.tools.chobitsu = true;
    }
    
    const scripts = [];
    
    // Layer 1: Always inject element picker
    if (config.tools.elementPicker) {
      scripts.push(getElementPickerScript());
    }
    
    // Layer 2: Inject Eruda in basic mode
    if (config.tools.eruda) {
      scripts.push(getErudaScript());
    }
    
    // Layer 3: Inject Chobitsu in advanced mode
    if (config.tools.chobitsu) {
      scripts.push(getChobitsuScript());
    }
    
    // Layer 4: React DevTools auto-detection
    if (config.tools.reactDevTools === 'auto' || config.tools.reactDevTools === 'on') {
      scripts.push(getReactDevToolsScript(config.tools.reactDevTools === 'on'));
    }
    
    return injectScripts(html, originalUrl, scripts);
  }
  
  /**
   * Parse DevTools config from query parameters
   * @param {Object} query - URL query parameters
   * @returns {Partial<DevToolsConfig>}
   */
  static parseConfig(query) {
    const config = {};
    
    if (query.devtools_mode === 'advanced') {
      config.mode = 'advanced';
    } else if (query.devtools_mode === 'basic') {
      config.mode = 'basic';
    }
    
    if (query.devtools_eruda === 'false') {
      config.tools = { ...config.tools, eruda: false };
    }
    
    if (query.devtools_chobitsu === 'true') {
      config.tools = { ...config.tools, chobitsu: true };
    }
    
    if (query.devtools_react === 'on' || query.devtools_react === 'off') {
      config.tools = { ...config.tools, reactDevTools: query.devtools_react };
    }
    
    return config;
  }
  
  /**
   * Get authentication headers from config
   * @param {DevToolsConfig} config - DevTools configuration
   * @returns {Record<string, string>} - Headers to include in fetch
   */
  static getAuthHeaders(config) {
    if (!config.auth || config.auth.type !== 'header') {
      return {};
    }
    
    return config.auth.credentials || {};
  }
}

export { escapeHtml };
