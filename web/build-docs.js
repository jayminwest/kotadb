#!/usr/bin/env node

/**
 * Documentation Pre-rendering Build Script
 *
 * Generates static HTML from markdown files to ensure documentation
 * is accessible without JavaScript while maintaining progressive enhancement.
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Simple markdown-to-HTML converter (basic implementation)
function parseMarkdown(content) {
  // Parse frontmatter
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(frontmatterRegex);

  let frontmatter = {};
  let markdown = content;

  if (match) {
    const yamlContent = match[1];
    markdown = content.slice(match[0].length);

    // Parse YAML frontmatter (basic key:value pairs)
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

      frontmatter[key] = value;
    }
  }

  // Basic markdown to HTML conversion
  let html = markdown
    // Headers
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')

    // Code blocks
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')

    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')

    // Bold and italic
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

    // Paragraphs (basic)
    .split('\n\n')
    .filter(p => p.trim())
    .map(p => p.trim())
    .filter(p => !p.startsWith('<h') && !p.startsWith('<pre') && !p.startsWith('<ul') && !p.startsWith('<ol'))
    .map(p => `<p>${p}</p>`)
    .join('\n');

  return { frontmatter, html };
}

// Documentation pages configuration
const DOCS_PAGES = {
  'installation': {
    file: 'content/installation.md',
    title: 'Installation - KotaDB Documentation'
  },
  'configuration': {
    file: 'content/configuration.md',
    title: 'Configuration - KotaDB Documentation'
  },
  'api-reference': {
    file: 'content/api-reference.md',
    title: 'API Reference - KotaDB Documentation'
  },
  'architecture': {
    file: 'content/architecture.md',
    title: 'Architecture - KotaDB Documentation'
  }
};

async function buildDocumentation() {
  const docsDir = join(__dirname, 'docs');
  const contentDir = join(docsDir, 'content');

  console.log('🔨 Building documentation...');

  try {
    // Generate content defaults HTML file
    let defaultsHtml = `<!-- Auto-generated default content for documentation -->
<div class="default-content">
  <h1>Getting Started with KotaDB</h1>
  <p>KotaDB provides local-first code intelligence for your development workflow.</p>
`;

    // Process each documentation page
    for (const [page, config] of Object.entries(DOCS_PAGES)) {
      const markdownPath = join(docsDir, config.file);

      try {
        const markdownContent = await fs.readFile(markdownPath, 'utf-8');
        const { frontmatter, html } = parseMarkdown(markdownContent);

        // Add to defaults (first 200 characters as preview)
        const preview = html.replace(/<[^>]*>/g, ' ').trim().slice(0, 200) + '...';
        defaultsHtml += `
  <h3>${frontmatter.title || page}</h3>
  <p>${frontmatter.description || preview}</p>
`;

        console.log(`✅ Processed ${page}`);
      } catch (error) {
        console.warn(`⚠️  Failed to process ${page}: ${error.message}`);
      }
    }

    defaultsHtml += `
  <h2>Navigation</h2>
  <p>Use the sidebar to explore detailed documentation for each section.</p>
  <p><em>Enhanced content will load when JavaScript is available.</em></p>
</div>`;

    // Write defaults file
    const defaultsPath = join(docsDir, 'content-defaults.html');
    await fs.writeFile(defaultsPath, defaultsHtml);

    console.log(`📄 Generated ${defaultsPath}`);
    console.log('✨ Documentation build complete!');

  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

// Run the build
buildDocumentation().catch(error => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});