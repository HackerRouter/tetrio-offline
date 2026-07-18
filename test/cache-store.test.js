'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { CacheStore, parseRange } = require('../src/cache-store');

test('parseRange supports ordinary, open and suffix byte ranges', () => {
  assert.deepEqual(parseRange('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseRange('bytes=7-', 10), { start: 7, end: 9 });
  assert.deepEqual(parseRange('bytes=-3', 10), { start: 7, end: 9 });
  assert.equal(parseRange('bytes=20-30', 10), null);
});

test('CacheStore saves, replays and marks an archive ready', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tetrio-offline-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new CacheStore(root);
  await store.init();

  const live = new Response('abcdefghij', {
    status: 200,
    headers: { 'content-type': 'text/plain', 'content-encoding': 'gzip' }
  });
  const saved = await store.save('https://tetr.io/example.txt', live);
  assert.equal(saved.saved, true);
  assert.equal(await saved.response.text(), 'abcdefghij');
  assert.equal(saved.response.headers.has('content-encoding'), false);

  const full = await store.match('https://tetr.io/example.txt');
  assert.equal(await full.text(), 'abcdefghij');
  const partial = await store.match('https://tetr.io/example.txt', { range: 'bytes=2-5' });
  assert.equal(partial.status, 206);
  assert.equal(await partial.text(), 'cdef');

  const ready = await store.markReady({ source: 'test' });
  assert.deepEqual({ entries: ready.entries, bytes: ready.bytes }, { entries: 1, bytes: 10 });
  assert.equal(store.isReady(), true);
});
