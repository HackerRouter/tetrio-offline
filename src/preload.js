'use strict';

const { ipcRenderer } = require('electron');

window.IS_ELECTRON = true;
window.CLIENT_VERSION = 10;
const modeArgument = process.argv.find((argument) => argument.startsWith('--tetrio-offline-mode='));
window.TETRIO_OFFLINE_MODE = modeArgument?.split('=')[1] || 'offline';
window.IPC = {
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  on: (channel, listener) => ipcRenderer.on(channel, listener),
  once: (channel, listener) => ipcRenderer.once(channel, listener),
  removeListener: (channel, listener) => ipcRenderer.removeListener(channel, listener)
};

ipcRenderer.invoke('get-systeminfo').then((data) => {
  window.SYS_INFO = data;
});

function showStatus(message, complete = false) {
  let banner = document.getElementById('tetrio-offline-status');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'tetrio-offline-status';
    Object.assign(banner.style, {
      position: 'fixed',
      zIndex: '2147483647',
      top: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      padding: '9px 18px',
      borderRadius: '5px',
      background: 'rgba(12, 18, 28, 0.94)',
      border: '1px solid #45a3ff',
      color: '#fff',
      font: '14px/1.4 sans-serif',
      boxShadow: '0 4px 18px #000a',
      pointerEvents: 'none'
    });
    document.documentElement.appendChild(banner);
  }
  banner.textContent = message;
  banner.style.borderColor = complete ? '#57d68d' : '#45a3ff';
}

if (window.TETRIO_OFFLINE_MODE === 'prepare') {
  window.addEventListener('DOMContentLoaded', () => showStatus('Preparing offline resources. Please wait for the full main menu...'));
  ipcRenderer.on('offline-cache-status', (_event, status) => {
    const size = (status.bytes / 1024 / 1024).toFixed(1);
    showStatus(`Archiving resources: ${status.entries} items / ${size} MB`);
  });
  ipcRenderer.on('offline-cache-ready', (_event, status) => {
    const size = (status.bytes / 1024 / 1024).toFixed(1);
    showStatus(`Offline resources are ready (${status.entries} items / ${size} MB). You may close this window.`, true);
  });
}
