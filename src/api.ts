/**
 * PicHost API 客户端。
 *
 * 文档: https://o96u.github.io/PicHost/guide/api.html
 * 鉴权: 请求头 `Auth-Token: <token>`(经实测确认,文档中的 `httpAuth-Token` 无效)。
 */
export interface PichostConfig {
    serverUrl: string;
    token: string;
    /** 开启后,插入文档的图片自动上传并删除本地副本 */
    autoUpload: boolean;
}

export interface PichostImageItem {
    key: string;
    url: string;
    originalName: string;
    contentType: string;
    size: number;
    uploadedAt: string;
    markdown: string;
    html: string;
    uploadSource: string;
}

export interface PichostListResult {
    items: PichostImageItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export class PichostError extends Error {
    constructor(public readonly code: string, message: string) {
        super(message);
    }
}

export class PichostClient {
    constructor(private readonly config: PichostConfig) {
    }

    /** Token 未配置时为 false,此时不应发起请求。 */
    get ready(): boolean {
        return Boolean(this.config.token);
    }

    private get baseUrl() {
        return this.config.serverUrl.replace(/\/+$/, "");
    }

    private static async unwrap(resp: Response): Promise<any> {
        let data: any;
        try {
            data = await resp.json();
        } catch (e) {
            throw new PichostError("INVALID_RESPONSE", `HTTP ${resp.status}: invalid JSON response`);
        }
        // 错误格式一: {error: true, data: {error: {code, message}}}
        const err = data?.data?.error;
        if (data?.error || err) {
            throw new PichostError(err?.code || "UNKNOWN", err?.message || data?.message || "Request failed");
        }
        // 错误格式二: {success: false, message}
        if (data?.success === false) {
            throw new PichostError(data?.code || "UNKNOWN", data?.message || "Request failed");
        }
        return data;
    }

    async listImages(page = 1, limit = 20): Promise<PichostListResult> {
        const resp = await fetch(
            `${this.baseUrl}/api/images?limit=${limit}&page=${page}`,
            {method: "GET", headers: {"Auth-Token": this.config.token}},
        );
        return await PichostClient.unwrap(resp);
    }

    async searchImages(q: string, page = 1, limit = 20): Promise<PichostListResult> {
        const resp = await fetch(
            `${this.baseUrl}/api/images/search?q=${encodeURIComponent(q)}&limit=${limit}&page=${page}`,
            {method: "GET", headers: {"Auth-Token": this.config.token}},
        );
        return await PichostClient.unwrap(resp);
    }

    async deleteImage(key: string): Promise<void> {
        const resp = await fetch(
            `${this.baseUrl}/api/images?key=${encodeURIComponent(key)}`,
            {method: "DELETE", headers: {"Auth-Token": this.config.token}},
        );
        await PichostClient.unwrap(resp);
    }

    async batchDelete(keys: string[]): Promise<void> {
        const resp = await fetch(`${this.baseUrl}/api/images/batch-delete`, {
            method: "POST",
            headers: {
                "Auth-Token": this.config.token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({keys}),
        });
        await PichostClient.unwrap(resp);
    }

    /**
     * 上传单个文件,返回第一个上传结果。
     * multipart 字段名固定为 `image`。
     */
    async upload(blob: Blob, filename: string): Promise<PichostImageItem> {
        const formData = new FormData();
        formData.append("image", new File([blob], filename, {type: blob.type || "application/octet-stream"}));
        const resp = await fetch(`${this.baseUrl}/api/images/upload`, {
            method: "POST",
            headers: {"Auth-Token": this.config.token},
            body: formData,
        });
        const data = await PichostClient.unwrap(resp);
        const item: PichostImageItem | undefined = data?.items?.[0];
        if (!item) {
            const firstError = data?.errors?.[0];
            throw new PichostError(
                "UPLOAD_FAILED",
                typeof firstError === "string" ? firstError : (firstError?.message || "No item in upload response"),
            );
        }
        return item;
    }
}
