import {
    getAllEditor,
    IMenuBaseDetail,
    IOperation,
    Plugin,
    Setting,
    showMessage,
    openTab,
    getFrontend,
} from "siyuan";
import type {Custom, IProtyle, subMenu} from "siyuan";
import "./index.scss";
import {PichostClient, PichostConfig} from "./api";
import {collectLocalImages, deleteAssetFile, getLocalAssetPath, uploadAndReplaceImages} from "./uploader";
import {PichostPanel} from "./panel";

const STORAGE_NAME = "pichost-config";
const TAB_TYPE = "pichost_tab";
const PANEL_ICON = "iconImage";

/**
 * Tab 实例 → 面板实例的注册表。
 * destroy 回调的 this 指向 Tab 实例且不带参数,借此完成清理。
 */
const panelRegistry = new WeakMap<object, PichostPanel>();

/**
 * 默认配置。
 * 出于安全考虑不内置 API 密钥:首次使用请在 插件设置 中填入
 * 服务器地址与 API Token。
 */
const DEFAULT_CONFIG: PichostConfig = {
    serverUrl: "https://pichost.tools-online.site",
    token: "",
    autoUpload: false,
};

export default class PichostPlugin extends Plugin {
    private isMobile: boolean;

    // ── 自动上传状态 ──
    private autoObserver: MutationObserver | null = null;
    private autoTimer: number | null = null;
    private readonly autoQueue = new Set<HTMLImageElement>();
    /** 已完成初始渲染的编辑器:只有其中的新图片才算"用户插入",避免打开文档时误传已有图片 */
    private readonly readyProtyles = new WeakSet<object>();

    private get config(): PichostConfig {
        const stored = this.data[STORAGE_NAME] as PichostConfig;
        return {
            serverUrl: (stored?.serverUrl || DEFAULT_CONFIG.serverUrl).replace(/\/+$/, ""),
            token: stored?.token || DEFAULT_CONFIG.token,
            autoUpload: Boolean(stored?.autoUpload),
        };
    }

    private getClient() {
        return new PichostClient(this.config);
    }

    onload() {
        // 顶栏/页签直接使用思源原生 iconImage;这里按原样重复注册一份,
        // 作为低版本客户端缺少该 symbol 时的兜底(内容与原生完全一致,重复 id 无副作用)。
        this.addIcons(`<symbol id="iconImage" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
<rect width="18" height="18" x="3" y="3" rx="2" ry="2"></rect><circle cx="9" cy="9" r="2"></circle><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
</symbol>
<symbol id="iconPichostLink" viewBox="0 0 24 24">
<path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"></path>
</symbol>
<symbol id="iconPichostMd" viewBox="0 0 24 24">
<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3.5 6.5h17A1.5 1.5 0 0 1 22 8v8a1.5 1.5 0 0 1-1.5 1.5h-17A1.5 1.5 0 0 1 2 16V8a1.5 1.5 0 0 1 1.5-1.5z"></path>
<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M5.5 15V9l3 3.2 3-3.2v6"></path>
<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M16.5 9v6m0 0l-2.2-2.3m2.2 2.3l2.2-2.3"></path>
</symbol>
<symbol id="iconPichostHtml" viewBox="0 0 24 24">
<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M8.5 7l-5 5 5 5"></path>
<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M15.5 7l5 5-5 5"></path>
<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" d="M13.2 5.5l-2.4 13"></path>
</symbol>`);

        this.isMobile = getFrontend() === "mobile" || getFrontend() === "browser-mobile";
        this.data[STORAGE_NAME] = this.data[STORAGE_NAME] || {...DEFAULT_CONFIG};

        this.addTab({
            type: TAB_TYPE,
            init: (custom) => {
                // custom 为 Tab 实例;插件实例经闭包捕获,
                // 布局恢复重新 init 时也不依赖 openTab 传入的 data
                panelRegistry.set(custom, new PichostPanel({
                    element: custom.element as HTMLElement,
                    client: this.getClient(),
                    i18n: this.i18n,
                }));
            },
            destroy(this: Custom) {
                panelRegistry.get(this)?.destroy();
                panelRegistry.delete(this);
            },
        });

        this.addCommand({
            langKey: "openPanel",
            hotkey: "⇧⌘P",
            globalCallback: () => {
                this.openPanel();
            },
        });

        const serverInputElement = document.createElement("input");
        const tokenInputElement = document.createElement("input");
        // 测试按钮:用输入框中的当前值(未保存也可)验证地址与密钥
        const testButtonElement = document.createElement("button");
        testButtonElement.type = "button";
        testButtonElement.className = "b3-button b3-button--outline fn__flex-center fn__size200";
        testButtonElement.textContent = this.i18n.testConnection;
        testButtonElement.addEventListener("click", async () => {
            if (testButtonElement.hasAttribute("disabled")) {
                return;
            }
            testButtonElement.setAttribute("disabled", "disabled");
            const originalText = testButtonElement.textContent;
            testButtonElement.textContent = this.i18n.testing;
            try {
                const client = new PichostClient({
                    serverUrl: (serverInputElement.value.trim() || DEFAULT_CONFIG.serverUrl).replace(/\/+$/, ""),
                    token: tokenInputElement.value.trim(),
                    autoUpload: false,
                });
                if (!client.ready) {
                    showMessage(`[${this.name}] ${this.i18n.missingToken}`);
                    return;
                }
                const result = await client.listImages(1, 1);
                showMessage(`[${this.name}] ${this.i18n.testOk.replace("${total}", String(result.total ?? 0))}`);
            } catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                showMessage(`[${this.name}] ${this.i18n.testFail.replace("${msg}", msg)}`);
            } finally {
                testButtonElement.removeAttribute("disabled");
                testButtonElement.textContent = originalText;
            }
        });
        this.setting = new Setting({
            width: "600px",
            confirmCallback: () => {
                this.saveConfig(
                    serverInputElement.value.trim(),
                    tokenInputElement.value.trim(),
                    autoUploadToggleElement.checked,
                );
            },
        });
        this.setting.addItem({
            title: this.i18n.serverUrl,
            description: this.i18n.serverUrlDesc,
            createActionElement: () => {
                serverInputElement.type = "text";
                serverInputElement.className = "b3-text-field fn__flex-center fn__size200";
                serverInputElement.placeholder = "https://pichost.example.com";
                serverInputElement.value = this.config.serverUrl;
                return serverInputElement;
            },
        });
        this.setting.addItem({
            title: this.i18n.token,
            description: this.i18n.tokenDesc,
            createActionElement: () => {
                tokenInputElement.type = "password";
                tokenInputElement.className = "b3-text-field fn__flex-center fn__size200";
                tokenInputElement.placeholder = "Auth-Token";
                tokenInputElement.value = this.config.token;
                return tokenInputElement;
            },
        });
        this.setting.addItem({
            title: this.i18n.testConnection,
            description: this.i18n.testConnectionDesc,
            actionElement: testButtonElement,
        });
        // 自动上传开关:切换后立即保存,无需确认
        const autoUploadToggleElement = document.createElement("input");
        autoUploadToggleElement.type = "checkbox";
        autoUploadToggleElement.className = "b3-switch fn__flex-center";
        autoUploadToggleElement.checked = this.config.autoUpload;
        autoUploadToggleElement.addEventListener("change", () => {
            this.saveConfig(serverInputElement.value.trim(), tokenInputElement.value.trim(), autoUploadToggleElement.checked);
            showMessage(`[${this.name}] ${autoUploadToggleElement.checked ? this.i18n.autoUploadOn : this.i18n.autoUploadOff}`);
        });
        this.setting.addItem({
            title: this.i18n.autoUpload,
            description: this.i18n.autoUploadDesc,
            actionElement: autoUploadToggleElement,
        });

        this.eventBus.on("open-menu-image", this.onMenuImage);
        this.eventBus.on("open-menu-content", this.onMenuContent);
        this.eventBus.on("open-menu-breadcrumbmore", this.onMenuBreadcrumbMore);
        this.setupAutoUpload();
    }

    async onLayoutReady() {
        this.addTopBar({
            icon: PANEL_ICON,
            title: this.i18n.panelTitle,
            position: "right",
            callback: () => {
                this.openPanel();
            },
        });
        const loaded = await this.loadData(STORAGE_NAME).catch((): null => null);
        if (loaded) {
            this.data[STORAGE_NAME] = loaded;
        }
    }

    async onunload() {
        this.eventBus.off("open-menu-image", this.onMenuImage);
        this.eventBus.off("open-menu-content", this.onMenuContent);
        this.eventBus.off("open-menu-breadcrumbmore", this.onMenuBreadcrumbMore);
        this.eventBus.off("loaded-protyle-static", this.onProtyleLoaded);
        this.eventBus.off("loaded-protyle-dynamic", this.onProtyleLoaded);
        this.autoObserver?.disconnect();
        this.autoObserver = null;
        if (this.autoTimer) {
            window.clearTimeout(this.autoTimer);
            this.autoTimer = null;
        }
        this.autoQueue.clear();
    }

    async uninstall() {
        await this.removeData(STORAGE_NAME).catch(() => {
            // 忽略:数据可能本就不存在
        });
    }

    private openPanel() {
        openTab({
            app: this.app,
            custom: {
                icon: PANEL_ICON,
                title: this.i18n.panelTitle,
                id: this.name + TAB_TYPE,
            },
        });
    }

    // ── 自动上传:监视编辑器新增的本地资产图片,上传后替换为外链并删除本地副本 ──

    private setupAutoUpload() {
        this.eventBus.on("loaded-protyle-static", this.onProtyleLoaded);
        this.eventBus.on("loaded-protyle-dynamic", this.onProtyleLoaded);
        this.autoObserver = new MutationObserver((mutations) => {
            if (!this.config.autoUpload) {
                return;
            }
            for (const mutation of mutations) {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        return;
                    }
                    const el = node as HTMLElement;
                    if (el instanceof HTMLImageElement) {
                        this.enqueueAuto(el);
                    } else {
                        el.querySelectorAll?.("img").forEach((img) => this.enqueueAuto(img));
                    }
                });
            }
            if (this.autoQueue.size > 0) {
                this.scheduleAuto();
            }
        });
        this.autoObserver.observe(document.body, {childList: true, subtree: true});
    }

    private readonly onProtyleLoaded = (event: CustomEvent<{protyle: IProtyle}>) => {
        this.readyProtyles.add(event.detail.protyle);
    };

    private findProtyle(img: HTMLElement): IProtyle | null {
        for (const editor of getAllEditor()) {
            if (editor.protyle.wysiwyg.element.contains(img)) {
                return editor.protyle;
            }
        }
        return null;
    }

    private enqueueAuto(img: HTMLImageElement) {
        if (this.autoQueue.has(img)) {
            return;
        }
        if (img.getAttribute("data-pichost") || !getLocalAssetPath(img)) {
            return;
        }
        const protyle = this.findProtyle(img);
        if (!protyle || !this.readyProtyles.has(protyle) || protyle.disabled) {
            return;
        }
        this.autoQueue.add(img);
    }

    private scheduleAuto() {
        if (this.autoTimer) {
            window.clearTimeout(this.autoTimer);
        }
        this.autoTimer = window.setTimeout(() => {
            this.autoTimer = null;
            this.processAutoQueue();
        }, 600);
    }

    private async processAutoQueue() {
        const pending = [...this.autoQueue].filter((img) => img.isConnected && getLocalAssetPath(img));
        this.autoQueue.clear();
        if (!this.config.autoUpload || !this.getClient().ready || pending.length === 0) {
            return;
        }
        // 按所属编辑器分组,事务按编辑器提交
        const groups = new Map<IProtyle, HTMLImageElement[]>();
        for (const img of pending) {
            const protyle = this.findProtyle(img);
            if (!protyle || protyle.disabled) {
                continue;
            }
            const group = groups.get(protyle) || [];
            group.push(img);
            groups.set(protyle, group);
        }
        let success = 0;
        let fail = 0;
        let firstError: Error | undefined;
        const deletePaths: string[] = [];
        for (const [protyle, images] of groups) {
            const results = await uploadAndReplaceImages(this.getClient(), images);
            const ops: IOperation[] = [];
            const seenBlockIds = new Set<string>();
            for (const result of results) {
                if (!result.item) {
                    fail++;
                    firstError = firstError || result.error;
                    continue;
                }
                success++;
                deletePaths.push(result.assetPath);
                const blockElement = result.img.closest("[data-node-id]");
                const blockId = blockElement?.getAttribute("data-node-id");
                if (blockElement && blockId && !seenBlockIds.has(blockId)) {
                    seenBlockIds.add(blockId);
                    ops.push({id: blockId, data: blockElement.outerHTML, action: "update"});
                }
            }
            if (ops.length > 0) {
                protyle.getInstance().transaction(ops);
            }
        }
        // 引用已替换为外链,删除本地副本(失败静默,不影响使用)
        deletePaths.forEach((path) => {
            deleteAssetFile(path).catch(() => {
                // 忽略:个别内核版本可能限制删除,仅保留本地文件
            });
        });
        if (success > 0 && fail === 0) {
            showMessage(`[${this.name}] ${this.i18n.uploadDone.replace("${count}", success.toString())}`);
        } else if (fail > 0) {
            showMessage(`[${this.name}] ${
                this.i18n.uploadPartial
                    .replace("${success}", success.toString())
                    .replace("${fail}", fail.toString())
                    .replace("${msg}", firstError?.message || "")
            }`);
        }
    }

    private saveConfig(serverUrl: string, token: string, autoUpload = this.config.autoUpload) {
        const config: PichostConfig = {
            serverUrl: (serverUrl || DEFAULT_CONFIG.serverUrl).replace(/\/+$/, ""),
            token: token || DEFAULT_CONFIG.token,
            autoUpload,
        };
        this.saveData(STORAGE_NAME, config).then(() => {
            this.data[STORAGE_NAME] = config;
            showMessage(`[${this.name}] ${this.i18n.saved}`);
        }).catch((e) => {
            showMessage(`[${this.name}] save config fail: ${e.msg || e.message}`);
        });
    }

    /**
     * 上传并把引用替换为外链。
     * @param protyle 事件 detail 中的 IProtyle
     * @param images 目标 img 元素集合(本函数内部过滤出本地资产)
     */
    private async uploadToPichost(protyle: IProtyle, images: HTMLImageElement[]) {
        if (!this.getClient().ready) {
            showMessage(`[${this.name}] ${this.i18n.missingToken}`);
            return;
        }
        const targets = images.filter((img) => getLocalAssetPath(img));
        if (targets.length === 0) {
            showMessage(`[${this.name}] ${this.i18n.noLocalImages}`);
            return;
        }
        showMessage(`[${this.name}] ${this.i18n.uploading.replace("${count}", targets.length.toString())}`);
        const client = this.getClient();
        const results = await uploadAndReplaceImages(client, targets);
        // 按块去重收集更新:一个块可能包含多张图片,outerHTML 已包含块内全部替换结果
        const ops: IOperation[] = [];
        const seenBlockIds = new Set<string>();
        for (const result of results) {
            if (!result.item) {
                continue;
            }
            const blockElement = result.img.closest("[data-node-id]");
            const blockId = blockElement?.getAttribute("data-node-id");
            if (!blockId || seenBlockIds.has(blockId)) {
                continue;
            }
            seenBlockIds.add(blockId);
            ops.push({id: blockId, data: blockElement.outerHTML, action: "update"});
        }
        if (ops.length > 0) {
            protyle.getInstance().transaction(ops);
        }
        const success = results.filter((r) => r.item).length;
        const fail = results.length - success;
        if (fail === 0) {
            showMessage(`[${this.name}] ${this.i18n.uploadDone.replace("${count}", success.toString())}`);
        } else {
            const firstError = results.find((r) => r.error)?.error;
            showMessage(`[${this.name}] ${
                this.i18n.uploadPartial
                    .replace("${success}", success.toString())
                    .replace("${fail}", fail.toString())
                    .replace("${msg}", firstError?.message || "")
            }`);
        }
    }

    private readonly onMenuImage = (event: CustomEvent<IMenuBaseDetail>) => {
        const detail = event.detail;
        detail.menu.addItem({
            iconHTML: "",
            label: this.i18n.uploadImage,
            click: () => {
                const images: HTMLImageElement[] = [];
                const el = detail.element;
                if (el instanceof HTMLImageElement) {
                    images.push(el);
                } else {
                    el.querySelectorAll("img").forEach((img) => images.push(img));
                }
                this.uploadToPichost(detail.protyle, images);
            },
        });
    };

    private readonly onMenuContent = (event: CustomEvent<IMenuBaseDetail>) => {
        const detail = event.detail;
        detail.menu.addItem({
            iconHTML: "",
            label: this.i18n.uploadAllImages,
            click: () => {
                const wysiwygElement = detail.protyle?.wysiwyg?.element;
                if (!wysiwygElement) {
                    return;
                }
                this.uploadToPichost(detail.protyle, collectLocalImages(wysiwygElement));
            },
        });
    };

    private readonly onMenuBreadcrumbMore = (event: CustomEvent<{menu: subMenu, protyle: IProtyle}>) => {
        const detail = event.detail;
        detail.menu.addItem({
            iconHTML: "",
            label: this.i18n.uploadAllImages,
            click: () => {
                const wysiwygElement = detail.protyle?.wysiwyg?.element;
                if (!wysiwygElement) {
                    return;
                }
                this.uploadToPichost(detail.protyle, collectLocalImages(wysiwygElement));
            },
        });
    };
}
