import {
    IMenuBaseDetail,
    IOperation,
    Plugin,
    Setting,
    showMessage,
    openSetting,
    openTab,
    getFrontend,
} from "siyuan";
import type {Custom, IProtyle, subMenu} from "siyuan";
import "./index.scss";
import {PichostClient, PichostConfig} from "./api";
import {collectLocalImages, getLocalAssetPath, uploadAndReplaceImages} from "./uploader";
import {PichostPanel} from "./panel";

const STORAGE_NAME = "pichost-config";
const TAB_TYPE = "pichost_tab";
const PANEL_ICON = "iconPichost";

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
};

export default class PichostPlugin extends Plugin {
    private isMobile: boolean;

    private get config(): PichostConfig {
        const stored = this.data[STORAGE_NAME] as PichostConfig;
        return {
            serverUrl: (stored?.serverUrl || DEFAULT_CONFIG.serverUrl).replace(/\/+$/, ""),
            token: stored?.token || DEFAULT_CONFIG.token,
        };
    }

    private getClient() {
        return new PichostClient(this.config);
    }

    onload() {
        this.addIcons(`<symbol id="${PANEL_ICON}" viewBox="0 0 24 24">
<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"></path>
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

        const settingButtonElement = document.createElement("button");
        settingButtonElement.className = "b3-button b3-button--outline fn__flex-center fn__size200";
        settingButtonElement.textContent = this.i18n.openSetting;
        settingButtonElement.addEventListener("click", () => {
            openSetting(this.app);
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
                this.saveConfig(serverInputElement.value.trim(), tokenInputElement.value.trim());
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
        this.setting.addItem({
            title: this.i18n.settingActionTitle,
            description: this.i18n.settingActionDesc,
            actionElement: settingButtonElement,
        });

        this.eventBus.on("open-menu-image", this.onMenuImage);
        this.eventBus.on("open-menu-content", this.onMenuContent);
        this.eventBus.on("open-menu-breadcrumbmore", this.onMenuBreadcrumbMore);
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

    private saveConfig(serverUrl: string, token: string) {
        const config: PichostConfig = {
            serverUrl: (serverUrl || DEFAULT_CONFIG.serverUrl).replace(/\/+$/, ""),
            token: token || DEFAULT_CONFIG.token,
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
