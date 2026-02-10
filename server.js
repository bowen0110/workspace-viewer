import express from 'express';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || join(__dirname, '..');
const PORT = 3500;

// Set up marked with syntax highlighting
const marked = new Marked(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  })
);

const app = express();
app.use(express.static(join(__dirname, 'public')));

// Build directory tree of .md files
async function buildTree(dir, rootDir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const items = [];

  // Sort: directories first, then files, both alphabetical
  const sorted = entries
    .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

  for (const entry of sorted) {
    const fullPath = join(dir, entry.name);
    const relPath = relative(rootDir, fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, rootDir);
      // Only include directories that contain .md files (directly or nested)
      if (children.length > 0) {
        items.push({ name: entry.name, path: relPath, type: 'dir', children });
      }
    } else if (extname(entry.name) === '.md') {
      items.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }

  return items;
}

// API: get directory tree
app.get('/api/tree', async (req, res) => {
  try {
    const tree = await buildTree(WORKSPACE_ROOT, WORKSPACE_ROOT);
    res.json(tree);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: get rendered markdown for a file
app.get('/api/file', async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).json({ error: 'path required' });

    // Prevent directory traversal
    const resolved = join(WORKSPACE_ROOT, filePath);
    if (!resolved.startsWith(WORKSPACE_ROOT)) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const info = await stat(resolved);
    if (!info.isFile() || extname(resolved) !== '.md') {
      return res.status(400).json({ error: 'not a markdown file' });
    }

    const content = await readFile(resolved, 'utf-8');
    const html = await marked.parse(content);
    res.json({ path: filePath, html, raw: content });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'file not found' });
    res.status(500).json({ error: err.message });
  }
});

// API: search files
app.get('/api/search', async (req, res) => {
  try {
    const query = (req.query.q || '').toLowerCase().trim();
    if (!query) return res.json([]);

    const results = [];
    async function search(dir) {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          await search(fullPath);
        } else if (extname(entry.name) === '.md') {
          const relPath = relative(WORKSPACE_ROOT, fullPath);
          if (relPath.toLowerCase().includes(query)) {
            results.push(relPath);
          }
          if (results.length >= 30) return;
        }
      }
    }
    await search(WORKSPACE_ROOT);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Workspace viewer running at http://0.0.0.0:${PORT}`);
  console.log(`Serving markdown files from: ${WORKSPACE_ROOT}`);
});
