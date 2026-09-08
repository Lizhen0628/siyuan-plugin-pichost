import type * as kernel from "siyuan/kernel";

/**
 * PicHost 是纯前端插件:所有功能通过浏览器 fetch 调用 PicHost REST API 完成,
 * 不需要内核端(goja)逻辑。
 *
 * 保留此文件是为了维持与 plugin-sample 模板一致的双端构建流程,
 * 构建产物 kernel.js 为空实现。
 */
class KernelPlugin {
    private readonly siyuan: kernel.ISiyuan = siyuan;

    constructor() {
        this.siyuan.plugin.lifecycle.onload = async () => {
            await this.siyuan.logger.info("pichost kernel plugin: nothing to do (frontend-only plugin)");
        };
    }
}

new KernelPlugin();
