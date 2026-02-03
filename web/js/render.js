/**
 * Markdown Rendering Module
 * 
 * Handles fetching, parsing, and rendering markdown content with YAML frontmatter.
 * Uses marked.js for markdown parsing.
 */

// Configure marked with sensible defaults
const markedOptions = {
  gfm: true,
  breaks: false,
  pedantic: false,
};

/**
 * Parse YAML frontmatter from markdown content
 * @param {string} content - Raw markdown content with optional frontmatter
 * @returns {{ frontmatter: Object, content: string }}
 */
export function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);
  
  if (!match) {
    return { frontmatter: {}, content };
  }
  
  const yamlContent = match[1];
  const markdownContent = content.slice(match[0].length);
  
  // Simple YAML parser for frontmatter (handles key: value pairs)
  const frontmatter = {};
  const lines = yamlContent.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;
    
    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();
    
    // Handle quoted strings
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    // Parse numbers
    if (/^-?\d+$/.test(value)) {
      value = parseInt(value, 10);
    } else if (/^-?\d+\.\d+$/.test(value)) {
      value = parseFloat(value);
    }
    
    // Parse booleans
    if (value === 'true') value = true;
    if (value === 'false') value = false;
    
    frontmatter[key] = value;
  }
  
  return { frontmatter, content: markdownContent };
}

/**
 * Tokenize code for syntax highlighting
 * Simple tokenizer for common programming constructs
 * @param {string} code - Code string to tokenize
 * @param {string} language - Programming language
 * @returns {string} - HTML with span-wrapped tokens
 */
function tokenizeCode(code, language) {
  // Language-specific keywords
  const keywords = {
    js: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'static', 'get', 'set', 'null', 'undefined', 'true', 'false'],
    ts: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'static', 'get', 'set', 'null', 'undefined', 'true', 'false', 'type', 'interface', 'enum', 'namespace', 'module', 'declare', 'implements', 'abstract', 'readonly', 'private', 'protected', 'public', 'as', 'is', 'keyof', 'infer', 'never', 'unknown', 'any', 'void', 'string', 'number', 'boolean', 'object', 'symbol', 'bigint'],
    typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'static', 'get', 'set', 'null', 'undefined', 'true', 'false', 'type', 'interface', 'enum', 'namespace', 'module', 'declare', 'implements', 'abstract', 'readonly', 'private', 'protected', 'public', 'as', 'is', 'keyof', 'infer', 'never', 'unknown', 'any', 'void', 'string', 'number', 'boolean', 'object', 'symbol', 'bigint'],
    javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'new', 'class', 'extends', 'import', 'export', 'from', 'default', 'async', 'await', 'yield', 'typeof', 'instanceof', 'in', 'of', 'this', 'super', 'static', 'get', 'set', 'null', 'undefined', 'true', 'false'],
    bash: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'export', 'local', 'readonly', 'unset', 'shift', 'break', 'continue', 'true', 'false', 'in'],
    sh: ['if', 'then', 'else', 'elif', 'fi', 'for', 'while', 'do', 'done', 'case', 'esac', 'function', 'return', 'exit', 'export', 'local', 'readonly', 'unset', 'shift', 'break', 'continue', 'true', 'false', 'in'],
    sql: ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'AS', 'ORDER', 'BY', 'ASC', 'DESC', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'DISTINCT', 'NULL', 'IS', 'LIKE', 'IN', 'BETWEEN', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'DEFAULT', 'CHECK', 'CONSTRAINT', 'CASCADE', 'INTEGER', 'TEXT', 'REAL', 'BLOB', 'BOOLEAN', 'VARCHAR', 'select', 'from', 'where', 'and', 'or', 'not', 'insert', 'into', 'values', 'update', 'set', 'delete', 'create', 'table', 'drop', 'alter', 'index', 'join', 'left', 'right', 'inner', 'outer', 'on', 'as', 'order', 'by', 'asc', 'desc', 'group', 'having', 'limit', 'offset', 'union', 'all', 'distinct', 'null', 'is', 'like', 'in', 'between', 'exists', 'case', 'when', 'then', 'else', 'end', 'primary', 'key', 'foreign', 'references', 'unique', 'default', 'check', 'constraint', 'cascade', 'integer', 'text', 'real', 'blob', 'boolean', 'varchar'],
    json: ['true', 'false', 'null'],
    yaml: ['true', 'false', 'null', 'yes', 'no'],
    markdown: [],
    md: [],
    html: [],
    css: ['@import', '@media', '@keyframes', '@font-face', '@supports', '@page', '!important'],
  };
  
  const langKeywords = keywords[language] || keywords.js || [];
  
  // Escape HTML entities first
  let escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  // Replace strings and comments with placeholders to prevent keyword matching inside them
  const placeholders = [];
  let placeholderIndex = 0;
  
  escaped = escaped.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|--[^\n]*)/g, (match) => {
    const placeholder = `__PLACEHOLDER_${placeholderIndex}__`;
    let tokenClass = 'token-string';
    if (match.startsWith('//') || match.startsWith('/*') || match.startsWith('#') || match.startsWith('--')) {
      tokenClass = 'token-comment';
    }
    placeholders.push({ placeholder, replacement: `<span class="${tokenClass}">${match}</span>` });
    placeholderIndex++;
    return placeholder;
  });
  
  // Apply number highlighting
  escaped = escaped.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b/gi, '<span class="token-number">$1</span>');
  escaped = escaped.replace(/\b(0x[0-9a-f]+)\b/gi, '<span class="token-number">$1</span>');
  
  // Apply keyword highlighting
  for (const keyword of langKeywords) {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
    escaped = escaped.replace(regex, '<span class="token-keyword">$1</span>');
  }
  
  // Restore placeholders
  for (const { placeholder, replacement } of placeholders) {
    escaped = escaped.replace(placeholder, replacement);
  }
  
  return escaped;
}

/**
 * Custom renderer for marked.js with syntax highlighting
 * Handles both new marked.js format (token objects) and legacy format (strings)
 * @returns {Object} - Marked renderer extension
 */
function createRenderer() {
  return {
    code(codeOrToken, language) {
      // Handle both new marked.js format (token object) and legacy format (string)
      let code, lang;
      if (typeof codeOrToken === 'object' && codeOrToken !== null && 'text' in codeOrToken) {
        // New format: code({ text, lang, escaped })
        code = codeOrToken.text;
        lang = codeOrToken.lang || '';
      } else {
        // Legacy format: code(code, language)
        code = codeOrToken;
        lang = language || '';
      }
      
      // Ensure code is a string
      const codeStr = String(code || '');
      const highlighted = tokenizeCode(codeStr, lang);
      const langLabel = lang ? `<span class="code-language">${lang}</span>` : '';
      return `<pre class="code-block" data-language="${lang}">${langLabel}<code class="language-${lang}">${highlighted}</code></pre>`;
    },
    
    // Add IDs to headings for anchor links
    heading(textOrToken, level) {
      // Handle both new marked.js format (token object) and legacy format (string)
      let text, headingLevel;
      if (typeof textOrToken === 'object' && textOrToken !== null && 'text' in textOrToken) {
        // New format: heading({ text, depth, ... })
        text = textOrToken.text;
        headingLevel = textOrToken.depth;
      } else {
        // Legacy format: heading(text, level)
        text = textOrToken;
        headingLevel = level;
      }
      
      // Ensure text is a string before calling string methods
      const textStr = String(text || '');
      
      const slug = textStr
        .toLowerCase()
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[^\w\s-]/g, '') // Remove special chars
        .replace(/\s+/g, '-') // Replace spaces with dashes
        .replace(/-+/g, '-') // Remove duplicate dashes
        .trim();
      
      return `<h${headingLevel} id="${slug}"><a href="#${slug}" class="heading-anchor">#</a>${textStr}</h${headingLevel}>`;
    },
    
    // External links open in new tab
    link(hrefOrToken, title, text) {
      // Handle both new marked.js format (token object) and legacy format
      let href, linkTitle, linkText;
      if (typeof hrefOrToken === 'object' && hrefOrToken !== null && 'href' in hrefOrToken) {
        // New format: link({ href, title, text, tokens })
        href = hrefOrToken.href;
        linkTitle = hrefOrToken.title;
        linkText = hrefOrToken.text;
      } else {
        // Legacy format: link(href, title, text)
        href = hrefOrToken;
        linkTitle = title;
        linkText = text;
      }
      
      const isExternal = href && (href.startsWith('http://') || href.startsWith('https://'));
      const titleAttr = linkTitle ? ` title="${linkTitle}"` : '';
      const externalAttrs = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${href}"${titleAttr}${externalAttrs}>${linkText}</a>`;
    },
    
    // Add copy button to inline code
    codespan(codeOrToken) {
      // Handle both new marked.js format (token object) and legacy format (string)
      let code;
      if (typeof codeOrToken === 'object' && codeOrToken !== null && 'text' in codeOrToken) {
        // New format: codespan({ text })
        code = codeOrToken.text;
      } else {
        // Legacy format: codespan(code)
        code = codeOrToken;
      }
      return `<code class="inline-code">${code}</code>`;
    },
  };
}

/**
 * Initialize marked.js with custom configuration
 * Must be called after marked.js is loaded
 */
export function initMarked() {
  if (typeof marked === 'undefined') {
    throw new Error('marked.js is not loaded');
  }
  
  marked.setOptions(markedOptions);
  marked.use({ renderer: createRenderer() });
}

/**
 * Render markdown content to HTML
 * @param {string} markdown - Raw markdown string
 * @returns {string} - Rendered HTML
 */
export function renderMarkdown(markdown) {
  if (typeof marked === 'undefined') {
    throw new Error('marked.js is not loaded');
  }
  
  return marked.parse(markdown);
}

/**
 * Fetch and render a markdown file
 * @param {string} url - URL to the markdown file
 * @returns {Promise<{ frontmatter: Object, html: string, raw: string }>}
 */
export async function fetchAndRender(url) {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    
    const raw = await response.text();
    const { frontmatter, content } = parseFrontmatter(raw);
    const html = renderMarkdown(content);
    
    return { frontmatter, html, raw };
  } catch (error) {
    console.error('Error fetching markdown:', error);
    throw error;
  }
}

/**
 * Load markdown content into a DOM element
 * @param {string} url - URL to the markdown file
 * @param {HTMLElement|string} target - Target element or selector
 * @param {Object} options - Rendering options
 * @returns {Promise<{ frontmatter: Object }>}
 */
export async function loadMarkdownInto(url, target, options = {}) {
  const element = typeof target === 'string' 
    ? document.querySelector(target) 
    : target;
  
  if (!element) {
    throw new Error(`Target element not found: ${target}`);
  }
  
  const { showError = true, loadingText = 'Loading...' } = options;
  
  // Show loading state
  element.innerHTML = `<div class="loading">${loadingText}</div>`;
  
  try {
    const { frontmatter, html } = await fetchAndRender(url);
    
    // Update page title if frontmatter has title
    if (frontmatter.title && options.updateTitle !== false) {
      document.title = frontmatter.title;
    }
    
    // Update meta description if available
    if (frontmatter.description && options.updateMeta !== false) {
      let metaDesc = document.querySelector('meta[name="description"]');
      if (!metaDesc) {
        metaDesc = document.createElement('meta');
        metaDesc.name = 'description';
        document.head.appendChild(metaDesc);
      }
      metaDesc.content = frontmatter.description;
    }
    
    element.innerHTML = html;
    
    // Dispatch event for other scripts to hook into
    element.dispatchEvent(new CustomEvent('markdown-loaded', {
      bubbles: true,
      detail: { frontmatter, url }
    }));
    
    return { frontmatter };
  } catch (error) {
    if (showError) {
      element.innerHTML = `
        <div class="error-message">
          <h2>Failed to Load Content</h2>
          <p>Unable to load the requested content. Please try again later.</p>
          <details>
            <summary>Technical Details</summary>
            <pre>${error.message}</pre>
          </details>
        </div>
      `;
    }
    throw error;
  }
}

/**
 * Get table of contents from rendered HTML
 * @param {HTMLElement|string} container - Container with rendered markdown
 * @returns {Array<{ level: number, text: string, id: string }>}
 */
export function extractTableOfContents(container) {
  const element = typeof container === 'string'
    ? document.querySelector(container)
    : container;
  
  if (!element) return [];
  
  const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');
  const toc = [];
  
  for (const heading of headings) {
    toc.push({
      level: parseInt(heading.tagName.charAt(1), 10),
      text: heading.textContent.replace(/^#\s*/, ''), // Remove anchor symbol
      id: heading.id,
    });
  }
  
  return toc;
}

/**
 * Render table of contents as HTML
 * @param {Array} toc - Table of contents array
 * @param {Object} options - Rendering options
 * @returns {string} - HTML string
 */
export function renderTableOfContents(toc, options = {}) {
  const { minLevel = 2, maxLevel = 4, ordered = false } = options;
  
  const filtered = toc.filter(item => item.level >= minLevel && item.level <= maxLevel);
  
  if (filtered.length === 0) return '';
  
  const listTag = ordered ? 'ol' : 'ul';
  let html = `<nav class="table-of-contents"><${listTag}>`;
  
  for (const item of filtered) {
    const indent = item.level - minLevel;
    html += `<li class="toc-level-${item.level}" style="margin-left: ${indent * 1}rem">`;
    html += `<a href="#${item.id}">${item.text}</a>`;
    html += '</li>';
  }
  
  html += `</${listTag}></nav>`;
  return html;
}

// Export for use as ES module
export default {
  parseFrontmatter,
  initMarked,
  renderMarkdown,
  fetchAndRender,
  loadMarkdownInto,
  extractTableOfContents,
  renderTableOfContents,
};
