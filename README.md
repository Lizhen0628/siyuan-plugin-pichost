# siyuan-plugin-pichost

[中文说明](README.zh-CN.md)

A [SiYuan](https://b3log.org/siyuan) plugin that uploads document images to a self-hosted [PicHost](https://github.com/o96u/PicHost) image server and manages them.

## Features

- **Upload & replace**: Right-click an image in the editor → *Upload to PicHost*. The local `assets/…` reference is uploaded to your PicHost server and the block is rewritten to use the public URL (the local file is kept untouched).
- **Bulk upload**: Right-click inside a document (or open the breadcrumb *More* menu) → *Upload all local images of this doc to PicHost*.
- **Management panel**: Top bar button (or command `⇧⌘P`) opens a panel with pagination, keyword search, one-click copy of URL / Markdown / HTML, and deletion.
- **Settings**: Server URL and API token, stored via the plugin data API.

## Getting started

1. Install Node.js (>= 20) and pnpm, then run `pnpm i`.
2. `pnpm run dev` for watch builds, or `pnpm run build` to produce `package.zip`.
3. Clone this repo into `{SiYuan workspace}/data/plugins/` (recommended) and enable the plugin from the marketplace "Downloaded" tab.

## Configuration

| Setting    | Default                             | Description                       |
| ---------- | ----------------------------------- | --------------------------------- |
| Server URL | `https://pichost.tools-online.site` | Base URL of your PicHost instance |
| API Token  | *(empty — set your own)*            | Sent as the `Auth-Token` header   |

> No API token is bundled with the source for security reasons. Open **Settings → PicHost** and fill in your server URL and API token (generated in your PicHost's API page) before first use.

## API usage

Implements the [PicHost REST API](https://o96u.github.io/PicHost/guide/api.html): `POST /api/images/upload`, `GET /api/images`, `GET /api/images/search`, `DELETE /api/images`, `POST /api/images/batch-delete`. Authentication uses the `Auth-Token` request header.

## Notes

- Local asset files are **not** deleted after upload; the block reference is switched to the remote URL.
- Deleting from the management panel removes the file on the server permanently.
