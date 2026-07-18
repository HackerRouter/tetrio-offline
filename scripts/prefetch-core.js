'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { CacheStore } = require('../src/cache-store');

const projectRoot = path.resolve(__dirname, '..');
const archiveRoot = path.join(projectRoot, 'offline-data', 'archive');
const metadataDir = path.join(archiveRoot, 'metadata');
const bodyDir = path.join(archiveRoot, 'bodies');
const reportFile = path.join(archiveRoot, 'prefetch-report.json');
const cache = new CacheStore(archiveRoot);

const assetPattern = /(?:https:\/\/tetr\.io)?\/?(?:res|css|js|client)\/[A-Za-z0-9_@%+.,~()\/-]+\.(?:js|css|json|png|jpe?g|webp|gif|svg|ico|mp3|ogg|wav|woff2?|ttf)(?:\?[A-Za-z0-9_@%+.,=&~\/-]*)?/gi;
const corePathPattern = /^\/(?:res\/(?:bg|skins|font|icon|sfx|bgm)\/|css\/|js\/|client\/)/i;

async function discover() {
  const candidates = new Set();
  const cached = new Set();
  let metadataFiles = [];
  try {
    metadataFiles = (await fs.readdir(metadataDir)).filter((name) => name.endsWith('.json'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  for (const file of metadataFiles) {
    let meta;
    try {
      meta = JSON.parse(await fs.readFile(path.join(metadataDir, file), 'utf8'));
    } catch {
      continue;
    }
    cached.add(meta.url);
    const contentType = meta.headers?.['content-type'] || '';
    if (!/(text|javascript|json|xml|svg)/i.test(contentType)) continue;

    const text = await fs.readFile(path.join(bodyDir, `${path.basename(file, '.json')}.bin`), 'utf8');
    for (const raw of text.match(assetPattern) || []) {
      try {
        const url = new URL(raw, meta.url);
        if (url.hostname === 'tetr.io' && corePathPattern.test(url.pathname)) candidates.add(url.href);
      } catch {}
    }
  }
  return [...candidates].filter((url) => !cached.has(url)).sort();
}

async function prefetch(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'TETR.IO Offline Local resource prefetcher' }
  });
  if (response.status !== 200) return { url, ok: false, status: response.status };
  const saved = await cache.save(url, response);
  return { url, ok: saved.saved, status: response.status, size: saved.size || 0 };
}

async function main() {
  await cache.init();
  const pending = await discover();
  const results = [];
  const queue = [...pending];
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        results.push(await prefetch(url));
      } catch (error) {
        results.push({ url, ok: false, error: error.message });
      }
    }
  });
  await Promise.all(workers);
  const ready = await cache.markReady({ source: 'https://tetr.io/', client: 'TETR.IO Offline Local' });
  const report = {
    completedAt: new Date().toISOString(),
    discovered: pending.length,
    downloaded: results.filter((item) => item.ok).length,
    skipped: results.filter((item) => !item.ok && item.status === 404),
    failed: results.filter((item) => !item.ok && item.status !== 404),
    ready
  };
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (report.failed.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
