/**
 * Main Site Interactivity Module
 * 
 * Handles theme toggling, mobile navigation, and active link highlighting.
 */

/**
 * Theme Management
 * Supports light, dark, and system preference modes
 */
const Theme = {
  STORAGE_KEY: 'kotadb-theme',
  
  /**
   * Get the current theme setting
   * @returns {'light'|'dark'|'system'}
   */
  getSaved() {
    return localStorage.getItem(this.STORAGE_KEY) || 'system';
  },
  
  /**
   * Get the effective theme (resolves 'system' to actual value)
   * @returns {'light'|'dark'}
   */
  getEffective() {
    const saved = this.getSaved();
    if (saved === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return saved;
  },
  
  /**
   * Apply theme to document
   * @param {'light'|'dark'} theme
   */
  apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    
    // Update theme-color meta tag for browser chrome
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.content = theme === 'dark' ? '#1a1a2e' : '#ffffff';
    }
  },
  
  /**
   * Save and apply theme
   * @param {'light'|'dark'|'system'} theme
   */
  set(theme) {
    localStorage.setItem(this.STORAGE_KEY, theme);
    this.apply(this.getEffective());
    this.updateToggleButton();
  },
  
  /**
   * Toggle between light and dark (skips system)
   */
  toggle() {
    const current = this.getEffective();
    this.set(current === 'dark' ? 'light' : 'dark');
  },
  
  /**
   * Cycle through light -> dark -> system
   */
  cycle() {
    const saved = this.getSaved();
    const next = saved === 'light' ? 'dark' : saved === 'dark' ? 'system' : 'light';
    this.set(next);
  },
  
  /**
   * Update toggle button icon/text
   */
  updateToggleButton() {
    const button = document.querySelector('[data-theme-toggle]');
    if (!button) return;
    
    const saved = this.getSaved();
    
    // Update icon
    const icons = {
      light: '\u2600\ufe0f',
      dark: '\ud83c\udf19',
      system: '\ud83d\udcbb',
    };
    
    const labels = {
      light: 'Light mode',
      dark: 'Dark mode', 
      system: 'System preference',
    };
    
    button.innerHTML = icons[saved] || icons.system;
    button.setAttribute('aria-label', `Current: ${labels[saved]}. Click to change theme.`);
    button.setAttribute('title', labels[saved]);
  },
  
  /**
   * Initialize theme system
   */
  init() {
    // Apply saved theme immediately
    this.apply(this.getEffective());
    
    // Listen for system preference changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.getSaved() === 'system') {
        this.apply(this.getEffective());
      }
    });
    
    // Set up toggle button
    const button = document.querySelector('[data-theme-toggle]');
    if (button) {
      button.addEventListener('click', () => this.cycle());
      this.updateToggleButton();
    }
  },
};

/**
 * Mobile Navigation
 */
const MobileNav = {
  /**
   * Toggle mobile nav visibility
   */
  toggle() {
    const nav = document.querySelector('[data-mobile-nav]');
    const toggle = document.querySelector('[data-mobile-nav-toggle]');
    
    if (!nav) return;
    
    const isOpen = nav.classList.toggle('is-open');
    
    if (toggle) {
      toggle.setAttribute('aria-expanded', isOpen);
      toggle.innerHTML = isOpen ? '\u2715' : '\u2630';
    }
    
    // Prevent body scroll when nav is open
    document.body.classList.toggle('nav-open', isOpen);
  },
  
  /**
   * Close mobile nav
   */
  close() {
    const nav = document.querySelector('[data-mobile-nav]');
    const toggle = document.querySelector('[data-mobile-nav-toggle]');
    
    if (!nav) return;
    
    nav.classList.remove('is-open');
    document.body.classList.remove('nav-open');
    
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.innerHTML = '\u2630';
    }
  },
  
  /**
   * Initialize mobile navigation
   */
  init() {
    const toggle = document.querySelector('[data-mobile-nav-toggle]');
    if (toggle) {
      toggle.addEventListener('click', () => this.toggle());
    }
    
    // Close nav when clicking outside
    document.addEventListener('click', (e) => {
      const nav = document.querySelector('[data-mobile-nav]');
      const toggle = document.querySelector('[data-mobile-nav-toggle]');
      
      if (nav && nav.classList.contains('is-open')) {
        if (!nav.contains(e.target) && e.target !== toggle) {
          this.close();
        }
      }
    });
    
    // Close nav on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    });
    
    // Close nav when window resizes to desktop
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 768) {
        this.close();
      }
    });
  },
};

/**
 * Active Navigation Link Highlighting
 */
const ActiveNav = {
  /**
   * Get current page path
   * @returns {string}
   */
  getCurrentPath() {
    return window.location.pathname;
  },
  
  /**
   * Check if a link matches the current page
   * @param {HTMLAnchorElement} link
   * @returns {boolean}
   */
  isActive(link) {
    const href = link.getAttribute('href');
    if (!href) return false;
    
    const currentPath = this.getCurrentPath();
    
    // Exact match
    if (href === currentPath) return true;
    
    // Handle trailing slashes
    const normalizedHref = href.replace(/\/$/, '');
    const normalizedPath = currentPath.replace(/\/$/, '');
    if (normalizedHref === normalizedPath) return true;
    
    // Handle index.html
    if (currentPath.endsWith('/index.html')) {
      const dirPath = currentPath.replace(/index\.html$/, '').replace(/\/$/, '');
      if (normalizedHref === dirPath) return true;
    }
    
    // Section match (e.g., /docs/getting-started matches /docs)
    if (href !== '/' && currentPath.startsWith(href)) return true;
    
    return false;
  },
  
  /**
   * Update active states on nav links
   */
  update() {
    const navLinks = document.querySelectorAll('nav a, [data-nav] a');
    
    navLinks.forEach(link => {
      const isActive = this.isActive(link);
      link.classList.toggle('is-active', isActive);
      
      if (isActive) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  },
  
  /**
   * Initialize active nav highlighting
   */
  init() {
    this.update();
    
    // Update on navigation (for SPA-like behavior)
    window.addEventListener('popstate', () => this.update());
  },
};

/**
 * Smooth Scrolling for Anchor Links
 */
const SmoothScroll = {
  /**
   * Scroll to element smoothly
   * @param {string} hash - Element ID with #
   */
  scrollTo(hash) {
    const target = document.querySelector(hash);
    if (!target) return;
    
    const headerHeight = document.querySelector('header')?.offsetHeight || 0;
    const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;
    
    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth',
    });
  },
  
  /**
   * Initialize smooth scrolling
   */
  init() {
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      
      const hash = link.getAttribute('href');
      if (hash === '#') return;
      
      e.preventDefault();
      this.scrollTo(hash);
      
      // Update URL without scrolling
      history.pushState(null, '', hash);
    });
    
    // Handle initial hash
    if (window.location.hash) {
      // Delay to ensure content is loaded
      setTimeout(() => this.scrollTo(window.location.hash), 100);
    }
  },
};

/**
 * Copy Code Button
 * Adds copy functionality to code blocks
 */
const CopyCode = {
  /**
   * Copy text to clipboard
   * @param {string} text
   * @returns {Promise<boolean>}
   */
  async copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand('copy');
      document.body.removeChild(textarea);
      return success;
    }
  },
  
  /**
   * Add copy button to a code block
   * @param {HTMLElement} block
   */
  addButton(block) {
    if (block.querySelector('.copy-button')) return;
    
    const button = document.createElement('button');
    button.className = 'copy-button';
    button.setAttribute('aria-label', 'Copy code');
    const clipboardIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    button.innerHTML = clipboardIcon;
    
    button.addEventListener('click', async () => {
      const code = block.querySelector('code');
      if (!code) return;
      
      const success = await this.copy(code.textContent);
      
      button.innerHTML = success ? '\u2713' : '\u2717';
      button.classList.add(success ? 'copied' : 'error');
      
      setTimeout(() => {
        button.innerHTML = clipboardIcon;
        button.classList.remove('copied', 'error');
      }, 2000);
    });
    
    block.appendChild(button);
  },
  
  /**
   * Initialize copy buttons on all code blocks
   */
  init() {
    const addButtons = () => {
      document.querySelectorAll('pre.code-block').forEach(block => {
        this.addButton(block);
      });
    };
    
    // Initial setup
    addButtons();
    
    // Re-run when markdown is loaded
    document.addEventListener('markdown-loaded', addButtons);
  },
};

/**
 * Initialize all interactive features
 */
function init() {
  // Only run in browser
  if (typeof window === 'undefined') return;
  
  Theme.init();
  MobileNav.init();
  ActiveNav.init();
  SmoothScroll.init();
  CopyCode.init();
}

// Auto-initialize on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for external use
export { Theme, MobileNav, ActiveNav, SmoothScroll, CopyCode, init };
export default { Theme, MobileNav, ActiveNav, SmoothScroll, CopyCode, init };
