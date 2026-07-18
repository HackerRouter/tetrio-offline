'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, net, session, shell } = require('electron');
const { CacheStore } = require('./cache-store');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DATA_ROOT = path.join(PROJECT_ROOT, 'offline-data');
const PROFILE_ROOT = path.join(DATA_ROOT, 'electron-profile');
const ARCHIVE_ROOT = path.join(DATA_ROOT, 'archive');
const smokeTest = process.argv.includes('--smoke-test');
const mode = process.argv.includes('--prepare') ? 'prepare' : 'offline';
const cache = new CacheStore(ARCHIVE_ROOT);

app.setName('TETR.IO Offline Local');
app.setPath('userData', PROFILE_ROOT);
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('lang', 'en-US');
if (mode === 'offline') {
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP * ~NOTFOUND');
}

let mainWindow = null;
let mainFrameLoaded = false;
let lastSavedAt = 0;
let readyAnnounced = false;
let statusTimer = null;

function errorResponse(url) {
  const isDocument = url === 'https://tetr.io/' || url.startsWith('https://tetr.io/?');
  if (!isDocument) {
    return new Response('', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*' }
    });
  }
  const html = `<!doctype html><meta charset="utf-8"><title>Missing Offline Resource</title>
  <style>body{margin:0;background:#090d14;color:#e8eef8;font:18px/1.7 system-ui;display:grid;place-items:center;height:100vh}main{max-width:680px;padding:40px}h1{color:#ff6262}</style>
  <main><h1>The offline archive is incomplete</h1><p>Run <code>prepare-offline.cmd</code> while connected to the Internet. Wait for the main menu and the green completion banner before closing the window.</p><p>Missing URL: <code>${url.replace(/[<>&]/g, '')}</code></p></main>`;
  return new Response(html, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

async function reportStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const stats = await cache.stats();
  mainWindow.webContents.send('offline-cache-status', stats);

  if (mode === 'prepare' && !readyAnnounced && mainFrameLoaded && stats.entries >= 5 && Date.now() - lastSavedAt >= 15000) {
    const ready = await cache.markReady({ source: 'https://tetr.io/', client: 'TETR.IO Offline Local' });
    readyAnnounced = true;
    mainWindow.webContents.send('offline-cache-ready', ready);
  }
}

async function installArchiveProtocol() {
  const ses = session.defaultSession;

  await ses.protocol.handle('https', async (request) => {
    if (mode === 'offline') {
      const hit = await cache.match(request.url, {
        method: request.method,
        range: request.headers.get('range')
      });
      if (hit) return hit;
      await cache.logMissing(request.url);
      return errorResponse(request.url);
    }

    try {
      const live = await net.fetch(request, { bypassCustomProtocolHandlers: true });
      if (request.method !== 'GET' || live.status !== 200) return live;
      const result = await cache.save(request.url, live);
      if (result.saved) {
        lastSavedAt = Date.now();
        readyAnnounced = false;
        setTimeout(() => reportStatus().catch(console.error), 100);
      }
      return result.response;
    } catch (error) {
      const fallback = await cache.match(request.url, {
        method: request.method,
        range: request.headers.get('range')
      });
      if (fallback) return fallback;
      console.error(`Unable to fetch ${request.url}:`, error.message);
      return errorResponse(request.url);
    }
  });

  await ses.protocol.handle('http', async (request) => {
    if (mode === 'offline') {
      const hit = await cache.match(request.url, { method: request.method, range: request.headers.get('range') });
      if (hit) return hit;
      await cache.logMissing(request.url);
      return errorResponse(request.url);
    }
    return net.fetch(request, { bypassCustomProtocolHandlers: true });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: mode === 'prepare' ? 'TETR.IO Offline Preparation' : 'TETR.IO Offline',
    width: 1600,
    height: 900,
    minWidth: 800,
    minHeight: 450,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: !smokeTest,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: [`--tetrio-offline-mode=${mode}`]
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (mode === 'prepare') shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('https://tetr.io/')) {
      event.preventDefault();
      if (mode === 'prepare') shell.openExternal(url);
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainFrameLoaded = true;
    reportStatus().catch(console.error);
    if (smokeTest) {
      setTimeout(async () => {
        try {
          const page = await mainWindow.webContents.executeJavaScript(`(async () => {
            const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
            const solo = document.querySelector('#play_solo');
            solo?.click();
            await wait(1200);
            const soloMenu = document.querySelector('#solo_menu');
            const soloMenuOpened = Boolean(soloMenu && !soloMenu.classList.contains('hidden') && !soloMenu.classList.contains('thidden'));
            document.querySelector('#game_zen')?.click();
            await wait(1200);
            const zenSetupOpened = (document.body?.innerText || '').includes('press START to begin playing');
            document.querySelector('#start_zen')?.click();
            await wait(2000);
            const zenPanel = document.querySelector('#zen_panel');
            return {
              title: document.title,
              bodyClass: document.body?.className || '',
              hasPlayMenu: Boolean(document.querySelector('#play, #play_solo, #play_multi')),
              hasSoloEntry: Boolean(solo),
              soloMenuOpened,
              zenSetupOpened,
              zenOpened: Boolean(zenPanel && !zenPanel.classList.contains('hidden'))
            };
          })()`);
          const result = {
            ok: page.title === 'TETR.IO' && page.hasSoloEntry && page.soloMenuOpened && page.zenOpened,
            testedAt: new Date().toISOString(), mode, page
          };
          await fs.mkdir(DATA_ROOT, { recursive: true });
          await fs.writeFile(path.join(DATA_ROOT, 'smoke-test.json'), JSON.stringify(result, null, 2), 'utf8');
          console.log(`OFFLINE_SMOKE_RESULT=${JSON.stringify(result)}`);
          app.exit(0);
        } catch (error) {
          console.error('OFFLINE_SMOKE_FAILED', error);
          app.exit(2);
        }
      }, 15000);
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL('https://tetr.io/');
}

ipcMain.on('fullscreen', () => {
  if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen());
});
ipcMain.on('close', () => mainWindow?.close());
ipcMain.on('devtools', () => mainWindow?.webContents.toggleDevTools());
ipcMain.on('presence', () => {});
ipcMain.on('blockmovement', () => {});
ipcMain.on('malblock', () => {});
ipcMain.on('vsync', () => {});
ipcMain.on('noautoupdate', () => {});
ipcMain.on('reviq', () => {});
ipcMain.handle('get-systeminfo', async () => ({
  baseboard: 'N/A', virtual: false, majorID: 'offline-local', network: [], disks: [],
  refreshRate: 60, timeFormat: null, dateFormat: null, ready: true
}));

app.whenReady().then(async () => {
  await cache.init();
  await installArchiveProtocol();
  createWindow();
  if (mode === 'prepare') statusTimer = setInterval(() => reportStatus().catch(console.error), 2000);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  if (statusTimer) clearInterval(statusTimer);
});
