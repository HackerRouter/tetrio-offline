'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const BODYLESS_STATUSES = new Set([101, 204, 205, 304]);

function cacheId(url) {
  return crypto.createHash('sha256').update(url).digest('hex');
}

function sanitizeHeaders(headers) {
  const clean = {};
  for (const [name, value] of headers.entries()) {
    const lower = name.toLowerCase();
    if (['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie', 'set-cookie2'].includes(lower)) continue;
    clean[lower] = value;
  }
  return clean;
}

function parseRange(value, size) {
  if (!value || !/^bytes=\d*-\d*$/.test(value) || value.includes(',')) return null;
  const [left, right] = value.slice(6).split('-');
  let start;
  let end;

  if (left === '') {
    const suffix = Number(right);
    if (!Number.isInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(left);
    end = right === '' ? size - 1 : Number(right);
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) return null;
  return { start, end: Math.min(end, size - 1) };
}

class CacheStore {
  constructor(root) {
    this.root = root;
    this.bodyDir = path.join(root, 'bodies');
    this.metaDir = path.join(root, 'metadata');
    this.readyFile = path.join(root, 'READY.json');
    this.missingLog = path.join(root, 'missing.log');
  }

  async init() {
    await Promise.all([
      fsp.mkdir(this.bodyDir, { recursive: true }),
      fsp.mkdir(this.metaDir, { recursive: true })
    ]);
  }

  pathsFor(url) {
    const id = cacheId(url);
    return {
      id,
      body: path.join(this.bodyDir, `${id}.bin`),
      meta: path.join(this.metaDir, `${id}.json`)
    };
  }

  async save(url, response) {
    if (response.status !== 200) return { response, saved: false };

    const body = Buffer.from(await response.arrayBuffer());
    const headers = sanitizeHeaders(response.headers);
    const metadata = {
      url,
      finalUrl: response.url || url,
      status: response.status,
      statusText: response.statusText,
      headers,
      size: body.length,
      savedAt: new Date().toISOString()
    };
    const paths = this.pathsFor(url);
    const nonce = `${process.pid}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const tempBody = `${paths.body}.${nonce}.tmp`;
    const tempMeta = `${paths.meta}.${nonce}.tmp`;

    await fsp.writeFile(tempBody, body);
    await fsp.writeFile(tempMeta, JSON.stringify(metadata, null, 2), 'utf8');
    await fsp.rename(tempBody, paths.body);
    await fsp.rename(tempMeta, paths.meta);

    const replay = BODYLESS_STATUSES.has(response.status) ? null : body;
    return {
      response: new Response(replay, {
        status: response.status,
        statusText: response.statusText,
        headers
      }),
      saved: true,
      size: body.length
    };
  }

  async match(url, options = {}) {
    const paths = this.pathsFor(url);
    try {
      const [rawMeta, body] = await Promise.all([
        fsp.readFile(paths.meta, 'utf8'),
        fsp.readFile(paths.body)
      ]);
      const meta = JSON.parse(rawMeta);
      const headers = { ...meta.headers };

      if (options.method === 'HEAD') {
        headers['content-length'] = String(body.length);
        return new Response(null, { status: meta.status, statusText: meta.statusText, headers });
      }

      const range = parseRange(options.range, body.length);
      if (range) {
        const part = body.subarray(range.start, range.end + 1);
        headers['accept-ranges'] = 'bytes';
        headers['content-range'] = `bytes ${range.start}-${range.end}/${body.length}`;
        headers['content-length'] = String(part.length);
        return new Response(part, { status: 206, statusText: 'Partial Content', headers });
      }

      headers['content-length'] = String(body.length);
      const replay = BODYLESS_STATUSES.has(meta.status) ? null : body;
      return new Response(replay, { status: meta.status, statusText: meta.statusText, headers });
    } catch (error) {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
      throw error;
    }
  }

  async logMissing(url) {
    await fsp.appendFile(this.missingLog, `${new Date().toISOString()} ${url}\n`, 'utf8');
  }

  async stats() {
    let files = [];
    try {
      files = await fsp.readdir(this.metaDir);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    let bytes = 0;
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      try {
        const meta = JSON.parse(await fsp.readFile(path.join(this.metaDir, file), 'utf8'));
        bytes += meta.size || 0;
      } catch {}
    }
    return { entries: files.filter((name) => name.endsWith('.json')).length, bytes };
  }

  async markReady(extra = {}) {
    const stats = await this.stats();
    const data = { ready: true, preparedAt: new Date().toISOString(), ...stats, ...extra };
    await fsp.writeFile(this.readyFile, JSON.stringify(data, null, 2), 'utf8');
    return data;
  }

  isReady() {
    return fs.existsSync(this.readyFile);
  }
}

module.exports = { CacheStore, cacheId, parseRange, sanitizeHeaders };
