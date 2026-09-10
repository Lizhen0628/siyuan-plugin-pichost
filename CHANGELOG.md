# Change Log

## 0.2.3 (2026-09-10)

- Fix bazaar manifest: `backends` / `frontends` no longer mix `"all"` with concrete platforms (use only `["all"]`), unblocking the marketplace PR check.

## 0.2.1 (2026-09-09)

- Panel: replace the clunky text-button row with a hover action overlay on each thumbnail — icon buttons (copy URL / Markdown / HTML, delete) with native SiYuan tooltips; always visible on touch devices.

## 0.2.0 (2026-09-09)

- New setting toggle **Auto-upload inserted images**: newly pasted/dropped images are uploaded automatically, the local `assets/` copy is deleted, and the document keeps only the remote URL.
- Fixed: context-menu upload failed because `/api/file/getFile` was called with a workspace-root-relative path (`data/` prefix added) and without the kernel auth token.

## 0.1.1 (2026-09-09)

- Settings: add a **Test Connection** button that verifies the server URL and API token entered in the form (no save required).

## 0.1.0 (2026-09-08)

- Initial release.
- Upload document images (single / whole doc) to a self-hosted PicHost server and rewrite references to public URLs.
- Management panel: paginated list, keyword search, copy URL / Markdown / HTML, delete.
- Settings for server URL and API token.
