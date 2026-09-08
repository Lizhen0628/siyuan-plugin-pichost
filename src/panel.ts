import {confirm, showMessage} from "siyuan";
import {PichostClient, PichostImageItem} from "./api";

interface II18nPanel {
    [key: string]: string;
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function formatBytes(size: number): string {
    if (size < 1024) {
        return `${size} B`;
    }
    if (size < 1024 * 1024) {
        return `${(size / 1024).toFixed(1)} KB`;
    }
    return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

async function copyText(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        // Electron/浏览器降级方案
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        const ok = document.execCommand("copy");
        textarea.remove();
        return ok;
    }
}

/**
 * 图床管理面板:列表 / 搜索 / 分页 / 复制链接 / 删除。
 * 渲染在自定义 Tab 的 element 中,由 index.ts 通过 addTab 挂载。
 */
export class PichostPanel {
    private page = 1;
    private readonly limit = 20;
    private totalPages = 1;
    private total = 0;
    private items: PichostImageItem[] = [];
    private destroyed = false;

    private searchInputElement: HTMLInputElement;
    private gridElement: HTMLElement;
    private infoElement: HTMLElement;
    private prevButtonElement: HTMLButtonElement;
    private nextButtonElement: HTMLButtonElement;

    constructor(private readonly opts: {
        element: HTMLElement;
        client: PichostClient;
        i18n: II18nPanel;
    }) {
        this.render();
    }

    private t(key: string, vars?: Record<string, string | number>) {
        let text = this.opts.i18n[key] || key;
        if (vars) {
            for (const [k, v] of Object.entries(vars)) {
                text = text.replace(`\${${k}}`, String(v));
            }
        }
        return text;
    }

    private render() {
        this.opts.element.classList.add("pichost-panel");
        this.opts.element.innerHTML = `<div class="pichost-panel__toolbar">
    <input class="b3-text-field pichost-panel__search" type="text" placeholder="${escapeHtml(this.t("searchPlaceholder"))}">
    <button class="b3-button b3-button--outline pichost-panel__action" data-action="search">
        <svg><use xlink:href="#iconSearch"></use></svg>${escapeHtml(this.t("search"))}
    </button>
    <button class="b3-button b3-button--outline pichost-panel__action" data-action="refresh">
        <svg><use xlink:href="#iconRefresh"></use></svg>${escapeHtml(this.t("refresh"))}
    </button>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--outline pichost-panel__action" data-action="prev">${escapeHtml(this.t("prevPage"))}</button>
    <span class="pichost-panel__info"></span>
    <button class="b3-button b3-button--outline pichost-panel__action" data-action="next">${escapeHtml(this.t("nextPage"))}</button>
</div>
<div class="pichost-panel__grid fn__flex-1"></div>`;

        this.searchInputElement = this.opts.element.querySelector(".pichost-panel__search");
        this.gridElement = this.opts.element.querySelector(".pichost-panel__grid");
        this.infoElement = this.opts.element.querySelector(".pichost-panel__info");
        this.prevButtonElement = this.opts.element.querySelector('[data-action="prev"]');
        this.nextButtonElement = this.opts.element.querySelector('[data-action="next"]');

        this.searchInputElement.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                this.page = 1;
                this.load();
            }
        });
        this.opts.element.querySelector('[data-action="search"]').addEventListener("click", () => {
            this.page = 1;
            this.load();
        });
        this.opts.element.querySelector('[data-action="refresh"]').addEventListener("click", () => this.load());
        this.prevButtonElement.addEventListener("click", () => {
            if (this.page > 1) {
                this.page--;
                this.load();
            }
        });
        this.nextButtonElement.addEventListener("click", () => {
            if (this.page < this.totalPages) {
                this.page++;
                this.load();
            }
        });

        this.load();
    }

    private async load() {
        if (this.destroyed) {
            return;
        }
        this.infoElement.textContent = "";
        this.prevButtonElement.setAttribute("disabled", "disabled");
        this.nextButtonElement.setAttribute("disabled", "disabled");
        if (!this.opts.client.ready) {
            this.gridElement.innerHTML = `<div class="pichost-panel__status">${escapeHtml(this.t("missingToken"))}</div>`;
            return;
        }
        this.gridElement.innerHTML = `<div class="pichost-panel__status">${escapeHtml(this.t("loading"))}</div>`;
        try {
            const keyword = this.searchInputElement.value.trim();
            const result = keyword
                ? await this.opts.client.searchImages(keyword, this.page, this.limit)
                : await this.opts.client.listImages(this.page, this.limit);
            this.items = result.items || [];
            this.total = result.total || 0;
            this.totalPages = Math.max(1, result.totalPages || 1);
            this.page = Math.min(this.page, this.totalPages);
            this.renderGrid();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            this.gridElement.innerHTML = `<div class="pichost-panel__status">${escapeHtml(this.t("loadFail", {msg}))}</div>`;
        }
    }

    private renderGrid() {
        if (this.destroyed) {
            return;
        }
        this.infoElement.textContent = this.t("pageInfo", {page: this.page, totalPages: this.totalPages, total: this.total});
        this.prevButtonElement.removeAttribute("disabled");
        this.nextButtonElement.removeAttribute("disabled");

        if (this.items.length === 0) {
            this.gridElement.innerHTML = `<div class="pichost-panel__status">${escapeHtml(this.t("empty"))}</div>`;
            return;
        }

        this.gridElement.innerHTML = "";
        for (const item of this.items) {
            this.gridElement.append(this.renderCard(item));
        }
    }

    private renderCard(item: PichostImageItem): HTMLElement {
        const card = document.createElement("div");
        card.className = "pichost-panel__card";
        card.innerHTML = `<div class="pichost-panel__thumb">
    <img src="${escapeHtml(item.url)}" loading="lazy" alt="${escapeHtml(item.originalName)}">
</div>
<div class="pichost-panel__meta">
    <div class="pichost-panel__name" title="${escapeHtml(item.originalName)}">${escapeHtml(item.originalName)}</div>
    <div class="pichost-panel__sub">${escapeHtml(formatBytes(item.size))}</div>
</div>
<div class="pichost-panel__actions">
    <button class="b3-button b3-button--small" data-action="copyUrl">${escapeHtml(this.t("copyUrl"))}</button>
    <button class="b3-button b3-button--small" data-action="copyMarkdown">${escapeHtml(this.t("copyMarkdown"))}</button>
    <button class="b3-button b3-button--small" data-action="copyHtml">${escapeHtml(this.t("copyHtml"))}</button>
    <span class="fn__flex-1"></span>
    <button class="b3-button b3-button--small pichost-panel__danger" data-action="delete">
        <svg><use xlink:href="#iconTrashcan"></use></svg>
    </button>
</div>`;

        const notifyCopied = () => showMessage(this.t("copied"));
        card.querySelector('[data-action="copyUrl"]').addEventListener("click", async () => {
            if (await copyText(item.url)) {
                notifyCopied();
            }
        });
        card.querySelector('[data-action="copyMarkdown"]').addEventListener("click", async () => {
            const markdown = item.markdown || `![${item.originalName}](${item.url})`;
            if (await copyText(markdown)) {
                notifyCopied();
            }
        });
        card.querySelector('[data-action="copyHtml"]').addEventListener("click", async () => {
            const html = item.html || `<img src="${item.url}" alt="${item.originalName}">`;
            if (await copyText(html)) {
                notifyCopied();
            }
        });
        card.querySelector('[data-action="delete"]').addEventListener("click", () => {
            confirm("⚠️", this.t("confirmDelete", {name: item.originalName}), async () => {
                try {
                    await this.opts.client.deleteImage(item.key);
                    showMessage(this.t("deleted"));
                    this.load();
                } catch (e) {
                    showMessage(this.t("deleteFail", {msg: e instanceof Error ? e.message : String(e)}));
                }
            });
        });
        return card;
    }

    destroy() {
        this.destroyed = true;
        this.opts.element.innerHTML = "";
    }
}
