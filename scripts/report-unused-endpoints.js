#!/usr/bin/env node
/**
 * Scans NestJS controllers for endpoints and cross-checks against frontend usage
 * (axios `api.<method>("/path")` and `fetch(`${API_BASE}/path`, { method })`).
 * Prints a grouped list of backend endpoints not used by the frontend.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const API_SRC = path.join(ROOT, 'api', 'src');
const FE_ROOT = path.join(ROOT, 'frontend-contabilidad');

/** Utility: recursively list files */
function listFiles(dir, filter) {
  const out = [];
  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return }
    for (const ent of entries) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (!filter || filter(p)) out.push(p);
    }
  }
  walk(dir);
  return out;
}

/** Parse controllers: find @Controller('base') and route decorators */
function parseControllers() {
  const files = listFiles(API_SRC, p => p.endsWith('.controller.ts'));
  const endpoints = [];
  const ctrlRegex = /@Controller\(([^)]*)\)/g;
  const strLit = /['"]([^'"]+)['"]/; // first string literal
  const routeDeco = /@(Get|Post|Put|Patch|Delete|Options|Head)\(([^)]*)\)/g;
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue }
    // find controller base(s)
    const bases = [];
    let m;
    while ((m = ctrlRegex.exec(text))) {
      const arg = m[1] || '';
      const mStr = strLit.exec(arg);
      if (mStr) bases.push(mStr[1]);
      else if (/\[.*\]/.test(arg)) {
        // array of bases: try to collect simple strings
        const arr = arg.split(',').map(s => s.trim());
        for (const part of arr) {
          const mm = strLit.exec(part);
          if (mm) bases.push(mm[1]);
        }
      } else {
        bases.push('');
      }
    }
    if (bases.length === 0) bases.push('');

    // For each method decorator
    let rm;
    while ((rm = routeDeco.exec(text))) {
      const method = rm[1].toUpperCase();
      const arg = rm[2] || '';
      let sub = '';
      const s = strLit.exec(arg);
      if (s) sub = s[1];
      // For each base, compose full path
      for (const base of bases) {
        const full = composePath(base, sub);
        endpoints.push({ method, path: full, file: path.relative(ROOT, file) });
      }
    }
  }
  // Deduplicate
  const seen = new Set();
  const unique = [];
  for (const e of endpoints) {
    const key = `${e.method} ${e.path}`;
    if (!seen.has(key)) { seen.add(key); unique.push(e); }
  }
  return unique;
}

function composePath(base, sub) {
  const segs = [];
  const add = (s) => {
    if (!s) return;
    let t = String(s).trim();
    t = t.replace(/^\//, '').replace(/\/$/, '');
    if (t) segs.push(t);
  };
  add(base);
  add(sub);
  let p = '/' + segs.join('/');
  if (p === '/') return '/';
  return p;
}

/** Parse frontend usage: axios api.<method>("/path") and fetch(`${API_BASE}/path`, { method }) */
function parseFrontendUsage() {
  const files = listFiles(FE_ROOT, p => /\.(tsx?|jsx?)$/.test(p) || p.endsWith('.ts'));
  const used = new Set();
  for (const file of files) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue }

    // axios api.<method>("/path" ...)
    const axiosRe = /\bapi\.(get|post|put|patch|delete)(?:<[^>]*>)?\(\s*([`'"])(\/(?:[^`'"\\]|\\.)*?)\2/gi;
    let m;
    while ((m = axiosRe.exec(text))) {
      const method = m[1].toUpperCase();
      const route = sanitizePath(m[3]);
      used.add(`${method} ${route}`);
    }

    // fetch('...') possibly with API_BASE
    const fetchRe = /\bfetch\(\s*([`'"])([\s\S]*?)\1\s*(?:,\s*\{[\s\S]*?\})?/g;
    let fm;
    while ((fm = fetchRe.exec(text))) {
      const urlLit = fm[2];
      const method = extractMethodFromOptions(text.slice(fm.index, fm.index + fm[0].length));
      // try to find a "/path" segment in the literal
      const pathMatch = /\/(?:[a-zA-Z0-9_.:@\-]+(?:\/[a-zA-Z0-9_.:@\-]+)*)/.exec(urlLit.replace(/\$\{[^}]+\}/g, ''));
      if (pathMatch) {
        const route = sanitizePath(pathMatch[0]);
        used.add(`${method} ${route}`);
      }
    }
  }
  return used;
}

function extractMethodFromOptions(fragment) {
  // default GET
  const m = /\bmethod\s*:\s*([`'"])\s*([A-Z]+)\s*\1/i.exec(fragment);
  return (m ? m[2] : 'GET').toUpperCase();
}

function sanitizePath(p) {
  if (!p) return '/';
  let s = String(p).trim();
  s = s.replace(/https?:\/\/[^/]+/i, ''); // strip origin if any
  s = s.replace(/^\/+/, '/');
  s = s.replace(/\/$/, '');
  if (s === '') s = '/';
  return s;
}

function groupByModule(endpoints) {
  const groups = new Map();
  for (const e of endpoints) {
    let mod = '/';
    if (e.path !== '/') {
      const seg = e.path.split('/').filter(Boolean)[0];
      mod = seg || '/';
    }
    if (!groups.has(mod)) groups.set(mod, []);
    groups.get(mod).push(e);
  }
  // sort groups and endpoints
  const sorted = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  for (const [k, arr] of sorted) {
    arr.sort((a, b) => {
      const pm = a.path.localeCompare(b.path);
      if (pm !== 0) return pm;
      return a.method.localeCompare(b.method);
    });
  }
  return new Map(sorted);
}

function main() {
  const apiEndpoints = parseControllers();
  const used = parseFrontendUsage();

  const unused = apiEndpoints.filter(e => !used.has(`${e.method} ${e.path}`));
  const grouped = groupByModule(unused);

  // Print report
  let total = 0;
  console.log('Endpoints del API no usados por el frontend');
  for (const [mod, arr] of grouped) {
    if (!arr.length) continue;
    console.log(mod === '/' ? '/' : `\n${mod}`);
    for (const e of arr) {
      console.log(`${e.method} ${e.path}`);
      total++;
    }
  }
  console.log(`\nTotal: ${total}`);
}

if (require.main === module) {
  main();
}
