# TETRIO but FULLY OFFLINE
> A Standalone TETR.IO Offline Launcher
> 
> **Unofficial project.** This project is not affiliated with, sponsored by, or endorsed by TETR.IO or osk.
>
> This repository contains no TETR.IO game assets or proprietary client code. Required resources are downloaded locally by each user from the official TETR.IO service and are stored only in the `offline-data` directory.

This project is intended for anyone who needs to play TETR.IO in a fully offline environment. The official launcher still requires you to go online before using offline mode in each new launch session.

It uses its own runtime, browser profile, and resource archive. It does not read, copy, or modify the installed TETR.IO application, its existing user configuration, login data, or web cache.

The project is written for Windows. But yes, you can try to build one for Linux.

## Usage

1. Stay connected to the Internet and double-click `prepare-offline.cmd`.
2. Wait until the full TETR.IO main menu appears and the banner at the top turns green with a completion message.
3. Visit each local game page you plan to use so that any resources loaded on demand are added to the archive. Wait for the green completion banner to reappear after new resources are downloaded.
4. Close the preparation window. From then on, double-click `play-offline.cmd`, including when the computer is disconnected from the Internet.

Online multiplayer, accounts, rankings, and other server-backed features are unavailable. The supported scope is TETR.IO's built-in local gameplay.

## Files

- `offline-data/archive`: the auditable offline response archive and its `READY.json` completion marker.
- `offline-data/electron-profile`: settings, IndexedDB, Local Storage, cookies, and Service Worker data used only by this project.
- `offline-data/archive/missing.log`: URLs requested during offline use that were not present in the archive. If a local mode is missing an asset, run `prepare-offline.cmd` online again and visit that mode.

Running the preparation launcher again refreshes only this project's archive. It does not affect the installed TETR.IO application.

## Copyright and trademarks

TETR.IO, its client, artwork, audio, fonts, website resources, and related marks belong to their respective owners. Their inclusion in a user's local cache does not place them under this project's license. The use of the TETR.IO name in this repository is solely descriptive and does not imply an official relationship.

The MIT License in `LICENSE` applies only to the original launcher, cache-management, test, and documentation code contained in this repository. It does not grant any rights to TETR.IO, its client, its service, or its assets.
