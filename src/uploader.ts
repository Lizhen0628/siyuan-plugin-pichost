import {PichostClient, PichostImageItem} from "./api";

/**
 * 判断一个 img 的引用是否为思源本地资产(assets/)。
 * 外链(http/https)与空值都不算。
 */
export function getLocalAssetPath(img: HTMLImageElement): string | null {
    const path = img.getAttribute("data-src") || img.getAttribute("src") || "";
    if (!path || path.startsWith("http://") || path.startsWith("https://") || path.startsWith("data:")) {
        return null;
    }
    const normalized = path.startsWith("/") ? path.slice(1) : path;
    return normalized.startsWith("assets/") ? normalized : null;
}

/** 收集 root 下所有引用本地资产的 img 元素(按资产路径去重,保留首次出现的元素)。 */
export function collectLocalImages(root: HTMLElement): HTMLImageElement[] {
    const result: HTMLImageElement[] = [];
    const seen = new Set<string>();
    root.querySelectorAll("img").forEach((img: HTMLImageElement) => {
        const path = getLocalAssetPath(img);
        if (path && !seen.has(path)) {
            seen.add(path);
            result.push(img);
        }
    });
    return result;
}

/** 通过内核 API 读取本地资产文件。 */
export async function fetchAssetBlob(assetPath: string): Promise<Blob> {
    const resp = await fetch("/api/file/getFile", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({path: assetPath}),
    });
    if (!resp.ok) {
        throw new Error(`HTTP ${resp.status} while fetching ${assetPath}`);
    }
    return await resp.blob();
}

export interface UploadProgressItem {
    img: HTMLImageElement;
    assetPath: string;
    item?: PichostImageItem;
    error?: Error;
}

/**
 * 逐张上传并就地把 img 的 src / data-src 替换为图床外链。
 *
 * 不直接写块:调用方负责按块分组收集 outerHTML 并交给 protyle.transaction。
 * 替换成功后会给 img 打上 `data-pichost` 标记(key)。
 */
export async function uploadAndReplaceImages(
    client: PichostClient,
    images: HTMLImageElement[],
    onProgress?: (current: number, total: number, item: UploadProgressItem) => void,
): Promise<UploadProgressItem[]> {
    const results: UploadProgressItem[] = [];
    let current = 0;
    for (const img of images) {
        const assetPath = getLocalAssetPath(img);
        const entry: UploadProgressItem = {img, assetPath: assetPath || ""};
        current++;
        try {
            if (!assetPath) {
                throw new Error("not a local asset");
            }
            const blob = await fetchAssetBlob(assetPath);
            const filename = assetPath.split("/").pop() || "image.png";
            entry.item = await client.upload(blob, filename);
            img.setAttribute("src", entry.item.url);
            img.setAttribute("data-src", entry.item.url);
            img.setAttribute("data-pichost", entry.item.key);
        } catch (e) {
            entry.error = e instanceof Error ? e : new Error(String(e));
        }
        results.push(entry);
        onProgress?.(current, images.length, entry);
    }
    return results;
}
