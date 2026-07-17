// 在 MAIN 世界中运行的脚本，可以直接访问 window 对象

import { parsePackagingFromGoodsSize, pickNonPackagingShopAttributes } from '../utils/ozonGoodsSize'
import { collectGalleryUrls } from '../utils/ozonList/imageDownloadUtils'
import dataConverter from '../components/richTextEditor/utils/dataConverter.js'

class OzonConcurrentApiQueue {
    constructor(options) {
        const o = options || {};
        this.maxPerSecond = o.maxPerSecond != null ? o.maxPerSecond : 6;
        this.maxConcurrent = o.maxConcurrent != null ? o.maxConcurrent : 6;
        this.maxQueueSize = o.maxQueueSize != null ? o.maxQueueSize : 5000;
        this.queue = [];
        this.activeCount = 0;
        this.startTimestamps = [];
        this._rateMutex = Promise.resolve();
        // 全局冷却截止时间（429 退避用）：此刻早于它则一律不放行新请求 = 暂停整条队列
        this._cooldownUntil = 0;
    }

    /** 设置/延长全局冷却（429 退避）：冷却窗口内不放行任何新请求 */
    applyCooldown(ms) {
        const until = Date.now() + (Number(ms) || 0);
        if (until > this._cooldownUntil) this._cooldownUntil = until;
    }

    _pruneStarts(now) {
        const cutoff = now - 1000;
        this.startTimestamps = this.startTimestamps.filter(function (t) {
            return t > cutoff;
        });
    }

    _acquireRateSlot() {
        const self = this;
        self._rateMutex = self._rateMutex.then(function () {
            return new Promise(function (resolve) {
                function tryOne() {
                    const now = Date.now();
                    // 全局冷却（429 退避）：冷却窗口内一律不放行新请求，相当于暂停整条队列
                    if (self._cooldownUntil && now < self._cooldownUntil) {
                        setTimeout(tryOne, Math.max(1, self._cooldownUntil - now));
                        return;
                    }
                    self._pruneStarts(now);
                    if (self.startTimestamps.length < self.maxPerSecond) {
                        self.startTimestamps.push(Date.now());
                        resolve();
                        return;
                    }
                    const oldest = self.startTimestamps[0];
                    const wait = Math.max(1, 1000 - (now - oldest) + 1);
                    setTimeout(tryOne, wait);
                }
                tryOne();
            });
        });
        return self._rateMutex;
    }

    add(requestFn) {
        const self = this;
        return new Promise(function (resolve, reject) {
            if (self.queue.length >= self.maxQueueSize) {
                reject(new Error("Ozon API 队列已满"));
                return;
            }
            self.queue.push({ fn: requestFn, resolve: resolve, reject: reject });
            self._schedule();
        });
    }

    _schedule() {
        const self = this;
        while (self.queue.length > 0 && self.activeCount < self.maxConcurrent) {
            const task = self.queue.shift();
            if (!task) break;
            self.activeCount++;
            self._runTask(task);
        }
    }

    _runTask(task) {
        const self = this;
        self
            ._acquireRateSlot()
            .then(function () {
                return Promise.resolve(task.fn());
            })
            .then(
                function (result) {
                    task.resolve(result);
                },
                function (err) {
                    task.reject(err);
                }
            )
            .finally(function () {
                self.activeCount--;
                self._schedule();
            });
    }

    clear() {
        if (this.queue.length === 0) return;
        this.queue.forEach(function (t) {
            if (t && t.reject) {
                t.reject(new Error("页面切换,请求已取消"));
            }
        });
        this.queue = [];
    }
}
const bcsOzonEntrypointQueue = new OzonConcurrentApiQueue({
    // 对齐旧版 crawler.js 的 getBt 队列（50/50），急速上架变体 BFS 才能跑满并发；
    // 旧版进详情页即后台预热全部变体，这里同步把限速放开到 50/秒
    maxPerSecond: 50,
    maxConcurrent: 50,
});

// ===== 急速上架变体加载：分档限速 + 429 退避（正常 200 路径不受影响） =====
const QS_VARIANT_RATE_THRESHOLD = 100; // 变体数阈值：≤100 走 50/秒，>100 走 20/秒
const QS_RATE_FAST = 50;
const QS_RATE_SLOW = 20;
const QS_RATE_FLOOR = 5;                // 429 砍半降速的下限
const QS_BACKOFF_MIN_MS = 10000;        // 无 Retry-After 时的退避起步（10s）
const QS_BACKOFF_MAX_MS = 20000;        // 退避封顶（20s）
const QS_MAX_RETRY = 3;                 // 同一请求 429 重试上限

let _qsBlocked = false;     // 命中验证码/整页受限：彻底停，不再发/不重试
let _qsDroppedCount = 0;    // 因 429 重试超限被放弃的变体数（供"部分加载"提示）
let _qsLastRateDropAt = 0;  // 上次因 429 降速的时刻，避免一波并发 429 把速率瞬间砍到底

/** 按变体数量切换限速档位：≤100 → 50/秒；>100 → 20/秒（并发 maxConcurrent 不变，恒 50） */
function bcsApplyVariantRateByCount(count) {
    const n = Number(count) || 0;
    const target = n > QS_VARIANT_RATE_THRESHOLD ? QS_RATE_SLOW : QS_RATE_FAST;
    if (bcsOzonEntrypointQueue.maxPerSecond !== target) {
        bcsOzonEntrypointQueue.maxPerSecond = target;
    }
}

/** 复位单次操作的 429 瞬时状态（受限/放弃计数/冷却/降速时刻）。不动限速档位（由切档函数管）。
 *  每个独立操作（预热 / 弹窗加载 / 1688 采集）开始时调用，避免上一次的受限状态串味到下一次。 */
function bcsResetQsTransient() {
    _qsBlocked = false;
    _qsDroppedCount = 0;
    _qsLastRateDropAt = 0;
    bcsOzonEntrypointQueue._cooldownUntil = 0;
}

/** 解析 Retry-After 头（秒数或 HTTP 日期）→ 毫秒；解析不出返回 0 */
function bcsParseRetryAfterMs(raw) {
    if (!raw) return 0;
    const s = String(raw).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000;
    const t = Date.parse(s);
    if (!isNaN(t)) {
        const diff = t - Date.now();
        return diff > 0 ? diff : 0;
    }
    return 0;
}

/** 命中 429：暂停整条队列冷却 + 砍半降速（floor 5）。优先 Retry-After，否则 10s 起步、20s 封顶。 */
function bcsOn429(retryAfterMs, attempt) {
    const now = Date.now();
    // 一波并发 429 只降一次速（1s 内不重复砍），避免瞬间砍到底
    if (now - _qsLastRateDropAt > 1000) {
        _qsLastRateDropAt = now;
        bcsOzonEntrypointQueue.maxPerSecond = Math.max(
            QS_RATE_FLOOR,
            Math.floor(bcsOzonEntrypointQueue.maxPerSecond / 2),
        );
    }
    let waitMs = Number(retryAfterMs) || 0;
    if (waitMs <= 0) {
        waitMs = Math.min(QS_BACKOFF_MAX_MS, QS_BACKOFF_MIN_MS * Math.max(1, attempt));
    }
    bcsOzonEntrypointQueue.applyCooldown(waitMs);
}

/** 命中验证码/整页受限：置全停标志并清空队列，立即停止后续所有请求（对齐"立即全停、不重试"） */
function bcsHandleQsBlocked() {
    if (_qsBlocked) return;
    _qsBlocked = true;
    try { bcsOzonEntrypointQueue.clear(); } catch (e) { /* ignore */ }
}

/** 单次取数（不含重试/队列）。返回 { status: 200|429|'blocked'|number, res, retryAfterMs } */
function bcsGetBtFetchOnce(sku) {
    return new Promise(function (resolve) {
        let url = "https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2F" + sku;
        if (window.location.href.indexOf("ozon.kz") != -1) {
            url = "https://ozon.kz/api/entrypoint-api.bx/page/json/v2?url=%2Fproduct%2F" + sku;
        }
        const xhr = new XMLHttpRequest();
        let settled = false;
        function done(r) { if (settled) return; settled = true; resolve(r); }
        xhr.open("GET", url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            const status = xhr.status;
            if (status === 429) {
                done({ status: 429, retryAfterMs: bcsParseRetryAfterMs(xhr.getResponseHeader('Retry-After')) });
                return;
            }
            if (status === 403) { done({ status: 'blocked' }); return; }
            if (status >= 200 && status < 300) {
                const text = xhr.responseText || '';
                // 正常 v2 返回 JSON；若返回的是 HTML（挑战/验证码页）则判为受限
                if (/^\s*</.test(text)) { done({ status: 'blocked' }); return; }
                let res = null;
                try { res = JSON.parse(text); }
                catch (e) { console.error("[Ozon API] getBt解析响应JSON失败:", sku, e); }
                done({ status: 200, res: res });
                return;
            }
            console.error("[Ozon API] getBt失败:", sku, status, xhr.statusText);
            done({ status: status || 0 });
        };
        xhr.onerror = function () {
            console.error("[Ozon API] getBt失败:", sku, "network error");
            done({ status: 0 });
        };
        xhr.send();
    });
}

/** 从一次 v2 响应里解析出兄弟变体 SKU（用于 BFS 递归） */
function bcsParseChildSkus(res) {
    const childSkus = [];
    if (!res || !res.widgetStates) return childSkus;
    const keys = Object.keys(res.widgetStates);
    const regex = /^webAspects-\d+-default-1$/;
    for (let ki = 0; ki < keys.length; ki++) {
        const key = keys[ki];
        if (!regex.test(key)) continue;
        try {
            const ws = JSON.parse(res.widgetStates[key]);
            const aspects = ws.aspects || [];
            for (let i = 0; i < aspects.length; i++) {
                const variants = aspects[i].variants || [];
                for (let o = 0; o < variants.length; o++) {
                    const v = variants[o];
                    if (v && v.sku) childSkus.push(v.sku);
                }
            }
        } catch (e2) {
            console.error("getBtparse webAspects", e2);
        }
        break;
    }
    return childSkus;
}

const _btFetchedSkus = [] //标记已采集的sku
let _btInFlight = 0; // 在途（排队中+请求中）的 getBt 数量，对齐旧版 _btPendingCount，供 bcsWhenBtIdle 判定
function getBt(sku, skipRecursive) {
    const noRecurse = !!skipRecursive;
    return new Promise(function (resolve, reject) {
        if (_btFetchedSkus[sku]) {
            resolve();
            return;
        }
        if (_qsBlocked) {           // 已被风控全停：直接短路，不再发请求
            resolve();
            return;
        }
        _btFetchedSkus[sku] = true;
        _btInFlight++;
        let _decremented = false;
        function _btDec() {
            if (_decremented) return;
            _decremented = true;
            _btInFlight--;
            // 兜底：实际已拉取超过阈值（多维变体首屏少报时），确保降到 20/秒
            if (_productResponses.length > QS_VARIANT_RATE_THRESHOLD) {
                bcsApplyVariantRateByCount(_productResponses.length);
            }
            // 每完成一个变体请求即上报进度（无论成功/失败），让进度条能走到 100%（对齐旧版 complete 回调）
            if (_qsProgressActive) {
                if (_qsProgressTotal === 0) _qsComputeTotalFromFirstResponse();
                _qsEmitProgress();
            }
        }

        // 单次取数 + 429 退避重试（≤QS_MAX_RETRY 次）。正常 200 路径与原逻辑等价。
        let attempt = 0;
        function runAttempt() {
            return bcsOzonEntrypointQueue.add(function () {
                return bcsGetBtFetchOnce(sku);
            }).then(function (r) {
                if (_qsBlocked) return [];
                if (r.status === 'blocked') {
                    // 验证码/整页受限：立即全停，不重试
                    bcsHandleQsBlocked();
                    return [];
                }
                if (r.status === 429) {
                    attempt++;
                    if (attempt > QS_MAX_RETRY) {
                        _qsDroppedCount++;   // 重试超限，放弃该条（不无限循环）
                        return [];
                    }
                    bcsOn429(r.retryAfterMs, attempt);
                    return runAttempt();     // 冷却由队列 cooldown 挡住，到点自动重试
                }
                if (r.status === 200 && r.res) {
                    _productResponses.push({ sku: sku, res: r.res });
                    return bcsParseChildSkus(r.res);
                }
                return [];                   // 其它错误：与原逻辑一致，跳过该条
            });
        }

        runAttempt().then(function (childSkus) {
            _btDec();
            if (_qsBlocked || noRecurse || !childSkus || !childSkus.length) return;
            return Promise.all(childSkus.map(function (childSku) {
                return getBt(childSku, noRecurse);
            }));
        }).then(function () {
            resolve();
        }).catch(function (err) {
            console.error("getBt队列错误:", err);
            _btDec();
            resolve();
        });
    });
}

/** 单次取「全量变体」模态数据（/modal/aspectsNew，含"展示全部"里隐藏的变体）。
 *  返回结构与 bcsGetBtFetchOnce 一致：{ status: 200|429|'blocked'|number, res, retryAfterMs } */
function bcsGetBtdFetchOnce(sku) {
    return new Promise(function (resolve) {
        let url = "https://www.ozon.ru/api/entrypoint-api.bx/page/json/v2?url=%2Fmodal%2FaspectsNew%3Fproduct_id%3D" + sku;
        if (window.location.href.indexOf("ozon.kz") != -1) {
            url = "https://ozon.kz/api/entrypoint-api.bx/page/json/v2?url=%2Fmodal%2FaspectsNew%3Fproduct_id%3D" + sku;
        }
        const xhr = new XMLHttpRequest();
        let settled = false;
        function done(r) { if (settled) return; settled = true; resolve(r); }
        xhr.open("GET", url, true);
        xhr.onreadystatechange = function () {
            if (xhr.readyState !== 4) return;
            const status = xhr.status;
            if (status === 429) {
                done({ status: 429, retryAfterMs: bcsParseRetryAfterMs(xhr.getResponseHeader('Retry-After')) });
                return;
            }
            if (status === 403) { done({ status: 'blocked' }); return; }
            if (status >= 200 && status < 300) {
                const text = xhr.responseText || '';
                if (/^\s*</.test(text)) { done({ status: 'blocked' }); return; }
                let res = null;
                try { res = JSON.parse(text); }
                catch (e) { console.error("[Ozon API] getBtd解析响应JSON失败:", sku, e); }
                done({ status: 200, res: res });
                return;
            }
            done({ status: status || 0 });
        };
        xhr.onerror = function () { done({ status: 0 }); };
        xhr.send();
    });
}

/** 从 /modal/aspectsNew 响应里解析出全量变体 SKU（含隐藏变体），用于喂入既有 BFS。
 *  与 bcsParseChildSkus 的区别：匹配 webAspectsModal（而非 webAspects-N-default-1），且不 break（modal 可能有多个 key）。 */
function bcsParseModalChildSkus(res) {
    const childSkus = [];
    if (!res || !res.widgetStates) return childSkus;
    const keys = Object.keys(res.widgetStates);
    for (let ki = 0; ki < keys.length; ki++) {
        const key = keys[ki];
        if (key.indexOf("webAspectsModal") === -1) continue;
        try {
            const ws = JSON.parse(res.widgetStates[key]);
            const aspects = ws.aspects || [];
            for (let i = 0; i < aspects.length; i++) {
                const variants = aspects[i].variants || [];
                for (let o = 0; o < variants.length; o++) {
                    const v = variants[o];
                    if (v && v.sku) childSkus.push(v.sku);
                }
            }
        } catch (e2) {
            console.error("getBtd parse webAspectsModal", e2);
        }
    }
    return childSkus;
}

// 已发起过 modal/aspectsNew 的主 SKU → 其 promise（去重 + 让并发/预热调用能 await 首次完成）
const _btdPromises = {};
/**
 * 拉取 /modal/aspectsNew 全量变体（对齐旧插件 crawler.js:getBtd），把发现的每个变体 SKU 交给
 * getBt 进入既有 BFS/缓存管线，补齐 /product 首屏 webAspects 被截断/分页而漏掉的隐藏变体
 * （即"展示全部"按钮里的变体）。设计要点：
 *   - 仅对主 SKU 调用；按 _btdPromises 去重，二次调用复用同一 promise（并发/预热安全）。
 *   - 复用同一限速队列与 429 退避；但 modal 为最佳努力增强，任何非 200（含 HTML/403）一律
 *     安静降级、绝不触发全局风控停机（bcsHandleQsBlocked），避免无变体商品的异常响应误杀主采集队列。
 *   - 返回的 promise resolve 前，已把发现的变体同步交给 getBt（_btInFlight 已计入），
 *     故调用方 `await getBtd(sku); await bcsWhenBtIdle();` 可确保隐藏变体被完整拉取。
 */
function getBtd(sku) {
    const key = String(sku || '').trim();
    if (!key) return Promise.resolve();
    if (_qsBlocked) return Promise.resolve();
    if (_btdPromises[key]) return _btdPromises[key];

    let attempt = 0;
    function runAttempt() {
        return bcsOzonEntrypointQueue.add(function () {
            return bcsGetBtdFetchOnce(key);
        }).then(function (r) {
            if (_qsBlocked) return [];
            if (r.status === 429) {
                attempt++;
                if (attempt > QS_MAX_RETRY) return [];
                bcsOn429(r.retryAfterMs, attempt);
                return runAttempt();
            }
            if (r.status === 200 && r.res && r.res.widgetStates) {
                return bcsParseModalChildSkus(r.res);
            }
            return []; // 403/HTML/其它错误：安静降级为"无隐藏变体"，回退到仅可见变体（不触发全局停机）
        });
    }

    const p = runAttempt().then(function (childSkus) {
        if (_qsBlocked || !childSkus || !childSkus.length) return;
        // 同步把隐藏变体交给既有 BFS 管线；getBt 内部按 _btFetchedSkus 去重（与可见变体不重复拉）
        childSkus.forEach(function (childSku) { getBt(childSku); });
    }).catch(function (err) {
        console.error("getBtd队列错误:", err);
    });
    _btdPromises[key] = p;
    return p;
}

// ============================================================================
// 变体数据组装模块（前端版）
// ============================================================================
// 对齐 python `spider.py` 的结构，生成全局变量 window.editUploadData
// 仅依赖：当前页面 DOM、entrypoint-api 的 widgetStates，以及 sku/url 参数
//
// 数据来源优先级：
//   1. 当前页面 DOM（零网络开销）—— gallery、category、aspects、lastDescription
//   2. getBt缓存（_productResponses）—— 进入详情页时 index.js 自动触发 getBt，
//      其响应通过 onProductAspectsResponse注入到本模块缓存
//   3. BFS 补齐 —— 缓存中未覆盖的变体 SKU，通过 /product/{sku} JSON API 逐层拉取
//   4. fetchDetailApiForCommon兜底 —— 拉取 Ozon Page 2 widgets（characteristics/
//      description/tags），利用 nextPage URL 链式请求
//
// 最终输出结构 (window.editUploadData):
// {
//   scene, sku, url,
//   rows: [{ cover_image, title, sku, price, old_price, images, video_cover, variantAttr }],
//   category, common_attributes, description, lastDescriptionCategoryNameOrTypeName, tags
// }
// ============================================================================


// ==========================================================================
// 工具函数
// ==========================================================================

/**
 * 安全的 JSON.parse 封装，解析失败时返回 fallback
 * @param {string} str      - 待解析的 JSON 字符串
 * @param {*}      fallback - 解析失败时的默认值
 * @returns {*}
 */
function safeJsonParse(str, fallback) {
    return JSON.parse(str);
    // try {
    // } catch (e) {
    //     return fallback;
    // }
}

/**
 * 递归解析 Ozon widgetStates 中的值
 * Ozon 的 widgetStates 值可能是：字符串（需 JSON.parse）→ 再嵌套字符串 → 最终对象
 * 最多尝试 3 层解析，直到拿到对象或放弃
 * @param {*} raw - widgetStates 中的原始值
 * @returns {Object|null}
 */
function parseStateValue(raw) {
    let current = raw;
    for (let i = 0; i < 3; i++) {
        if (current && typeof current === "object") {
            return current;
        }
        if (typeof current !== "string") {
            return null;
        }
        current = safeJsonParse(current, null);
        if (current === null) {
            return null;
        }
    }
    return current && typeof current === "object" ? current : null;
}

/**
 * 确保 retData.rows 中存在指定 SKU 的行数据，不存在则创建空行
 * @param {Object} retData - 全局返回数据
 * @param {string} sku     - 商品 SKU
 * @returns {Object} 该 SKU 对应的行对象
 */
function ensureRow(retData, sku) {
    if (!retData.rows) retData.rows = [];
    let row = retData.rows.find(function (r) {
        return r && r.sku === sku;
    });
    if (!row) {
        row = {
            cover_image: "",
            title: "",
            sku: sku,
            price: "",
            old_price: "",
            images: [],
            video_cover: [],
            video_poster: [],
            variantAttr: [],
        };
        retData.rows.push(row);
    }
    return row;
}

/**
 * 向行数据追加变体属性（如颜色、尺码等），自动去重
 * @param {Object} row       - 行数据对象
 * @param {string} typeName  - 属性类型名（如 "Цвет"、"Размер"）
 * @param {string} valueText - 属性值文本（如 "Красный"、"XL"）
 */
function appendVariantAttr(row, typeName, valueText) {
    if (!typeName) return;
    if (!row.variantAttr) row.variantAttr = [];
    let attr = row.variantAttr.find(function (a) {
        return a && a.name === typeName;
    });
    if (!attr) {
        attr = { name: typeName, value: [] };
        row.variantAttr.push(attr);
    }
    if (valueText && attr.value.indexOf(valueText) === -1) {
        attr.value.push(valueText);
    }
}

// ==========================================================================
// DOM 解析函数（零网络开销，直接读取当前页面 DOM）
// ==========================================================================

/** 规范化 Ozon 图片 URL 用于去重比较（strip ?/#、wc 尺寸段） */
function _bcsGalleryUrlKey(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return '';
    const base = imageUrl.split('?')[0].split('#')[0];
    return base.replace(/\/wc\d+\//, '/');
}

/** 从轮播数组中剔除与封面相同的 URL，避免 cover_image 与 images[0] 重复 */
function _bcsDedupCarouselAgainstCover(coverImage, images) {
    const coverKey = _bcsGalleryUrlKey(coverImage);
    if (!coverKey) return images || [];
    return (images || []).filter(function (url) {
        return _bcsGalleryUrlKey(url) !== coverKey;
    });
}

/**
 * 从当前页面 DOM 的 webGallery 元素中解析主 SKU 的图片/视频
 * 读取 [id*='state-webGallery'] 元素的 data-state 属性
 * @param {string} mainSku - 主商品 SKU
 * @param {Object} retData - 全局返回数据
 */
function parseGalleryFromDom(mainSku, retData) {
    const webGallery = document.querySelector("[id*='state-webGallery']");
    if (!webGallery) {
        return;
    }
    const stateStr = webGallery.getAttribute("data-state") || "";
    const jState = safeJsonParse(stateStr, {});
    const coverImage = jState.coverImage || "";
    const images = (jState.images || []).map(function (img) {
        return img && img.src;
    }).filter(Boolean);
    const videos = (jState.videos || []).map(function (v) {
        return v && v.url;
    }).filter(Boolean);
    const videoPosters = (jState.videos || []).map(function (v) {
        return v && (v.cover || v.preview || v.poster || v.thumbnail || v.coverUrl || v.previewUrl || "");
    }).filter(Boolean);

    const row = ensureRow(retData, mainSku);
    const resolvedCover = coverImage || (images[0] || "");
    if (!row.cover_image) row.cover_image = resolvedCover;
    // Ozon webGallery 的 coverImage 与 images[0] 常为同一张图，轮播中剔除封面避免下游重复
    if (!row.images || !row.images.length) row.images = _bcsDedupCarouselAgainstCover(resolvedCover, images);
    if (!row.video_cover || !row.video_cover.length) row.video_cover = videos;
    if (!row.video_poster || !row.video_poster.length) row.video_poster = videoPosters;
}

/**
 * 从当前页面 DOM 的 innerHTML 中提取商品类目层级
 * 正则匹配 "hierarchy":"..." 字段，按 \\u002F 分割为类目数组
 * @param {Object} retData - 全局返回数据
 */
function parseCategoryFromHtml(retData) {
    const html = document.documentElement && document.documentElement.innerHTML;
    if (!html) return;
    const match = html.match(/"hierarchy":"(.*?)"/);
    if (!match) return;
    const raw = match[1];
    const parts = raw.split(/\\u002F/g).filter(function (x) {
        return x;
    });
    if (!retData.category || !retData.category.length) {
        retData.category = parts;
    }
}

// ==========================================================================
// API widgetStates 解析函数
// ==========================================================================

/**
 * 从 entrypoint-api 响应的 widgetStates 中解析变体规格属性
 * 根据 aspectTypePrefix 匹配不同的 key：
 *   - "modal" → 匹配包含 "webAspectsModal" 的 key
 *   - "product" → 匹配 webAspects-{数字}-default-1 格式的 key
 * 提取每个变体的 SKU、规格属性（颜色/尺码等）、价格、标题
 *
 * @param {Object} widgetStates    - API 响应中的 widgetStates 对象
 * @param {string} targetSku       - 当前目标 SKU
 * @param {Object} retData         - 全局返回数据
 * @param {string} aspectTypePrefix - "modal" 或 "product"，决定 key 匹配规则
 */
function parseAspectsFromWidgetStates(widgetStates, targetSku, retData, aspectTypePrefix) {
    if (!widgetStates) return;
    Object.keys(widgetStates).forEach(function (key) {
        // 根据类型前缀过滤 widgetStates 的 key
        if (aspectTypePrefix === "modal") {
            if (key.indexOf("webAspectsModal") === -1) return;
        } else {
            if (!/^webAspects-\d+-default-1$/.test(key)) return;
        }
        const obj = parseStateValue(widgetStates[key]);
        if (!obj || !obj.aspects) return;

        obj.aspects.forEach(function (aspect) {
            // 从 descriptionRs 提取规格类型名称（如 "Цвет:"、"Размер:"）
            const rs = aspect.descriptionRs || [];
            let rsType = "";
            rs.forEach(function (item) {
                if (item.type === "textGray") {
                    rsType = (item.content || "").replace(/[:：]\s*$/, "").trim();
                }
            });

            // 遍历该规格维度下所有变体选项
            const variants = aspect.variants || [];
            variants.forEach(function (variant) {
                const sku = variant.sku;
                const row = ensureRow(retData, sku);
                const data = variant.data || {};

                // 拼接变体规格属性值文本
                const textRs = data.textRs || [];
                const rsValues = textRs.map(function (it) {
                    return it && it.content;
                }).filter(Boolean);
                const attrValue = rsValues.join(" ");
                appendVariantAttr(row, rsType, attrValue);

                // 填充价格、原价、标题
                if (data.price) row.price = data.price;
                if (data.originalPrice) row.old_price = data.originalPrice;
                if (data.title) row.title = data.title;
            });
        });
    });
}

/**
 * 从 widgetStates 中的 webCharacteristics 数据解析公共属性（品牌、材质等）
 * 将 characteristics 中的 short 和 long 属性提取为 { name, value[] } 数组
 * @param {Object} jData   - 已解析的 widgetStates 值对象，需含 characteristics 数组
 * @param {Object} retData - 全局返回数据，结果写入 retData.common_attributes
 */
function parseCommonAttributesFromCharacteristics(jData, retData) {
    if (!jData || !jData.characteristics) return;
    const commonAttributes = [];
    jData.characteristics.forEach(function (c) {
        // 解析 short 属性组（简要属性）
        (c.short || []).forEach(function (item) {
            const attr = { name: item.name || "", value: [] };
            (item.values || []).forEach(function (v) {
                if (v && v.text) attr.value.push(v.text);
            });
            if (attr.name) commonAttributes.push(attr);
        });
        // 解析 long 属性组（详细属性）
        (c.long || []).forEach(function (item) {
            const attr2 = { name: item.name || "", value: [] };
            (item.values || []).forEach(function (v) {
                if (v && v.text) attr2.value.push(v.text);
            });
            if (attr2.name) commonAttributes.push(attr2);
        });
    });
    if (commonAttributes.length) {
        retData.common_attributes = commonAttributes;
    }
}

/**
 * 从 characteristics 中提取商品类型文本（key 为 "Type_0" 的值）
 * 用于填充 lastDescriptionCategoryNameOrTypeName 字段
 * @param {Array} characteristics - webCharacteristics 中的 characteristics 数组
 * @returns {string} 类型文本，未找到返回空字符串
 */
function extractTypeOrCountryTextFromCharacteristics(characteristics) {
    if (!Array.isArray(characteristics)) return "";
    for (let i = 0; i < characteristics.length; i++) {
        const c = characteristics[i];
        // 收集所有可能包含 Type_0 的值组（values / short / long）
        const valueGroups = [];
        if (Array.isArray(c && c.values)) valueGroups.push(c.values);
        if (Array.isArray(c && c.short)) {
            c.short.forEach(function (item) {
                if (Array.isArray(item && item.values)) valueGroups.push(item.values);
            });
        }
        if (Array.isArray(c && c.long)) {
            c.long.forEach(function (item) {
                if (Array.isArray(item && item.values)) valueGroups.push(item.values);
            });
        }

        // 在所有值组中查找 key === "Type_0" 的条目
        for (let j = 0; j < valueGroups.length; j++) {
            const values = valueGroups[j];
            for (let k = 0; k < values.length; k++) {
                const value = values[k];
                if (!value || !value.text) continue;
                if (value.key === "Type_0") {
                    return String(value.text);
                }
            }
        }
    }
    return "";
}

/**
 * 从 API widgetStates 中解析指定 SKU 的图片画廊数据
 * 匹配 key 含 "webGallery" 或具备 coverImage/images/videos 结构的节点
 * @param {string} targetSku   - 目标 SKU，图片将关联到该 SKU 的行数据
 * @param {Object} widgetStates - API 响应的 widgetStates
 * @param {Object} retData      - 全局返回数据
 */
function parseGalleryFromWidgetStates(targetSku, widgetStates, retData) {
    if (!widgetStates) return;
    Object.keys(widgetStates).forEach(function (key) {
        const raw = widgetStates[key];
        const jData = parseStateValue(raw);
        if (!jData || typeof jData !== "object") return;

        // 通过 key 名称或数据结构判断是否为 gallery 数据
        const hasGalleryKey = key.indexOf("webGallery") !== -1;
        const hasGalleryShape = !!(jData.coverImage || Array.isArray(jData.images) || Array.isArray(jData.videos));
        if (!hasGalleryKey && !hasGalleryShape) return;

        const row = ensureRow(retData, targetSku);
        const coverImage = jData.coverImage || "";
        const images = (jData.images || []).map(function (img) {
            return img && (img.src || img.url);
        }).filter(Boolean);
        const videos = (jData.videos || []).map(function (v) {
            return v && (v.url || v.src);
        }).filter(Boolean);
        const videoPosters = (jData.videos || []).map(function (v) {
            return v && (v.cover || v.preview || v.poster || v.thumbnail || v.coverUrl || v.previewUrl || "");
        }).filter(Boolean);

        // 仅在行数据中尚未设置时填充，避免覆盖
        if (!row.cover_image && coverImage) row.cover_image = coverImage;
        const effectiveCover = row.cover_image || coverImage;
        if ((!row.images || !row.images.length) && images.length) {
            row.images = _bcsDedupCarouselAgainstCover(effectiveCover, images);
        }
        if ((!row.video_cover || !row.video_cover.length) && videos.length) row.video_cover = videos;
        if ((!row.video_poster || !row.video_poster.length) && videoPosters.length) row.video_poster = videoPosters;
    });
}

/**
 * 判断描述数据是否是 Описание（商品描述）而非 Комплектация（套装）
 * 通过检查 richAnnotationJson 中的标题或内容特征来判断
 * @param {Object} jData - widgetState 解析后的数据
 * @returns {boolean} 是否是 Описание
 */
function isDescriptionOpisanie(jData) {
    if (!jData) return false;

    // 1. 检查 richAnnotationJson 中的标题
    if (jData.richAnnotationJson && typeof jData.richAnnotationJson === "object") {
        // 检查是否有 title 或 header 字段包含 Описание
        const jsonStr = JSON.stringify(jData.richAnnotationJson);
        if (jsonStr.indexOf("Описание") !== -1 && jsonStr.indexOf("Комплектация") === -1) {
            return true;
        }
        if (jsonStr.indexOf("Комплектация") !== -1) {
            return false;
        }
    }

    // 2. 检查 richAnnotation 文本内容
    if (typeof jData.richAnnotation === "string") {
        const text = jData.richAnnotation;
        // Комплектация 通常是列表形式，以 "•" 或 "-" 开头
        const listItemCount = (text.match(/^[\s]*[•\-\*]/gm) || []).length;
        if (listItemCount >= 2) {
            // 如果有很多列表项，可能是 Комплектация
            return false;
        }
        // 如果文本较长且没有列表项，更可能是 Описание
        if (text.length > 100 && listItemCount === 0) {
            return true;
        }
    }

    // 3. 检查 characteristics
    if (Array.isArray(jData.characteristics) && jData.characteristics.length > 0) {
        // 如果有 characteristics，可能是 Комплектация
        return false;
    }

    // 默认返回 true（优先认为是 Описание）
    return true;
}

/**
 * 从 API widgetStates 中解析公共信息（Page 2 数据）
 * 包含：common_attributes（webCharacteristics）、description（webDescription）、
 *       tags（webHashtags）、lastDescriptionCategoryNameOrTypeName
 *
 * Ozon 产品页数据分两页加载：
 *   Page 1 — gallery、aspects、price（getBt 返回的数据）
 *   Page 2 — characteristics、description、hashtags（需要通过 nextPage URL 获取）
 *
 * @param {Object} widgetStates - API 响应的 widgetStates（应来自 Page 2）
 * @param {Object} retData      - 全局返回数据
 */
function parseCommonFromApiWidgetStates(widgetStates, retData) {
    if (!widgetStates) return;
    let foundCommon = false;
    let foundDescription = false;
    let foundTags = false;
    let hasLastDescriptionCategory = !!String(retData.lastDescriptionCategoryNameOrTypeName || "").trim();

    // 优先尝试固定 key 提取 lastDescriptionCategoryNameOrTypeName
    if (!hasLastDescriptionCategory) {
        const targetRaw = widgetStates["webCharacteristics-3282540-pdpPage2column-2"];
        if (typeof targetRaw !== "undefined") {
            const targetData = parseStateValue(targetRaw);
            const targetText = extractTypeOrCountryTextFromCharacteristics(targetData && targetData.characteristics);
            if (targetText) {
                retData.lastDescriptionCategoryNameOrTypeName = targetText;
                hasLastDescriptionCategory = true;
            }
        }
    }

    // 第一轮遍历：按 key 名称精确匹配提取各项数据
    // 优先查找包含 "Описание" 的 webDescription（商品描述），跳过 "Комплектация" 等其他区域
    const descriptionCandidates = []; // 存储所有候选描述

    Object.keys(widgetStates).forEach(function (key) {
        const raw = widgetStates[key];
        const jData = parseStateValue(raw);
        if (!jData || typeof jData !== "object") return;

        // 提取 common_attributes（公共属性，如品牌、材质、产地等）
        if (!foundCommon && (key.indexOf("webCharacteristics") !== -1 || Array.isArray(jData.characteristics))) {
            parseCommonAttributesFromCharacteristics(jData, retData);
            if (retData.common_attributes && retData.common_attributes.length) {
                foundCommon = true;
            }
        }

        // 提取 richAnnotationJson（独立于 description，避免被 foundDescription 跳过）
        if (!retData.richAnnotationJson && jData.richAnnotationJson) {
            if (typeof jData.richAnnotationJson === "object") {
                retData.richAnnotationJson = jData.richAnnotationJson;
            } else if (typeof jData.richAnnotationJson === "string") {
                retData.richAnnotationJson = safeJsonParse(jData.richAnnotationJson, null);
            }
        }

        // 提取 description（商品描述，优先 richAnnotation 富文本）
        // 收集所有候选，通过内容判断是否是 Описание
        if (key.indexOf("webDescription") !== -1 || typeof jData.richAnnotation === "string" || Array.isArray(jData.characteristics)) {
            // 提取 richAnnotationJson（富文本 JSON 对象）
            if (!retData.richAnnotationJson && jData.richAnnotationJson && typeof jData.richAnnotationJson === "object") {
                retData.richAnnotationJson = jData.richAnnotationJson;
            }

            // 收集候选描述
            if (typeof jData.richAnnotation === "string" && jData.richAnnotation) {
                // 通过内容判断：Комплектация 通常是列表形式，Описание 是段落文本
                // 或者检查 richAnnotationJson 中是否有标题信息
                const isOpisanie = isDescriptionOpisanie(jData);
                descriptionCandidates.push({
                    key: key,
                    description: jData.richAnnotation,
                    richAnnotationJson: jData.richAnnotationJson,
                    isOpisanie: isOpisanie,
                    priority: isOpisanie ? 1 : 2  // Описание 优先级更高
                });
            }
            // richAnnotation 不存在时，退而从 characteristics 的 content 拼接
            if (Array.isArray(jData.characteristics)) {
                const descParts = [];
                jData.characteristics.forEach(function (item) {
                    if (item && typeof item.content === "string" && item.content) {
                        descParts.push(item.content);
                    }
                });
                if (descParts.length) {
                    descriptionCandidates.push({
                        key: key,
                        description: descParts.join("\n"),
                        richAnnotationJson: jData.richAnnotationJson,
                        isOpisanie: false, // characteristics 默认不是 Описание
                        priority: 3
                    });
                }
            }
        }

        // 提取 tags（商品标签/hashtags）
        if (!foundTags && (key.indexOf("webHashtags") !== -1 || Array.isArray(jData.badges))) {
            const tags = [];
            (jData.badges || []).forEach(function (b) {
                if (b && b.text) tags.push(b.text);
            });
            if (tags.length) {
                retData.tags = tags;
                foundTags = true;
            }
        }

        // 兜底提取 lastDescriptionCategoryNameOrTypeName
        if (!hasLastDescriptionCategory && Array.isArray(jData.characteristics)) {
            const fallbackText = extractTypeOrCountryTextFromCharacteristics(jData.characteristics);
            if (fallbackText) {
                retData.lastDescriptionCategoryNameOrTypeName = fallbackText;
                hasLastDescriptionCategory = true;
            }
        }
    });

    // 选择最优描述：优先选择 Описание，如果没有则选择第一个
    if (descriptionCandidates.length > 0) {
        // 按优先级排序（Описание 优先）
        descriptionCandidates.sort(function (a, b) { return a.priority - b.priority; });
        const bestCandidate = descriptionCandidates[0];
        retData.description = bestCandidate.description;
        foundDescription = true;
        // 如果最优候选有 richAnnotationJson，也使用它
        if (bestCandidate.richAnnotationJson && !retData.richAnnotationJson) {
            retData.richAnnotationJson = bestCandidate.richAnnotationJson;
        }
    }

    // 第二轮遍历：对第一轮未找到的数据，放宽匹配条件再尝试一次
    // 同样优先选择包含 "Описание" 的描述
    if (!foundCommon || !foundDescription || !foundTags) {
        const fallbackDescriptionCandidates = [];

        Object.keys(widgetStates).forEach(function (key) {
            const raw = widgetStates[key];
            const jData = parseStateValue(raw);
            if (!jData || typeof jData !== "object") return;

            if (!foundCommon && Array.isArray(jData.characteristics)) {
                parseCommonAttributesFromCharacteristics(jData, retData);
                foundCommon = retData.common_attributes && retData.common_attributes.length;
            }
            // 收集第二轮的候选描述
            if (!foundDescription && typeof jData.richAnnotation === "string" && jData.richAnnotation) {
                const isOpisanie = isDescriptionOpisanie(jData);
                fallbackDescriptionCandidates.push({
                    key: key,
                    description: jData.richAnnotation,
                    richAnnotationJson: jData.richAnnotationJson,
                    isOpisanie: isOpisanie,
                    priority: isOpisanie ? 1 : 2
                });
            }
            if (!retData.richAnnotationJson && jData.richAnnotationJson) {
                if (typeof jData.richAnnotationJson === "object") {
                    retData.richAnnotationJson = jData.richAnnotationJson;
                } else if (typeof jData.richAnnotationJson === "string") {
                    retData.richAnnotationJson = safeJsonParse(jData.richAnnotationJson, null);
                }
            }
            if (!foundTags && Array.isArray(jData.badges)) {
                const tags = [];
                jData.badges.forEach(function (b) {
                    if (b && b.text) tags.push(b.text);
                });
                if (tags.length) {
                    retData.tags = tags;
                    foundTags = true;
                }
            }
            if (!hasLastDescriptionCategory && Array.isArray(jData.characteristics)) {
                const fallbackText2 = extractTypeOrCountryTextFromCharacteristics(jData.characteristics);
                if (fallbackText2) {
                    retData.lastDescriptionCategoryNameOrTypeName = fallbackText2;
                    hasLastDescriptionCategory = true;
                }
            }
        });

        // 第二轮选择最优描述
        if (!foundDescription && fallbackDescriptionCandidates.length > 0) {
            fallbackDescriptionCandidates.sort(function (a, b) { return a.priority - b.priority; });
            const bestFallback = fallbackDescriptionCandidates[0];
            retData.description = bestFallback.description;
            foundDescription = true;
            if (bestFallback.richAnnotationJson && !retData.richAnnotationJson) {
                retData.richAnnotationJson = bestFallback.richAnnotationJson;
            }
        }
    }
}

// ==========================================================================
// 基础数据构建 & 工具
// ==========================================================================

/**
 * 获取当前站点的基础域名（区分 ozon.ru 和 ozon.kz）
 * @returns {string} "https://www.ozon.ru" 或 "https://ozon.kz"
 */
function getHostBase() {
    return window.location.href.indexOf("ozon.kz") !== -1 ? "https://ozon.kz" : "https://www.ozon.ru";
}

/**
 * 将相对路径转为绝对 URL（自动拼接当前站点域名）
 * @param {string} urlOrPath - URL 或路径
 * @returns {string} 绝对 URL
 */
function absoluteUrl(urlOrPath) {
    if (!urlOrPath) return "";
    if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath;
    return getHostBase() + (urlOrPath.charAt(0) === "/" ? urlOrPath : ("/" + urlOrPath));
}

/**
 * 富文本图片 URL 规范化，避免相对路径在下游无法加载
 * @param {string} url
 * @returns {string}
 */
function normalizeRichTextImageUrl(url) {
    if (!url || typeof url !== "string") return "";
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("//")) return "https:" + trimmed;
    if (trimmed.startsWith("/")) return window.location.origin + trimmed;
    if (!/^https?:\/\//i.test(trimmed)) return absoluteUrl(trimmed);
    return trimmed;
}

/**
 * 解析富文本 JSON 为对象
 * @param {*} rawValue
 * @returns {Object|null}
 */
function parseRichAnnotationObject(rawValue) {
    if (rawValue == null) return null;
    if (typeof rawValue === "object") return rawValue;
    if (typeof rawValue !== "string") return null;
    try {
        return safeJsonParse(rawValue, null);
    } catch (error) {
        console.warn("解析 richAnnotationJson 字符串失败", error);
        return null;
    }
}

/**
 * 从 Ozon 竞品富内容（content[].blocks[].img）按顺序提取图片 URL
 * @param {Object} parsed - { content, version }
 * @returns {string[]}
 */
function extractImageUrlsFromOzonRichContent(parsed) {
    const urls = [];
    const content = parsed?.content;
    if (!Array.isArray(content)) return urls;

    content.forEach(function (widget) {
        if (!widget || typeof widget !== "object") return;

        // 竞品 raShowcase：blocks[].img
        if (Array.isArray(widget.blocks)) {
            widget.blocks.forEach(function (block) {
                if (!block?.img) return;
                const src = block.img.src || block.img.srcMobile;
                const normalized = normalizeRichTextImageUrl(src);
                if (normalized && urls.indexOf(normalized) === -1) {
                    urls.push(normalized);
                }
            });
            return;
        }

        // 内部 widgets 格式：items[].img
        if (Array.isArray(widget.items)) {
            widget.items.forEach(function (item) {
                if (!item?.img) return;
                const src = item.img.src || item.img.srcMobile;
                const normalized = normalizeRichTextImageUrl(src);
                if (normalized && urls.indexOf(normalized) === -1) {
                    urls.push(normalized);
                }
            });
        }
    });

    return urls;
}

/**
 * 解析富文本原始值为 widgets 数组（与 AiCollectModal.parseRichTextWidgets 一致）
 * @param {*} rawValue
 * @returns {Array|null}
 */
function parseRichTextWidgetsFromRaw(rawValue) {
    const parsed = parseRichAnnotationObject(rawValue);
    if (!parsed) return rawValue == null ? [] : null;
    try {
        const converted = dataConverter.smartConvert(parsed, "our");
        return Array.isArray(converted?.widgets) ? converted.widgets : [];
    } catch (error) {
        console.warn("解析 richAnnotationJson 失败", error);
        return null;
    }
}

/**
 * 将 widgets 转为 step8 同款竞品 JSON 字符串
 * @param {Array} widgets
 * @returns {string|null}
 */
function stringifyCompetitorRichContent(widgets) {
    if (!Array.isArray(widgets) || !widgets.length) return null;
    return JSON.stringify(
        dataConverter.convertToCompetitorFormat({
            widgets: widgets,
            version: 0.3,
        })
    );
}

function createRichTextImageConfig(url, includeWidth) {
    const normalizedUrl = normalizeRichTextImageUrl(url);
    const base = {
        src: normalizedUrl,
        srcMobile: normalizedUrl,
        alt: "",
        link: "",
        position: "to_the_edge",
        positionMobile: "to_the_edge",
    };
    if (!includeWidth) return base;
    return Object.assign({}, base, {
        width: "full",
        widthMobile: "full",
        scale: 100,
    });
}

function createRichTextImageItem(url, widgetName) {
    return {
        img: createRichTextImageConfig(url, widgetName === "raImage"),
    };
}

/**
 * 构建 raImage 同步组件（与 AiCollectModal.buildJsonSyncWidget 一致）
 * @param {string} mode
 * @param {string[]} imageUrls
 * @returns {Object|null}
 */
function buildRichTextSyncWidget(mode, imageUrls) {
    const urls = (imageUrls || []).map(normalizeRichTextImageUrl).filter(Boolean);
    if (!urls.length) return null;
    if (mode === "raImage") {
        return {
            widgetName: "raImage",
            items: urls.map(function (url) {
                return createRichTextImageItem(url, "raImage");
            }),
        };
    }
    return null;
}

/**
 * 规范化 widgets 内图片地址，保证 src/srcMobile 为绝对 URL
 * @param {Array} widgets
 * @returns {Array}
 */
function normalizeRichTextWidgets(widgets) {
    if (!Array.isArray(widgets)) return [];
    return widgets.map(function (widget) {
        if (!widget || !Array.isArray(widget.items)) return widget;
        const nextWidget = Object.assign({}, widget);
        nextWidget.items = widget.items.map(function (item) {
            if (!item || !item.img) return item;
            const img = Object.assign({}, item.img);
            img.src = normalizeRichTextImageUrl(img.src);
            img.srcMobile = normalizeRichTextImageUrl(img.srcMobile || img.src);
            return Object.assign({}, item, { img: img });
        });
        return nextWidget;
    });
}

/**
 * 处理 Ozon 采集到的 richAnnotationJson，输出项目 step8 同款竞品 JSON 字符串
 * Ozon 原始格式为 content[].raShowcase.blocks（title/text 常为 content:null），
 * 需提取图片后重建为 raImage → raShowcase/roll 纯图 blocks，避免 null 字段导致编辑器异常
 * @param {*} richAnnotationJson
 * @param {string[]} fallbackImageUrls
 * @returns {string|null}
 */
function processRichAnnotationJson(richAnnotationJson, fallbackImageUrls) {
    const parsed = parseRichAnnotationObject(richAnnotationJson);
    if (parsed && typeof parsed === "object") {
        const format = dataConverter.detectDataFormat(parsed);
        // Ozon 竞品格式：从 roll/raShowcase 的 blocks 提取图片，按 step8 重建 raImage
        if (format === "competitor" && Array.isArray(parsed.content) && parsed.content.length > 0) {
            const ozonImageUrls = extractImageUrlsFromOzonRichContent(parsed);
            if (ozonImageUrls.length > 0) {
                const ozonWidget = buildRichTextSyncWidget("raImage", ozonImageUrls);
                const ozonResult = stringifyCompetitorRichContent(ozonWidget ? [ozonWidget] : []);
                if (ozonResult) return ozonResult;
            }
        }

        // 内部 widgets 格式：规范化 URL 后转竞品格式
        const existingWidgets = parseRichTextWidgetsFromRaw(parsed);
        if (existingWidgets === null) return null;
        if (existingWidgets.length > 0) {
            return stringifyCompetitorRichContent(normalizeRichTextWidgets(existingWidgets));
        }
    }

    // 无富文本：用详情图/主图构建 raImage（与 step8 other 模板一致）
    const fallbackUrls = (fallbackImageUrls || [])
        .map(normalizeRichTextImageUrl)
        .filter(function (url, index, list) {
            return url && list.indexOf(url) === index;
        });
    const fallbackWidget = buildRichTextSyncWidget("raImage", fallbackUrls);
    return stringifyCompetitorRichContent(fallbackWidget ? [fallbackWidget] : []);
}

// ==========================================================================
// 网络请求函数
// ==========================================================================

/**
 * 通过 jQuery.ajax 发起 GET 请求，返回纯文本响应
 * （当前主流程已不使用，保留供兼容）
 * @param {string} url - 请求 URL
 * @returns {Promise<string>}
 */
function fetchText(url) {
    return new Promise(function (resolve, reject) {
        fetch(url)
            .then(function (response) {
                if (!response.ok) {
                    throw new Error("HTTP error " + response.status);
                }
                return response.text();
            })
            .then(function (res) {
                resolve(String(res || ""));
            })
            .catch(function (err) {
                reject(err || new Error("request failed"));
            });
    });
}

/**
 * 通过 jQuery.ajax 发起 GET 请求，返回 JSON 对象
 * @param {string} url - 请求 URL
 * @returns {Promise<Object>}
 */
function fetchJson(url) {
    return new Promise(function (resolve, reject) {
        const controller = new AbortController();
        const timeoutId = setTimeout(function () {
            controller.abort();
        }, 30000); // 30秒超时

        fetch(url, { signal: controller.signal })
            .then(function (response) {
                clearTimeout(timeoutId);
                if (!response.ok) {
                    throw new Error("HTTP error " + response.status);
                }
                return response.json();
            })
            .then(function (res) {
                resolve(res || {});
            })
            .catch(function (err) {
                clearTimeout(timeoutId);
                reject(err || new Error("request failed"));
            });
    });
}

/**
 * 将 Ozon 站点语言切换为俄语，采集接口与页面文案依赖 ru 环境
 * @param {string} locale - 目标语言，如 "ru"
 * @returns {Promise<Object>}
 */
function saveOzonLocale(locale) {
    const url = getHostBase() + "/api/composer-api.bx/_action/saveLocale";
    return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
    }).then(function (response) {
        if (!response.ok) {
            throw new Error("HTTP error " + response.status);
        }
        return response.json().catch(function () {
            return {};
        });
    });
}

/**
 * 将 Ozon 站点货币切换为卢布，采集接口与页面文案依赖 ru 环境
 * @returns {Promise<Object>}
 */
function saveOzonCurrency() {
    const url = getHostBase() + "/api/composer-api.bx/_action/changeCurrency";
    return fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency_code: "RUB" }),
    }).then(function (response) {
        if (!response.ok) {
            throw new Error("HTTP error " + response.status);
        }
        return response.json().catch(function () {
            return {};
        });
    });
}

// 精铺 1688 改造：美元→人民币默认系数（对齐 exportPriceUtils）
const BCS_JINGPU_USD_TO_CNY = 7.1874;

/**
 * 从 Ozon 价格文案解析数值（保留小数，对齐 parseOzonPriceNumber）
 * @param {string} text
 * @returns {number}
 */
function bcsParseOzonPriceNumber(text) {
    const raw = String(text || '').replace(/\s+/g, '');
    if (!raw) return NaN;
    const cleaned = raw.replace(/[^\d.,]/g, '');
    if (!cleaned) return NaN;
    // 仅逗号作小数点时转成点；否则去掉千分位逗号
    const normalized = cleaned.includes(',') && !cleaned.includes('.')
        ? cleaned.replace(',', '.')
        : cleaned.replace(/,/g, '');
    const n = parseFloat(normalized);
    return Number.isFinite(n) ? n : NaN;
}

/**
 * 按价格符号识别币种并换算为人民币文案（精铺 discountPrice / offerMaxPrice）
 * ¥/￥ 原样；$ 乘美元汇率；其余按卢布 ÷ cnyPerRub
 * @param {string} priceText
 * @param {number} cnyPerRub - 1 人民币对应的卢布数（与 AiCollectModal 传入一致）
 * @returns {string}
 */
function bcsOzonPriceToCnyText(priceText, cnyPerRub) {
    const num = bcsParseOzonPriceNumber(priceText);
    if (!Number.isFinite(num) || num < 0) return '0.00';
    const t = String(priceText || '');
    if (t.includes('¥') || t.includes('￥')) return num.toFixed(2);
    if (t.includes('$')) return (num * BCS_JINGPU_USD_TO_CNY).toFixed(2);
    const rate = (Number.isFinite(cnyPerRub) && cnyPerRub > 0) ? cnyPerRub : 10.8;
    return (num / rate).toFixed(2);
}

// ==========================================================================
// nextPage 提取函数
// ==========================================================================
// Ozon 产品页数据分 Page 1（基础）和 Page 2（详情）两次 API 加载。
// Page 2 的 URL 通过 nextPage 字段传递，嵌入在页面 HTML 或 API 响应中。
// 以下两个函数分别从 HTML 文本和 DOM 属性中提取 nextPage。

/**
 * 从 HTML 文本中用正则提取 nextPage URL
 * 适用于通过 fetchText 获取的原始 HTML
 * @param {string} html - HTML 文本
 * @returns {string} nextPage URL，未找到返回空字符串
 */
function extractNextPageFromHtmlText(html) {
    if (!html) return "";
    const patterns = [
        /"nextPage":"(.*?)"/,
        /\\"nextPage\\":\\"(.*?)\\"/,
    ];
    for (let i = 0; i < patterns.length; i++) {
        const m = html.match(patterns[i]);
        if (m && m[1]) {
            return m[1]
                .replace(/\\\\u002F/g, "/")
                .replace(/\\u002F/g, "/")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");
        }
    }
    return "";
}

/**
 * 从当前页面 DOM 的 data-state 属性中提取 nextPage URL
 * 使用 getAttribute("data-state") 获取未经 HTML 编码的原始字符串，
 * 避免 innerHTML 序列化时 &quot; 编码导致正则失败的问题
 * @returns {string} nextPage URL，未找到返回空字符串
 */
function extractNextPageFromDom() {
    const elements = document.querySelectorAll("[data-state]");
    for (let i = 0; i < elements.length; i++) {
        const raw = elements[i].getAttribute("data-state");
        if (!raw || raw.indexOf("nextPage") === -1) continue;
        const m = raw.match(/"nextPage":"(.*?)"/);
        if (m && m[1]) {
            return m[1]
                .replace(/\\\\u002F/g, "/")
                .replace(/\\u002F/g, "/")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");
        }
    }
    return "";
}

// ==========================================================================
// HTML 文本解析函数（用于解析通过 fetchText 获取的 HTML，当前为兼容保留）
// ==========================================================================

/**
 * 从 HTML 文本中提取商品类目层级
 * @param {string} htmlText - HTML 文本
 * @param {Object} retData  - 全局返回数据
 */
function parseCategoryFromHtmlText(htmlText, retData) {
    if (!htmlText) return;
    const match = String(htmlText).match(/"hierarchy":"(.*?)"/);
    if (!match || !match[1]) return;
    const parts = match[1].split(/\\u002F/g).filter(Boolean);
    if (!retData.category || !retData.category.length) {
        retData.category = parts;
    }
}

/**
 * 从 webAspects 的 state 对象中解析变体信息（规格属性、价格、图片、链接等）
 * 与 parseAspectsFromWidgetStates不同，此函数接收已解析的 state 对象（来自 DOM 或 HTML 解析）
 * @param {Object} aspectsObj  - webAspects 节点的 data-state 解析后的对象，包含 aspects 数组
 * @param {string} targetSku   - 当前目标 SKU，用于判断是否设置封面图
 * @param {Object} retData     - 全局返回数据对象，变体行数据会写入 retData.rows
 * @param {Array|null} aspectLinks - 变体链接收集数组，传 null 则跳过链接收集
 */
function parseAspectsFromStateObject(aspectsObj, targetSku, retData, aspectLinks) {
    if (!aspectsObj || !Array.isArray(aspectsObj.aspects)) return;
    aspectsObj.aspects.forEach(function (aspect) {
        // 从 descriptionRs 中提取规格类型名称（如"颜色"、"尺码"等）
        const rs = aspect.descriptionRs || [];
        let rsType = "";
        rs.forEach(function (item) {
            if (item && item.type === "textGray") {
                // 去掉末尾的冒号和空格，得到纯净的规格类型名
                rsType = String(item.content || "").replace(/[:：]\s*$/, "").trim();
            }
        });
        // 遍历该规格维度下的所有变体选项
        (aspect.variants || []).forEach(function (variant) {
            const sku = variant && variant.sku;
            if (!sku) return;
            // 确保 retData.rows 中存在该 SKU 对应的行，不存在则创建
            const row = ensureRow(retData, sku);
            const data = variant.data || {};
            // 拼接变体的规格属性值文本（如 "红色"、"XL" 等）
            const rsValues = (data.textRs || []).map(function (it) {
                return it && it.content;
            }).filter(Boolean);
            appendVariantAttr(row, rsType, rsValues.join(" "));
            // 填充价格、原价、标题
            if (data.price) row.price = data.price;
            if (data.originalPrice) row.old_price = data.originalPrice;
            if (data.title) row.title = data.title;
            // 如果是当前目标 SKU 且有图片，设置封面图
            if (sku === targetSku && data.image && !row.cover_image) {
                row.cover_image = data.image;
            }

            // 收集变体详情页链接，用于后续并发抓取变体页面数据
            if (!aspectLinks || !variant.link) return;
            // 按 SKU 去重，避免重复抓取同一变体
            const exists = aspectLinks.some(function (x) {
                return x && String(x.sku) === String(sku);
            });
            if (!exists) {
                aspectLinks.push({ sku: sku, link: variant.link, used: false });
            }
        });
    });
}

// ==========================================================================
// 核心 API 请求：获取 Page 2 公共数据
// ==========================================================================

/**
 * 通过 entrypoint-api 获取包含公共信息的 widgetStates（Page 2 数据）
 *
 * 获取策略（多重保障）：
 *   1. 从传入的 HTML 文本提取 nextPage URL
 *   2. 从当前 DOM 的 data-state 属性提取 nextPage URL
 *   3. 依次尝试候选 URL（nextPage → 当前页面路径 → /product/{sku}/）
 *   4. 如果候选 URL 返回的响应不含 common widgets（webCharacteristics/webDescription/
 *      webHashtags），但响应中有 res.nextPage，则链式请求该 URL 获取 Page 2
 *
 * @param {string} mainSku      - 主商品 SKU
 * @param {string} pageHtmlText - 页面 HTML 文本（可为空，会回退到 DOM 提取）
 * @returns {Promise<Object|null>} 包含 widgetStates 的 API 响应，或 null
 */

// Page 2 共享缓存：精铺 / 急速 V1 / buildEditUpload 共用，避免重复请求 Ozon Page2 接口
const _page2Cache = {};

function _page2HasCommonWidgets(res) {
    if (!res || !res.widgetStates || !Object.keys(res.widgetStates).length) return false;
    return Object.keys(res.widgetStates).some(function (k) {
        return k.indexOf("webCharacteristics") !== -1 ||
            k.indexOf("webDescription") !== -1 ||
            k.indexOf("webHashtags") !== -1;
    });
}

function _getPage2FromCache(sku) {
    const key = String(sku || "").trim();
    if (!key) return null;
    const cached = _page2Cache[key];
    if (cached && cached.widgetStates && Object.keys(cached.widgetStates).length) return cached;
    return null;
}

function _setPage2Cache(sku, res) {
    const key = String(sku || "").trim();
    if (!key || !res) return;
    _page2Cache[key] = res;
}

function _clearPage2Cache() {
    Object.keys(_page2Cache).forEach(function (k) {
        delete _page2Cache[k];
    });
}

/** 当前浏览器详情页正在展示的商品 SKU */
function _getCurrentDetailPageSku() {
    const u = window.location.href;
    const isProduct = u.indexOf('ozon.ru/product') !== -1 || u.indexOf('ozon.kz/product') !== -1;
    if (!isProduct) return '';
    return (window.location.pathname.match(/(\d{7,})/) || [])[1] || '';
}

function _isCurrentDetailPageSku(sku) {
    const pageSku = _getCurrentDetailPageSku();
    return !!(pageSku && String(sku) === pageSku);
}

/** 按 SKU 直拉 Page2（对齐旧版 fetchSkuProductDetail，避免误用当前页 pathname/DOM） */
async function _fetchPage2WidgetsDirectBySku(sku) {
    const skuKey = String(sku || '').trim();
    if (!skuKey) return null;
    const cached = _getPage2FromCache(skuKey);
    if (cached && cached._bcsDirectSkuFetch) return cached;

    const host = getHostBase();
    const page2Url = host + '/api/entrypoint-api.bx/page/json/v2?url=' + encodeURIComponent(
        '/product/' + skuKey + '/?&abt_att=1&layout_page_index=2&origin_referer=www.ozon.ru&layout_container=pdpPage2column',
    );
    const res = await fetchJson(page2Url).catch(function () { return null; });
    if (res && res.widgetStates) {
        res._bcsDirectSkuFetch = true;
        _setPage2Cache(skuKey, res);
    }
    return res;
}

/** 无缓存版：按 nextPage / 候选 URL 拉取 Page 2 widgetStates */
async function _fetchDetailApiForCommonUncached(mainSku, pageHtmlText) {
    const sku = String(mainSku || "").trim();

    // 变体 / 列表页 SKU：禁止走当前页 DOM/pathname，否则所有 SKU 富文本相同
    if (!_isCurrentDetailPageSku(sku)) {
        return _fetchPage2WidgetsDirectBySku(sku);
    }

    const host = getHostBase();

    let nextPage = extractNextPageFromHtmlText(String(pageHtmlText || ""));
    if (!nextPage) {
        nextPage = extractNextPageFromDom();
    }

    const candidates = [];
    if (nextPage) {
        candidates.push(nextPage);
    }
    candidates.push(window.location.pathname + window.location.search);
    candidates.push("/product/" + sku + "/");

    const apiUrls = candidates
        .filter(function (v) { return !!v; })
        .map(function (v) {
            return host + "/api/entrypoint-api.bx/page/json/v2?url=" + encodeURIComponent(v);
        });

    const results = await Promise.all(apiUrls.map(function (url) {
        return fetchJson(url).catch(function () { return null; });
    }));

    for (let i = 0; i < results.length; i++) {
        if (_page2HasCommonWidgets(results[i])) {
            return results[i];
        }
    }

    const npUrls = [];
    for (let j = 0; j < results.length; j++) {
        const res = results[j];
        if (res && res.nextPage) {
            npUrls.push(host + "/api/entrypoint-api.bx/page/json/v2?url=" + encodeURIComponent(res.nextPage));
        }
    }
    if (npUrls.length > 0) {
        const npResults = await Promise.all(npUrls.map(function (u) {
            return fetchJson(u).catch(function () { return null; });
        }));
        for (let n = 0; n < npResults.length; n++) {
            if (_page2HasCommonWidgets(npResults[n])) {
                return npResults[n];
            }
        }
        for (let n2 = 0; n2 < npResults.length; n2++) {
            if (npResults[n2] && npResults[n2].widgetStates && Object.keys(npResults[n2].widgetStates).length) {
                return npResults[n2];
            }
        }
    }

    for (let k = 0; k < results.length; k++) {
        if (results[k] && results[k].widgetStates && Object.keys(results[k].widgetStates).length) {
            return results[k];
        }
    }
    return null;
}

/** 统一 Page 2 入口：先查共享缓存，未命中再网络拉取并写入缓存 */
async function getOrFetchPage2Widgets(mainSku, pageHtmlText) {
    const sku = String(mainSku || "").trim();
    if (!sku) return null;

    if (!_isCurrentDetailPageSku(sku)) {
        return _fetchPage2WidgetsDirectBySku(sku);
    }

    const cached = _getPage2FromCache(sku);
    if (cached) return cached;
    const res = await _fetchDetailApiForCommonUncached(sku, pageHtmlText || "");
    if (res && res.widgetStates) {
        _setPage2Cache(sku, res);
    }
    return res;
}

async function fetchDetailApiForCommon(mainSku, pageHtmlText) {
    return getOrFetchPage2Widgets(mainSku, pageHtmlText);
}

// ==========================================================================
// 对外暴露：window.bcsVariantBuilder
// ==========================================================================

/**
 * 缓存数组：存储getBt (product page) 的响应
 * 由 index.js 中 getBt成功回调通过 onProductAspectsResponse注入
 * 包含 gallery、aspects、common 等 Page 1 数据
 */
const _productResponses = []

/**
 * 缓存数组：存储额外的 common meta 响应（预留接口）
 */
const _commonMetaResponses = []

/**
 * 通过 ISOLATED 世界 → background 请求 /sku/shops
 * MAIN 世界无 chrome.*，且受 Ozon CSP 限制，不能直接 fetch ERP
 */
function fetchSkuShopsViaExtension(sku) {
    return new Promise(function (resolve) {
        const requestId = 'fetchSkuShops_' + Date.now() + '_' + Math.random();
        const timeoutMs = 10000;
        let timeoutId;

        function onResponse(event) {
            const detail = event && event.detail;
            if (!detail || detail.requestId !== requestId || detail.action !== 'fetchSkuShops') {
                return;
            }
            document.removeEventListener('ext-bridge-res', onResponse);
            clearTimeout(timeoutId);
            resolve(detail.success ? detail.data : null);
        }

        document.addEventListener('ext-bridge-res', onResponse);
        timeoutId = setTimeout(function () {
            document.removeEventListener('ext-bridge-res', onResponse);
            resolve(null);
        }, timeoutMs);

        document.dispatchEvent(new CustomEvent('ext-bridge-req', {
            detail: {
                requestId: requestId,
                action: 'fetchSkuShops',
                sku: sku
            }
        }));
    });
}

/**
 * 以固定并发上限依次处理列表项（用于批量 /sku/shops，避免打满接口）
 * @param {Array} items
 * @param {number} limit 最大并发数
 * @param {function(item, index): Promise<void>} iterator
 */
async function mapWithConcurrency(items, limit, iterator) {
    const list = items || [];
    if (!list.length) return;
    const concurrency = Math.max(1, Math.min(limit, list.length));
    let nextIndex = 0;
    const runners = [];
    for (let i = 0; i < concurrency; i++) {
        runners.push((async function runWorker() {
            while (nextIndex < list.length) {
                const idx = nextIndex++;
                await iterator(list[idx], idx);
            }
        })());
    }
    await Promise.all(runners);
}

/**
 * 异步版数据组装（编辑上架主入口）
 *
 * 数据获取流程：
 *   Phase 1 — DOM 解析（零网络开销）
 *     • parseGalleryFromDom：主 SKU 的图片/视频
 *     • parseCategoryFromHtml：商品类目
 *     • 提取 lastDescriptionCategoryNameOrTypeName
 *     • parseAspectsFromStateObject从 DOM 的 webAspects 发现所有变体 SKU
 *
 *   Phase 2 — 消费 getBt缓存
 *     • _productResponses：gallery + aspects + common（Page 1 数据）
 *       注：getBt 已在 index.js 中实现递归 BFS，进入详情页时自动拉取所有变体 SKU，
 *       因此_productResponses中已包含所有变体的完整数据（图片、规格、价格等）
 *     • _commonMetaResponses：额外 common 数据
 *
 *   Phase 3 — common 信息兜底
 *     • 如果 description/common_attributes 仍为空
 *     • 调用fetchDetailApiForCommon通过 nextPage 获取 Page 2 widgets
 *
 * @param {string} mainSku - 主商品 SKU
 * @returns {Promise<Object>} editUploadData 数据对象
 */

// buildEditUploadDataBySku 整包缓存：按 mainSku + skuShopsMainOnly 分 key，精铺与急速 V2 互不复用错误策略
const _editUploadDataCache = {};
/** 编辑上架进度上报开关（buildEditUploadData action 期间为 true） */
let _editUploadProgressActive = false;
/** 编辑上架是否为「当前变体」模式（进度条按 1/1 计，不用预热全量缓存数量） */
let _editUploadSkipVariants = false;
let _editUploadTargetSku = '';

function _bcsEmitEditUploadProgress(phase, current, total) {
    if (!_editUploadProgressActive) return;
    try {
        document.dispatchEvent(new CustomEvent('edit-upload-progress', {
            detail: {
                phase: phase,
                current: current,
                total: Math.max(total, current, 1),
            },
        }));
    } catch (e) { /* ignore */ }
}

function _bcsEmitEditUploadVariantsProgress() {
    var current;
    var total;
    if (_editUploadProgressActive && _editUploadSkipVariants) {
        var skuKey = String(_editUploadTargetSku || '').trim();
        var matched = (_productResponses || []).some(function (item) {
            return item && String(item.sku) === skuKey;
        });
        current = matched ? 1 : 0;
        total = 1;
    } else {
        current = _productResponses.length;
        total = Math.max(_qsProgressTotal, current, 1);
    }
    _bcsEmitEditUploadProgress('variants', current, total);
}

/** /sku/shops 缓存（对齐旧版 bcsVariantBuilder._skuShopsCategories/_skuShopsAttributes） */
let _skuShopsCategories = null;
let _skuShopsCategoriesSku = '';
let _skuShopsAttributes = null;
let _skuShopsAttributesSku = '';

function _clearSkuShopsCache() {
    _skuShopsCategories = null;
    _skuShopsCategoriesSku = '';
    _skuShopsAttributes = null;
    _skuShopsAttributesSku = '';
}

function _cacheSkuShopsFromResponse(sku, osItem) {
    if (!osItem) return;
    const skuKey = String(sku || '').trim();
    if (osItem.categories) {
        _skuShopsCategories = osItem.categories;
        _skuShopsCategoriesSku = skuKey;
    }
    if (Array.isArray(osItem.attributes) && osItem.attributes.length) {
        _skuShopsAttributes = osItem.attributes;
        _skuShopsAttributesSku = skuKey;
    }
}

async function _ensureSkuShopsCached(sku) {
    const skuKey = String(sku || '').trim();
    if (!skuKey) return;
    // crawler / 利润面板可能只写了 categories 未写 sku：补标当前 sku，避免误清空有效缓存
    if (_skuShopsCategories && _skuShopsCategories.length && !_skuShopsCategoriesSku) {
        _skuShopsCategoriesSku = skuKey;
    }
    const needFetch = !_skuShopsCategories || !_skuShopsCategories.length
        || !_skuShopsAttributes || !_skuShopsAttributes.length
        || _skuShopsCategoriesSku !== skuKey;
    if (!needFetch) return;
    _clearSkuShopsCache();
    const os = await fetchSkuShopsViaExtension(skuKey);
    if (os && os.data && os.data.length > 0) {
        _cacheSkuShopsFromResponse(skuKey, os.data[0]);
    }
}

function _applyPackagingDimsToRow(row, attributes) {
    if (!row || !attributes || !attributes.length) return;
    const dims = parsePackagingFromGoodsSize(attributes);
    if (!dims) return;
    if (dims.length != null) row.depth = Math.floor(dims.length);
    if (dims.width != null) row.width = Math.floor(dims.width);
    if (dims.height != null) row.height = Math.floor(dims.height);
    if (dims.weight != null) row.weight = Math.floor(dims.weight);
    row.goodsSize = attributes;
    row.shopFeatureAttrs = pickNonPackagingShopAttributes(attributes);
}

function _applySkuShopsCacheToRetData(sku, retData) {
    const skuKey = String(sku || '').trim();
    if (_skuShopsCategories && _skuShopsCategories.length && _skuShopsCategoriesSku === skuKey) {
        retData.skuShopsCategories = _skuShopsCategories;
        retData.goodsCategory = _skuShopsCategories;
    }
    if (_skuShopsAttributes && _skuShopsAttributes.length && _skuShopsAttributesSku === skuKey) {
        const dimRow = (retData.rows || []).find(function (r) {
            return r && String(r.sku) === skuKey;
        });
        if (dimRow) _applyPackagingDimsToRow(dimRow, _skuShopsAttributes);
    }
}

/** 变体 getBt 是否已全部完成（对齐旧版 isVariantBtIdle） */
function isVariantBtIdle() {
    if (_btInFlight > 0) return false;
    if (_qsProgressTotal > 0 && _productResponses.length < _qsProgressTotal) return false;
    return true;
}

/** 从 Page1 widgetStates 提取 webProductHeading 完整标题 */
function _bcsExtractTitleFromWidgetStates(widgetStates) {
    if (!widgetStates) return '';
    let title = '';
    Object.keys(widgetStates).forEach(function (k) {
        if (k.indexOf('webProductHeading') === -1) return;
        const jData = parseStateValue(widgetStates[k]);
        if (jData && jData.title && !title) {
            title = String(jData.title).trim();
        }
    });
    return title;
}

/** 仅当变体标题确实为空时才按 SKU 重拉 webProductHeading。
 *  Ozon 同款各变体本就共用同一个商品标题，_bcsApplyPerVariantTitles 又已用各变体自己
 *  getBt 缓存的 webProductHeading 覆盖过，故"标题等于当前页标题"是合法现象，不再据此重拉，
 *  避免对每个变体都并行打一次 Page1 造成 N 倍请求（点击「全部变体」明显变慢的根因）。 */
function _bcsRowNeedsTitleRefetch(row, pageSku, rows) {
    if (!row || !row.sku) return false;
    const title = String(row.title || '').trim();
    if (!title) return true;
    return false;
}

/** 优先用 getBt 缓存中各 SKU 自己的 webProductHeading 覆盖 webAspects 标题 */
function _bcsApplyPerVariantTitles(rows, pageSku) {
    if (!rows || !rows.length) return;
    rows.forEach(function (row) {
        if (!row || !row.sku) return;
        const sku = String(row.sku).trim();
        const cached = _bcsSingleVariantRowFromCache(sku);
        if (cached && cached.title) {
            row.title = cached.title;
            return;
        }
        if (pageSku && sku === String(pageSku)) {
            const headingEl = document.querySelector("[id^='state-webProductHeading']");
            if (headingEl) {
                const st = safeJsonParse(headingEl.getAttribute('data-state') || '{}', {});
                if (st.title) row.title = String(st.title);
            }
        }
    });
}

/** 对缺标题或疑似误带当前页标题的变体，按 SKU 请求 Page1 补拉 webProductHeading */
async function bcsFetchTitlesForRows(rows, pageSku) {
    if (!rows || !rows.length) return;
    const needFetch = rows.filter(function (r) {
        return r && r.sku && _bcsRowNeedsTitleRefetch(r, pageSku, rows);
    });
    if (!needFetch.length) return;
    const host = window.location.href.indexOf('ozon.kz') !== -1 ? 'https://ozon.kz' : 'https://www.ozon.ru';
    await Promise.all(needFetch.map(function (row) {
        const bSku = String(row.sku || '').trim();
        if (!bSku) return Promise.resolve();
        const apiUrl = host + '/api/entrypoint-api.bx/page/json/v2?url='
            + encodeURIComponent('/product/' + bSku + '/');
        return fetch(apiUrl, { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (res) {
                if (!res || !res.widgetStates) return;
                const title = _bcsExtractTitleFromWidgetStates(res.widgetStates);
                if (title) row.title = title;
                const exists = _productResponses.some(function (item) {
                    return item && String(item.sku) === bSku;
                });
                if (!exists) _productResponses.push({ sku: bSku, res: res });
            })
            .catch(function (e) {
                console.warn('[bcs][title] fail sku=' + bSku, e);
            });
    }));
    console.log('[bcs][title] done count=' + needFetch.length);
}

/** 对缺图行从 Ozon Page1 API 并行补拉图库（对齐旧版 fetchGalleryForRows） */
async function bcsFetchGalleryForRows(rows) {
    if (!rows || !rows.length) return;
    const missing = rows.filter(function (r) {
        if (!r || !r.sku) return false;
        const hasImg = r.cover_image || (Array.isArray(r.images) && r.images.length > 0);
        return !hasImg;
    });
    if (!missing.length) return;
    const host = window.location.href.indexOf('ozon.kz') !== -1 ? 'https://ozon.kz' : 'https://www.ozon.ru';
    const wrapper = { rows: rows };
    await Promise.all(missing.map(function (row) {
        const bSku = String(row.sku || '').trim();
        if (!bSku) return Promise.resolve();
        const apiUrl = host + '/api/entrypoint-api.bx/page/json/v2?url='
            + encodeURIComponent('/product/' + bSku + '/');
        return fetch(apiUrl, { credentials: 'include' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (res) {
                if (!res || !res.widgetStates) return;
                parseGalleryFromWidgetStates(bSku, res.widgetStates, wrapper);
                const exists = _productResponses.some(function (item) {
                    return item && String(item.sku) === bSku;
                });
                if (!exists) _productResponses.push({ sku: bSku, res: res });
            })
            .catch(function (e) {
                console.warn('[bcs][gallery] fail sku=' + bSku, e);
            });
    }));
    console.log('[bcs][gallery] done count=' + missing.length);
}

function _editUploadCacheKey(sku, skuShopsMainOnly, singleVariantOnly) {
    return String(sku || "").trim() + ":" + (skuShopsMainOnly ? "main" : "full") + ":" + (singleVariantOnly ? "one" : "all");
}

function _getEditUploadDataCache(sku, skuShopsMainOnly, singleVariantOnly) {
    if (!String(sku || "").trim()) return null;
    const key = _editUploadCacheKey(sku, skuShopsMainOnly, singleVariantOnly);
    return _editUploadDataCache[key] || null;
}

function _setEditUploadDataCache(sku, skuShopsMainOnly, singleVariantOnly, data) {
    const key = _editUploadCacheKey(sku, skuShopsMainOnly, singleVariantOnly);
    if (!key || key === ":" || !data) return;
    try {
        _editUploadDataCache[key] = JSON.parse(JSON.stringify(data));
    } catch (e) {
        _editUploadDataCache[key] = data;
    }
}

function _clearEditUploadDataCache() {
    Object.keys(_editUploadDataCache).forEach(function (k) {
        delete _editUploadDataCache[k];
    });
}

async function buildEditUploadDataBySku(mainSku, options) {
    const sku = String(mainSku || "").trim();
    if (!sku) {
        console.warn('sku is null', sku);
        return;
    }
    // 急速上架对齐旧插件：/sku/shops 只对主 SKU 调一次取 categories，不再逐变体补 goodsSize/特征属性。
    // （旧版 variant-upload-builder.js 的 buildEditUploadDataBySku 也只对主 SKU 取 categories）
    // AI 采集 → 1688 转换仍需逐变体包装尺寸，默认保持全量逐变体行为。
    const skuShopsMainOnly = !!(options && options.skuShopsMainOnly);
    const singleVariantOnly = !!(options && options.singleVariantOnly);
    const skipCache = !!(options && options.skipCache);
    const forceRefresh = !!(options && options.forceRefresh);
    // 命中整包缓存则直接返回副本，避免精铺与急速 V2 重复跑 Phase 3 及后端 /sku/shops
    if (!skipCache && !forceRefresh) {
        const cached = _getEditUploadDataCache(sku, skuShopsMainOnly, singleVariantOnly);
        if (cached) {
            try {
                return JSON.parse(JSON.stringify(cached));
            } catch (e) {
                return cached;
            }
        }
    }
    // 构建基础返回数据
    const retData = {
        scene: "plugin",
        sku: mainSku,
        url: window.location.href || "",
        rows: [],
        category: [],
        common_attributes: [],
        description: "",
        richAnnotationJson: null,
        lastDescriptionCategoryNameOrTypeName: "",
        tags: [],
    }

    // ====== Phase 1: DOM 解析（零网络开销） ======
    // 从 DOM 的 webGallery 元素解析主 SKU 的图片/视频
    parseGalleryFromDom(sku, retData);
    // 从 DOM 的 innerHTML 提取商品类目
    parseCategoryFromHtml(retData);
    // 从 DOM 的 webShortCharacteristics 提取 lastDescriptionCategoryNameOrTypeName
    if (!retData.lastDescriptionCategoryNameOrTypeName) {
        const shortCharNode =
            document.getElementById("state-webShortCharacteristics-3385952-default-1") ||
            document.querySelector("[id^='state-webShortCharacteristics-'][id$='-default-1']");
        if (shortCharNode) {
            const rawState = shortCharNode.getAttribute("data-state") || "";
            const parsedState = parseStateValue(rawState) || safeJsonParse(rawState, {});
            const typeText = extractTypeOrCountryTextFromCharacteristics(
                parsedState && parsedState.characteristics
            );
            if (typeText) retData.lastDescriptionCategoryNameOrTypeName = typeText;
        }
    }

    // 从 DOM 的 webAspects 元素发现变体 SKU（「当前变体」模式跳过，避免把 55 个变体都写进 rows）
    if (!singleVariantOnly) {
        const webAspects = document.querySelector("[id*='state-webAspects']");
        if (webAspects) {
            const domAspectsState = safeJsonParse(webAspects.getAttribute("data-state") || "", null);
            if (domAspectsState && domAspectsState.aspects) {
                parseAspectsFromStateObject(domAspectsState, sku, retData, null);
            }
        }
    }

    // ====== Phase 2: 消费 getBt已缓存的数据（仅 _productResponses） ======
    // getBt在进入详情页时由 index.js 自动调用，响应通过 onProductAspectsResponse注入
    // 每条响应含 /product/{sku} 的 widgetStates（Page 1：gallery + aspects + price）
    if (_productResponses && _productResponses.length > 0) {
        _productResponses.forEach(function (item) {
            if (singleVariantOnly && String(item.sku) !== String(sku)) return;
            if (item && item.res && item.res.widgetStates) {
                parseGalleryFromWidgetStates(item.sku, item.res.widgetStates, retData);
                parseAspectsFromWidgetStates(item.res.widgetStates, sku, retData, "product");
                if (!singleVariantOnly) {
                    parseCommonFromApiWidgetStates(item.res.widgetStates, retData);
                }
            }
        });
    }

    // 消费额外 common meta 响应（预留接口）
    if (_commonMetaResponses && _commonMetaResponses.length > 0) {
        _commonMetaResponses.forEach(function (item) {
            if (item && item.res && item.res.widgetStates) {
                parseCommonFromApiWidgetStates(item.res.widgetStates, retData);
            }
        });
    }

    // ====== Phase 2.5: 单变体商品兜底（无 webAspects 时 price/title 为空） ======
    // 单变体商品页面没有 webAspects 组件，price/old_price/title 需要从
    // webPrice 和 webProductHeading 组件中提取
    const mainRow = ensureRow(retData, sku);
    if (!mainRow.price || !mainRow.title) {
        // 2.5a: 从 DOM 的 webPrice / webProductHeading 提取
        const webPrice = document.querySelector("[id^='state-webPrice-']");
        if (webPrice) {
            const priceState = safeJsonParse(webPrice.getAttribute("data-state") || "{}", {});
            if (priceState.price && !mainRow.price) mainRow.price = priceState.price;
            if (priceState.originalPrice && !mainRow.old_price) mainRow.old_price = priceState.originalPrice;
        }
        const webHeading = document.querySelector("[id^='state-webProductHeading']");
        if (webHeading) {
            const headingState = safeJsonParse(webHeading.getAttribute("data-state") || "{}", {});
            if (headingState.title && !mainRow.title) mainRow.title = headingState.title;
        }
        // 2.5b: 从_productResponses缓存的 widgetStates 中提取
        if (!mainRow.price || !mainRow.title) {
            (_productResponses || []).forEach(function (item) {
                if (!item || !item.res || !item.res.widgetStates) return;
                Object.keys(item.res.widgetStates).forEach(function (key) {
                    const jData = parseStateValue(item.res.widgetStates[key]);
                    if (!jData || typeof jData !== "object") return;
                    // webPrice
                    if (key.indexOf("webPrice") !== -1) {
                        if (jData.price && !mainRow.price) mainRow.price = jData.price;
                        if (jData.originalPrice && !mainRow.old_price) mainRow.old_price = jData.originalPrice;
                    }
                    // webProductHeading
                    if (key.indexOf("webProductHeading") !== -1) {
                        if (jData.title && !mainRow.title) mainRow.title = jData.title;
                    }
                });
            });
        }
    }

    // ====== Phase 3: common 信息兜底 ======
    // getBt返回的是 Page 1 数据（gallery/aspects/price），不含 webCharacteristics、
    // webDescription、webHashtags（这些属于 Page 2）。
    // 如果 description 或 common_attributes 仍为空，调用fetchDetailApiForCommon
    // 通过 nextPage URL 获取 Page 2 的 widgetStates。
    if (
        !retData.description ||
        !retData.common_attributes ||
        !retData.common_attributes.length ||
        !retData.richAnnotationJson
    ) {
        const commonRes = await getOrFetchPage2Widgets(sku, "");
        if (commonRes && commonRes.widgetStates) {
            parseCommonFromApiWidgetStates(commonRes.widgetStates, retData);
        }
    }

    // 过滤无效行并输出最终数据
    retData.rows = (retData.rows || []).filter(function (row) {
        return row && row.sku;
    });
    if (singleVariantOnly) {
        retData.rows = retData.rows.filter(function (row) {
            return String(row.sku) === String(sku);
        });
        if (!retData.rows.length) {
            ensureRow(retData, sku);
            retData.rows = retData.rows.filter(function (row) {
                return String(row.sku) === String(sku);
            });
        }
    }

    if (skuShopsMainOnly) {
        // 对齐旧插件：仅主 SKU 调一次 /sku/shops；复用缓存 attributes 写主行长宽高
        if (_editUploadProgressActive) _bcsEmitEditUploadProgress('shops', 0, 1);
        await _ensureSkuShopsCached(sku);
        if (_editUploadProgressActive) _bcsEmitEditUploadProgress('shops', 1, 1);
        _applySkuShopsCacheToRetData(sku, retData);
    } else {
        // 按 rows 中每个 SKU 拉取长宽高重量、类目，写入对应行（最大并发 3）
        var shopsRows = (retData.rows || []).filter(function (r) {
            return r && r.sku;
        });
        var shopsTotal = shopsRows.length || 1;
        var shopsDone = 0;
        if (_editUploadProgressActive) _bcsEmitEditUploadProgress('shops', 0, shopsTotal);
        await mapWithConcurrency(shopsRows, 3, async function (row) {
            if (!row || !row.sku) return;
            const os = await fetchSkuShopsViaExtension(row.sku);
            if (os && os.data && os.data.length > 0) {
                const shopAttrs = os.data[0].attributes || [];
                row.goodsSize = shopAttrs; // 完整 attributes，供解析包装尺寸
                // 除长宽高重量外的全部 attributes，按 key=attr.id 在 ISOLATED 世界匹配 ruOssPath 回填
                row.shopFeatureAttrs = pickNonPackagingShopAttributes(shopAttrs);
                row.goodsCategory = os.data[0].categories; // 类目
                _applyPackagingDimsToRow(row, shopAttrs);
            }
            shopsDone++;
            if (_editUploadProgressActive) _bcsEmitEditUploadProgress('shops', shopsDone, shopsTotal);
        });
        // 主 SKU 行类目同步到顶层，供 ISOLATED 世界读取 goodsCategory
        const mainSkuRow = (retData.rows || []).find(function (r) {
            return r && String(r.sku) === String(sku);
        });
        if (mainSkuRow && mainSkuRow.goodsCategory) {
            retData.goodsCategory = mainSkuRow.goodsCategory;
        }
    }

    _bcsApplyPerVariantTitles(retData.rows, sku);
    try {
        await bcsFetchTitlesForRows(retData.rows, sku);
    } catch (e) {
        console.warn('[bcs][build] title fetch fail:', e);
    }
    try {
        await bcsFetchGalleryForRows(retData.rows);
    } catch (e) {
        console.warn('[bcs][build] gallery fetch fail:', e);
    }

    console.warn("ozon商品数据:", retData);
    _setEditUploadDataCache(sku, skuShopsMainOnly, singleVariantOnly, retData);
    return retData;
}

function bcsVariantBuilderReset() {
    _productResponses.length = 0;
    Object.keys(_btFetchedSkus).forEach(function (k) {
        delete _btFetchedSkus[k];
    });
    // modal/aspectsNew 去重缓存与 _btFetchedSkus 同步清空，否则切回同一商品时 getBtd 命中旧 promise、不再发现隐藏变体
    Object.keys(_btdPromises).forEach(function (k) {
        delete _btdPromises[k];
    });
    _clearSkuShopsCache();
    // 切换商品时同步清 Page2 / editUpload 缓存，避免上一个 SKU 数据混入
    _clearPage2Cache();
    _clearEditUploadDataCache();
}

// ============================================================================
// 急速上架变体加载进度（对齐旧版 bcsUpdateSkuVariantProgressUI）
// ============================================================================
let _qsProgressActive = false;
let _qsProgressTotal = 0;
// 商品图下载：进度 scope 隔离 + 取消标记（避免取消后新会话接到旧 prefetch 进度）
let _imgDlActiveScope = '';
let _imgDlCancelledScopes = {};
/** 当前图片下载会话的目标变体 SKU 列表（进度按此计数，不用全局 _productResponses.length） */
let _imgDlProgressMainSku = '';
let _imgDlProgressSkus = [];
/** scope 开始时已命中缓存的数量（取消后重下同一商品时进度从 0 起） */
let _imgDlScopeCachedBaseline = 0;

function _bcsImgDlScopeCancelled(scope) {
    return !!(scope && _imgDlCancelledScopes[scope]);
}

function _bcsImgDlThrowIfCancelled(scope) {
    if (_bcsImgDlScopeCancelled(scope)) {
        throw new Error('IMG_DL_CANCELLED');
    }
}

function _bcsImgDlCountCachedSkus(skus) {
    var n = 0;
    (skus || []).forEach(function (s) {
        if (_bcsFindProductResBySku(String(s))) n++;
    });
    return n;
}

function _bcsImgDlSetProgressTargets(mainSku, skus) {
    _imgDlProgressMainSku = String(mainSku || '');
    _imgDlProgressSkus = (skus || []).map(function (s) { return String(s); }).filter(Boolean);
    _imgDlScopeCachedBaseline = _bcsImgDlCountCachedSkus(_imgDlProgressSkus);
}

function _bcsImgDlClearProgressTargets() {
    _imgDlProgressMainSku = '';
    _imgDlProgressSkus = [];
    _imgDlScopeCachedBaseline = 0;
}

/** 图片下载 scope 内：按目标 SKU 列表计数，且减去 scope 开始前已缓存数 */
function _bcsImgDlProgressSnapshot() {
    if (!_imgDlActiveScope || !_imgDlProgressSkus.length) return null;
    var total = _imgDlProgressSkus.length;
    var cachedNow = _bcsImgDlCountCachedSkus(_imgDlProgressSkus);
    var current = Math.min(total, Math.max(0, cachedNow - _imgDlScopeCachedBaseline));
    return { current: current, total: total };
}

function _bcsImgDlExpandProgressSkusFromRes(res, mainSku) {
    if (!_imgDlActiveScope || !res || !res.widgetStates) return;
    var sku = String(mainSku || _imgDlProgressMainSku || '').trim();
    if (!sku) return;
    var childSkus = bcsParseChildSkus(res);
    var seen = {};
    var list = [sku].concat(childSkus.map(String)).filter(function (s) {
        if (!s || seen[s]) return false;
        seen[s] = true;
        return true;
    });
    if (list.length) _bcsImgDlSetProgressTargets(sku, list);
}
// 当前 _productResponses/_btFetchedSkus 缓存所对应的主 SKU（进详情页预热写入，弹窗据此判断能否复用）
let _qsCachedMainSku = '';
// 已触发过预热的主 SKU，避免同一商品页轮询期间重复触发
let _qsEagerPrefetchedSku = '';

function _qsEmitProgress() {
    var current;
    var total;
    var imgSnap = _bcsImgDlProgressSnapshot();
    if (_imgDlActiveScope && imgSnap) {
        current = imgSnap.current;
        total = imgSnap.total;
    } else {
        current = _productResponses.length;
        total = Math.max(_qsProgressTotal, current, 1);
    }
    if (_editUploadProgressActive) {
        _bcsEmitEditUploadVariantsProgress();
    }
    if (!_qsProgressActive) return;
    try {
        const detail = { current: current, total: total, pending: Math.max(0, _btInFlight) };
        if (_imgDlActiveScope) detail.imgDlScope = _imgDlActiveScope;
        document.dispatchEvent(new CustomEvent('quick-shelve-progress', { detail: detail }));
    } catch (e) { /* ignore */ }
}

function _qsComputeTotalFromFirstResponse() {
    var resObj = null;
    if (_imgDlActiveScope && _imgDlProgressMainSku) {
        resObj = _bcsFindProductResBySku(_imgDlProgressMainSku);
    }
    if (!resObj && _productResponses.length) {
        var first = _productResponses[0];
        if (first && first.res) resObj = first.res;
    }
    if (!resObj || !resObj.widgetStates) return;
    try {
        const keys = Object.keys(resObj.widgetStates);
        const regex = /^webAspects-\d+-default-1$/;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            if (!regex.test(key)) continue;
            const ws = JSON.parse(resObj.widgetStates[key]);
            let total = 0;
            const aspects = ws && ws.aspects ? ws.aspects : [];
            for (let a = 0; a < aspects.length; a++) {
                const variants = aspects[a].variants || [];
                total += variants.length;
            }
            if (total > 0) {
                _qsProgressTotal = total;
                if (_imgDlActiveScope) {
                    _bcsImgDlExpandProgressSkusFromRes(resObj, _imgDlProgressMainSku);
                }
                // 首个响应已能看出变体总数：>100 立刻切到 20/秒（在拉大批变体之前就降速）
                bcsApplyVariantRateByCount(total);
            }
            return;
        }
    } catch (e) { /* ignore */ }
}

/** 等待所有在途 getBt 请求（含进详情页预热触发的）完成，对齐旧版 bcsWhenBtIdle。
 *  getBt 命中 _btFetchedSkus 会立即短路返回，故 await getBt 后还需等在途清零，否则进度会停在中途。 */
function bcsWhenBtIdle(maxWaitMs) {
    const limit = maxWaitMs || 60000;
    return new Promise(function (resolve) {
        if (_btInFlight <= 0) { resolve(); return; }
        const start = Date.now();
        const iv = setInterval(function () {
            if (_btInFlight <= 0) {
                clearInterval(iv);
                resolve();
                return;
            }
            if (Date.now() - start > limit) {
                clearInterval(iv);
                console.warn('[bcsWhenBtIdle] 超时，仍在进行中:', _btInFlight);
                resolve();
            }
        }, 80);
    });
}

/** 强制把进度补满（不受 _qsProgressActive 限制），避免个别请求失败导致 current<total 残留、进度条卡住 */
function _qsEmitProgressComplete() {
    var imgSnap = _bcsImgDlProgressSnapshot();
    var total;
    var current;
    if (_imgDlActiveScope && imgSnap) {
        total = imgSnap.total;
        current = total;
    } else {
        total = Math.max(_qsProgressTotal, _productResponses.length, 1);
        current = total;
    }
    if (_editUploadProgressActive) {
        var editTotal = Math.max(_qsProgressTotal, _productResponses.length, 1);
        _bcsEmitEditUploadProgress('variants', editTotal, editTotal);
    }
    try {
        const detail = { current: current, total: total, pending: 0 };
        if (_imgDlActiveScope) detail.imgDlScope = _imgDlActiveScope;
        document.dispatchEvent(new CustomEvent('quick-shelve-progress', { detail: detail }));
    } catch (e) { /* ignore */ }
}

async function bcsPrefetchProductData(mainSku, skipRecursive) {
    const sku = String(mainSku || '').trim();
    if (!sku) return false;
    const noRecurse = !!skipRecursive;

    // 本次加载的 429/受限瞬时状态清零（限速档位由切档函数按变体数决定，这里不动）
    bcsResetQsTransient();

    // 开启进度上报
    _qsProgressActive = true;
    _qsProgressTotal = noRecurse ? 1 : 0;
    _qsEmitProgress();

    try {
        // /modal/aspectsNew 全量变体发现与主 SKU 递归拉取并行：补齐 /product 首屏 webAspects
        // 被截断/分页而漏掉的隐藏变体（"展示全部"里的变体）。当前变体模式(skipRecursive=true)不拉全量。
        const _btdPromise = skipRecursive ? null : getBtd(sku);
        // 当前变体模式(noRecurse)只拉当前 1 个 SKU：getBt 不再递归 BFS，避免拉全量变体
        await getBt(sku, noRecurse);
        // 确保 modal 发现的隐藏变体都已交给 getBt（_btInFlight 已计入），再等在途清零
        if (_btdPromise) await _btdPromise;
        // 当前变体模式只拉 1 个 SKU，不等全量变体 BFS 结束；
        // 否则短路场景（进详情页已预热、_btFetchedSkus 命中）下 getBt 立即返回，
        // 这里再等所有在途请求真正完成，对齐旧版 #cj_sale 的 bcsWhenBtIdle，否则进度条停在中途不动。
        if (!noRecurse) {
            await bcsWhenBtIdle();
        }
    } finally {
        if (noRecurse && _editUploadProgressActive) {
            _bcsEmitEditUploadProgress('variants', 1, 1);
        } else {
            _qsEmitProgressComplete();
        }
        _qsProgressActive = false;
    }
    return true;
}

function parseVariantRowFromAspectVariant(v) {
    if (!v || !v.sku) return null;
    const data = v.data || {};
    // 销量与上架时间（best-effort：Ozon 不同接口字段不同，尽量兼容）
    let sales = '';
    if (data.sales != null) sales = String(data.sales);
    else if (data.salesText) sales = String(data.salesText);
    else if (data.searchableText) sales = String(data.searchableText);
    let createdAt = '';
    if (data.createDate) createdAt = String(data.createDate);
    else if (data.createdAt) createdAt = String(data.createdAt);
    else if (data.publishDate) createdAt = String(data.publishDate);
    return {
        sku: String(v.sku),
        title: data.searchableText || data.title || String(v.sku),
        image: data.coverImage || '',
        price: data.price != null ? String(data.price) : '',
        originalPrice: data.originalPrice != null ? String(data.originalPrice) : '',
        blackPrice: '',
        sales: sales,
        createdAt: createdAt,
        pricePairSource: 'aspect',
    };
}

/** webPrice 字段取值（cardPrice / price 可能是对象） */
function _bcsPickWebPriceFieldValue(field) {
    if (field == null || field === '') return '';
    if (typeof field === 'object') {
        if (field.price != null && field.price !== '') return String(field.price);
        if (field.text != null && field.text !== '') return String(field.text);
        if (field.value != null && field.value !== '') return String(field.value);
        return '';
    }
    return String(field);
}

function _bcsParsePriceNumber(text) {
    if (text == null) return 0;
    var s = String(text).trim().replace(/\s+/g, '');
    s = s.replace(/[^\d.,-]/g, '');
    if (!s) return 0;
    if (/^\d{1,3}(?:,\d{3})+$/.test(s) || /^\d{1,3}(?:,\d{3})+\.\d+$/.test(s)) {
        s = s.replace(/,/g, '');
    } else if (/^\d+,\d{1,2}$/.test(s)) {
        s = s.replace(',', '.');
    } else {
        s = s.replace(/,/g, '');
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : 0;
}

/** 绿标=cardPrice，黑标=次档 price（对齐 ozonProductPriceApi） */
function _bcsParseGreenBlackFromWebPriceState(st) {
    var greenText = '';
    var blackText = '';
    if (!st || typeof st !== 'object') return { greenText: greenText, blackText: blackText };
    var cardText = _bcsPickWebPriceFieldValue(st.cardPrice);
    var priceText = _bcsPickWebPriceFieldValue(st.price);
    var originalText = _bcsPickWebPriceFieldValue(st.originalPrice);
    var cardNum = _bcsParsePriceNumber(cardText) || 0;
    var priceNum = _bcsParsePriceNumber(priceText) || 0;
    var originalNum = _bcsParsePriceNumber(originalText) || 0;
    if (cardNum > 0) {
        greenText = cardText;
        if (priceNum > cardNum) blackText = priceText;
    } else if (priceNum > 0) {
        greenText = priceText;
        if (originalNum > priceNum) blackText = originalText;
    } else if (originalNum > 0) {
        greenText = originalText;
    }
    return { greenText: greenText, blackText: blackText };
}

function _bcsFindWebPriceBundleForSku(sku) {
    var key = String(sku || '').trim();
    if (!key) return null;
    for (var i = 0; i < (_productResponses || []).length; i++) {
        var item = _productResponses[i];
        if (!item || String(item.sku) !== key || !item.res || !item.res.widgetStates) continue;
        var keys = Object.keys(item.res.widgetStates);
        for (var ki = 0; ki < keys.length; ki++) {
            if (keys[ki].indexOf('webPrice') === -1) continue;
            try {
                var st = parseStateValue(item.res.widgetStates[keys[ki]]);
                if (!st) continue;
                var pair = _bcsParseGreenBlackFromWebPriceState(st);
                if (pair.greenText && pair.blackText) {
                    return {
                        greenText: pair.greenText,
                        blackText: pair.blackText,
                        strikeText: _bcsPickWebPriceFieldValue(st.originalPrice),
                    };
                }
            } catch (_e) { /* ignore */ }
        }
    }
    return null;
}

function _bcsParseWebPriceBundleFromDom() {
    var priceEl = document.querySelector("[id^='state-webPrice-']");
    if (!priceEl) return null;
    var st = safeJsonParse(priceEl.getAttribute('data-state') || '{}', {});
    var pair = _bcsParseGreenBlackFromWebPriceState(st);
    if (pair.greenText && pair.blackText) {
        return {
            greenText: pair.greenText,
            blackText: pair.blackText,
            strikeText: _bcsPickWebPriceFieldValue(st.originalPrice),
        };
    }
    return null;
}

function _bcsEnrichQuickShelveRowPrices(rows) {
    var pageSku = (window.location.pathname.match(/(\d{7,})/) || [])[1] || '';
    (rows || []).forEach(function (row) {
        if (!row || !row.sku) return;
        var bundle = _bcsFindWebPriceBundleForSku(row.sku);
        if (bundle) {
            row.price = bundle.greenText;
            row.blackPrice = bundle.blackText;
            // 划线原价保留 webAspects 已有值；仅缺失时用 webPrice.originalPrice 补齐
            if (!row.originalPrice && bundle.strikeText) row.originalPrice = bundle.strikeText;
            row.pricePairSource = 'api';
            return;
        }
        if (pageSku && String(row.sku) === pageSku) {
            var domBundle = _bcsParseWebPriceBundleFromDom();
            if (domBundle) {
                row.price = domBundle.greenText;
                row.blackPrice = domBundle.blackText;
                if (!row.originalPrice && domBundle.strikeText) row.originalPrice = domBundle.strikeText;
                row.pricePairSource = 'dom';
                return;
            }
        }
        if (!row.pricePairSource) row.pricePairSource = 'aspect';
    });
}

/** 从 DOM + getBt 缓存收集急速上架 SKU 行 */
/** 单变体兜底：从 _productResponses 缓存按 sku 取 webPrice/webProductHeading/webGallery 拼一行 */
function _bcsSingleVariantRowFromCache(sku) {
    const key = String(sku || '').trim();
    if (!key) return null;
    let price = '';
    let originalPrice = '';
    let title = '';
    let image = '';
    let matched = false;
    for (let i = 0; i < (_productResponses || []).length; i++) {
        const item = _productResponses[i];
        if (!item || String(item.sku) !== key || !item.res || !item.res.widgetStates) continue;
        matched = true;
        const ws = item.res.widgetStates;
        Object.keys(ws).forEach(function (k) {
            const jData = parseStateValue(ws[k]);
            if (!jData || typeof jData !== 'object') return;
            if (k.indexOf('webPrice') !== -1) {
                if (jData.price && !price) price = String(jData.price);
                if (jData.originalPrice && !originalPrice) originalPrice = String(jData.originalPrice);
            }
            if (k.indexOf('webProductHeading') !== -1) {
                if (jData.title && !title) title = String(jData.title);
            }
            if (k.indexOf('webGallery') !== -1 && !image) {
                if (jData.coverImage) {
                    image = String(jData.coverImage);
                } else if (Array.isArray(jData.images) && jData.images.length) {
                    const first = jData.images[0];
                    image = (first && (first.src || first.url)) || '';
                }
            }
        });
    }
    if (!matched) return null;
    return { sku: key, title: title, image: image, price: price, originalPrice: originalPrice };
}

function bcsCollectQuickShelveSkuRows() {
    const seen = new Set();
    const rows = [];

    function pushRow(row) {
        if (!row || !row.sku || seen.has(row.sku)) return;
        seen.add(row.sku);
        rows.push(row);
    }

    const webAspects = document.querySelector("[id*='state-webAspects']");
    if (webAspects) {
        const domState = safeJsonParse(webAspects.getAttribute('data-state') || '', null);
        if (domState && Array.isArray(domState.aspects)) {
            domState.aspects.forEach(function (aspect) {
                (aspect.variants || []).forEach(function (v) {
                    pushRow(parseVariantRowFromAspectVariant(v));
                });
            });
        }
    }

    (_productResponses || []).forEach(function (item) {
        if (!item || !item.res || !item.res.widgetStates) return;
        Object.keys(item.res.widgetStates).forEach(function (key) {
            if (key.indexOf('webAspects') === -1) return;
            try {
                const ws = parseStateValue(item.res.widgetStates[key]);
                if (!ws || !Array.isArray(ws.aspects)) return;
                ws.aspects.forEach(function (aspect) {
                    (aspect.variants || []).forEach(function (v) {
                        pushRow(parseVariantRowFromAspectVariant(v));
                    });
                });
            } catch (_e) { /* ignore */ }
        });
    });

    // 单变体兜底：无 webAspects（含列表页卡片点开当前商品）时补一行主 SKU。
    // 主 SKU 优先取 _qsCachedMainSku（卡片传入/详情页预热的 wantSku，prefetch 后数据已在 _productResponses）；
    // 仅当前正停在该商品详情页时才用 URL pathname 兜底。
    if (!rows.length) {
        const pathSku = (window.location.pathname.match(/(\d{7,})/) || [])[1] || '';
        const fallbackSku = String(_qsCachedMainSku || '').trim() || pathSku;
        if (fallbackSku) {
            const cached = _bcsSingleVariantRowFromCache(fallbackSku) || {};
            let price = cached.price || '';
            let originalPrice = cached.originalPrice || '';
            let title = cached.title || '';
            let image = cached.image || '';
            // DOM 兜底：仅当 DOM 当前商品就是 fallbackSku 时才取，避免列表页拿到错误商品的 DOM
            if ((!price || !title || !image) && pathSku === fallbackSku) {
                const priceEl = document.querySelector("[id^='state-webPrice-']");
                if (priceEl) {
                    const st = safeJsonParse(priceEl.getAttribute('data-state') || '{}', {});
                    if (st.price && !price) price = String(st.price);
                    if (st.originalPrice && !originalPrice) originalPrice = String(st.originalPrice);
                }
                const headingEl = document.querySelector("[id^='state-webProductHeading']");
                if (headingEl) {
                    const st = safeJsonParse(headingEl.getAttribute('data-state') || '{}', {});
                    if (st.title && !title) title = String(st.title);
                }
                if (!image) {
                    const img = document.querySelector('[data-widget="webGallery"] img, .pdp_b6j img');
                    if (img) image = img.getAttribute('src') || '';
                }
            }
            pushRow({
                sku: fallbackSku,
                title: title || fallbackSku,
                image: image,
                price: price,
                originalPrice: originalPrice,
                sales: '',
                createdAt: '',
                pricePairSource: 'aspect',
            });
        }
    }

    _bcsEnrichQuickShelveRowPrices(rows);

    return rows;
}

/** Ozon 图片 URL 去掉 wc 缩略图路径，与 primaryImage 处理一致 */
function bcsNormalizeOzonImageUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return '';
    return imageUrl.replace(/\/wc\d+\//, '/');
}

/** 从 Page1 widgetStates 的 webAspects 中，按 SKU 匹配变体的 coverImage（颜色样本） */
function bcsExtractColorImageFromWidgetStates(widgetStates, targetSku) {
    if (!widgetStates || !targetSku) return '';
    const skuStr = String(targetSku);
    const keys = Object.keys(widgetStates);
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (key.indexOf('webAspects') === -1) continue;
        try {
            const state = parseStateValue(widgetStates[key]);
            const img = bcsExtractColorImageFromAspectsState(state, skuStr);
            if (img) return img;
        } catch (_e) { /* ignore */ }
    }
    return '';
}

/** 从 webAspects 的 aspects 数组中按 SKU 提取 coverImage */
function bcsExtractColorImageFromAspectsState(aspectsState, targetSku) {
    if (!aspectsState || !targetSku) return '';
    const skuStr = String(targetSku);
    const aspects = aspectsState.aspects || [];
    for (let ai = 0; ai < aspects.length; ai++) {
        const variants = aspects[ai].variants || [];
        for (let vi = 0; vi < variants.length; vi++) {
            const v = variants[vi];
            if (!v || String(v.sku) !== skuStr || !v.data) continue;
            const img = v.data.coverImage || v.data.picture || '';
            if (img) return bcsNormalizeOzonImageUrl(img);
        }
    }
    return '';
}

/** 优先从 getBt 已缓存的 _productResponses 取 Page1 颜色样本，避免重复请求 */
function _extractColorImageFromProductResponses(sku) {
    const key = String(sku || '').trim();
    if (!key) return '';
    for (let i = 0; i < (_productResponses || []).length; i++) {
        const item = _productResponses[i];
        if (!item || !item.res || !item.res.widgetStates) continue;
        const img = bcsExtractColorImageFromWidgetStates(item.res.widgetStates, key);
        if (img) return img;
    }
    return '';
}

/** 直上模式：解析单个 SKU 的颜色样本图 URL（对齐旧版 crawler.js bcsResolveColorImageForSku） */
function bcsResolveColorImageForSku(sku, listDetail) {
    const skuStr = String(sku || '').trim();
    if (!skuStr) return '';

    if (listDetail && listDetail.color_image) {
        return listDetail.color_image;
    }

    // 对齐旧版 C.skus：DOM / 缓存中的 webAspects 变体 + 表格行 image
    const webAspects = document.querySelector("[id*='state-webAspects']");
    if (webAspects) {
        try {
            const domState = safeJsonParse(webAspects.getAttribute('data-state') || '', null);
            if (domState && Array.isArray(domState.aspects)) {
                for (let ai = 0; ai < domState.aspects.length; ai++) {
                    const variants = domState.aspects[ai].variants || [];
                    for (let vi = 0; vi < variants.length; vi++) {
                        const v = variants[vi];
                        if (!v || String(v.sku) !== skuStr) continue;
                        const d = v.data || {};
                        const fromVariant = d.coverImage || d.picture || v.img || '';
                        if (fromVariant) return bcsNormalizeOzonImageUrl(fromVariant);
                    }
                }
            }
        } catch (_e) { /* ignore */ }
    }

    const fromCache = _extractColorImageFromProductResponses(skuStr);
    if (fromCache) return fromCache;

    try {
        const aspectEls = document.querySelectorAll("[id*='state-webAspects']");
        for (let ei = 0; ei < aspectEls.length; ei++) {
            const stateStr = aspectEls[ei].getAttribute('data-state') || '';
            if (!stateStr) continue;
            const stateObj = JSON.parse(stateStr);
            const fromDom = bcsExtractColorImageFromAspectsState(stateObj, skuStr);
            if (fromDom) return fromDom;
        }
    } catch (_e) { /* ignore */ }

    const rows = bcsCollectQuickShelveSkuRows();
    for (let si = 0; si < rows.length; si++) {
        if (String(rows[si].sku) === skuStr && rows[si].image) {
            return bcsNormalizeOzonImageUrl(rows[si].image);
        }
    }

    return '';
}

/** 从 widgetStates 提取 webGallery 视频（供 getBt 缓存与网络响应复用） */
function _extractVideoFromWidgetStates(widgetStates) {
    const out = { video_cover: [], video_poster: [] };
    if (!widgetStates) return out;
    Object.keys(widgetStates).forEach(function (key) {
        if (key.indexOf('webGallery') === -1) return;
        try {
            const galleryData = parseStateValue(widgetStates[key]);
            if (galleryData && Array.isArray(galleryData.videos)) {
                out.video_cover = galleryData.videos.map(function (v) { return v && (v.url || v.src); }).filter(Boolean);
                out.video_poster = galleryData.videos.map(function (v) {
                    return v && (v.cover || v.preview || v.poster || '');
                }).filter(Boolean);
            }
        } catch (_e) { /* ignore */ }
    });
    return out;
}

/** 优先从 getBt 已缓存的 _productResponses 取 Page1 视频，避免重复请求 */
function _extractVideoFromProductResponses(sku) {
    const key = String(sku || '').trim();
    if (!key) return { video_cover: [], video_poster: [] };
    for (let i = 0; i < (_productResponses || []).length; i++) {
        const item = _productResponses[i];
        if (!item || String(item.sku) !== key || !item.res || !item.res.widgetStates) continue;
        const v = _extractVideoFromWidgetStates(item.res.widgetStates);
        if (v.video_cover.length || v.video_poster.length) return v;
    }
    return { video_cover: [], video_poster: [] };
}

/** 从 Page2 widgetStates 解析 description/hashtags/richAnnotationJson（复用完整 parseCommonFromApiWidgetStates，含 Описание 优选与 string 型 richAnnotationJson 解析） */
function _extractCommonFromPage2WidgetStates(widgetStates) {
    const retData = {
        description: '',
        tags: [],
        richAnnotationJson: null,
        common_attributes: [],
    };
    parseCommonFromApiWidgetStates(widgetStates, retData);
    return {
        description: retData.description || '',
        hashtags: retData.tags || [],
        richAnnotationJson: retData.richAnnotationJson || null,
    };
}

/** 仅从 Page1 widgetStates 提取 hashtags（Page1 不含完整 webDescription，禁止从此取富文本） */
function _extractHashtagsFromWidgetStates(widgetStates) {
    const hashtags = [];
    if (!widgetStates) return hashtags;
    Object.keys(widgetStates).forEach(function (k) {
        if (k.indexOf('webHashtags') === -1) return;
        try {
            const htData = parseStateValue(widgetStates[k]);
            if (htData && Array.isArray(htData.badges) && !hashtags.length) {
                htData.badges.forEach(function (b) {
                    if (b && b.text) hashtags.push(b.text);
                });
            }
        } catch (_e) { /* ignore */ }
    });
    return hashtags;
}

function mergeSkuCommon(into, from) {
    if (!from) return into;
    if (!into.description && from.description) into.description = from.description;
    if (!into.richAnnotationJson && from.richAnnotationJson) into.richAnnotationJson = from.richAnnotationJson;
    if ((!into.hashtags || !into.hashtags.length) && from.hashtags && from.hashtags.length) {
        into.hashtags = from.hashtags.slice();
    }
    return into;
}

function getSkuCommonFromProductResponses(sku) {
    const result = { description: '', hashtags: [], richAnnotationJson: null };
    const skuStr = String(sku || '');
    // Page1 getBt 缓存仅用于 hashtags；富文本/描述必须走 Page2 或当前页 DOM，避免 Page1 残缺 widget 污染 richAnnotationJson
    (_productResponses || []).forEach(function (item) {
        if (String(item.sku || '') !== skuStr || !item.res || !item.res.widgetStates) return;
        if (!result.hashtags.length) {
            result.hashtags = _extractHashtagsFromWidgetStates(item.res.widgetStates);
        }
    });
    (_commonMetaResponses || []).forEach(function (item) {
        if (String(item.sku || '') !== skuStr || !item.res || !item.res.widgetStates) return;
        if (!result.hashtags.length) {
            result.hashtags = _extractHashtagsFromWidgetStates(item.res.widgetStates);
        }
    });
    return result;
}

function needsSkuCommonFetch(common) {
    return !common || !common.richAnnotationJson || !common.description;
}

/** 详情页：按 SKU 解析 description/hashtags/richAnnotationJson/video（优先缓存，缺失则请求 Page 2） */
async function resolveDetailSkuCommon(sku, mainSkuId) {
    const common = getSkuCommonFromProductResponses(sku);
    const isMainSku = String(sku) === String(mainSkuId || '');
    let video = _extractVideoFromProductResponses(String(sku));

    if (isMainSku) {
        if (!common.richAnnotationJson) {
            try {
                const descStateEl = document.querySelector("[id*='state-webDescription']");
                if (descStateEl) {
                    const descStateObj = parseStateValue(descStateEl.getAttribute('data-state') || '');
                    const domRich = descStateObj && parseRichAnnotationObject(descStateObj.richAnnotationJson);
                    if (domRich) common.richAnnotationJson = domRich;
                    if (!common.description && typeof descStateObj.richAnnotation === 'string' && descStateObj.richAnnotation) {
                        common.description = descStateObj.richAnnotation;
                    }
                }
            } catch (_e) { /* ignore */ }
        }
        if (needsSkuCommonFetch(common)) {
            try {
                const page2Res = await getOrFetchPage2Widgets(mainSkuId, '');
                mergeSkuCommon(common, _extractCommonFromPage2WidgetStates(page2Res && page2Res.widgetStates));
            } catch (_e) { /* ignore */ }
        }
        if (!common.hashtags.length) {
            try {
                const hashtagWidget = document.querySelector('[data-widget="webHashtags"]');
                if (hashtagWidget) {
                    hashtagWidget.querySelectorAll('[title^="#"]').forEach(function (el) {
                        const tag = (el.getAttribute('title') || '').trim();
                        if (tag && common.hashtags.indexOf(tag) === -1) common.hashtags.push(tag);
                    });
                }
            } catch (_e) { /* ignore */ }
        }
        if (!video.video_cover.length && !video.video_poster.length) {
            try {
                const fetched = await bcsFetchSkuProductDetail(String(sku));
                if (!video.video_cover.length && !video.video_poster.length) {
                    video = { video_cover: fetched.video_cover || [], video_poster: fetched.video_poster || [] };
                }
            } catch (_e) { /* ignore */ }
        }
        return {
            description: common.description || '',
            hashtags: common.hashtags || [],
            richAnnotationJson: common.richAnnotationJson,
            video_cover: video.video_cover || [],
            video_poster: video.video_poster || [],
        };
    }

    // 非主 SKU 变体：始终按 SKU 直拉 Page2（对齐旧版 fetchSkuProductDetail 并行 Page1+2）
    try {
        const fetched = await bcsFetchSkuProductDetail(String(sku));
        common.description = fetched.description || common.description;
        common.richAnnotationJson = fetched.richAnnotationJson || common.richAnnotationJson;
        if (fetched.hashtags && fetched.hashtags.length) common.hashtags = fetched.hashtags;
        if (!video.video_cover.length && !video.video_poster.length) {
            video = { video_cover: fetched.video_cover || [], video_poster: fetched.video_poster || [] };
        }
    } catch (e) {
        console.warn('[bcs] resolveDetailSkuCommon 异常, sku=' + sku + ':', e);
    }

    return {
        description: common.description || '',
        hashtags: common.hashtags || [],
        richAnnotationJson: common.richAnnotationJson,
        video_cover: video.video_cover || [],
        video_poster: video.video_poster || [],
    };
}

/** 从 Page2 widgetStates 解析描述/标签/富文本到 result */
function _applyPage2WidgetsToSkuDetail(widgetStates, result) {
    if (!widgetStates || !result) return;
    const page2Common = _extractCommonFromPage2WidgetStates(widgetStates);
    if (page2Common.description) result.description = page2Common.description;
    if (page2Common.hashtags.length) result.hashtags = page2Common.hashtags;
    if (page2Common.richAnnotationJson) result.richAnnotationJson = page2Common.richAnnotationJson;
}

async function bcsFetchSkuProductDetail(sku) {
    const skuKey = String(sku || '').trim();
    const host = window.location.href.indexOf('ozon.kz') !== -1 ? 'https://ozon.kz' : 'https://www.ozon.ru';
    const result = { description: '', hashtags: [], richAnnotationJson: null, video_cover: [], video_poster: [], color_image: '' };
    try {
        // Page1 视频 / 颜色样本：优先复用 getBt 缓存，精铺/预热后不再打 Page1
        const videoFromCache = _extractVideoFromProductResponses(skuKey);
        result.video_cover = videoFromCache.video_cover;
        result.video_poster = videoFromCache.video_poster;
        result.color_image = _extractColorImageFromProductResponses(skuKey);

        // Page2：非当前详情页 SKU 必须按 /product/{sku}/ 直拉，避免命中当前页 pathname 缓存
        let page2Res = await _fetchPage2WidgetsDirectBySku(skuKey);
        if (page2Res && page2Res.widgetStates) {
            _applyPage2WidgetsToSkuDetail(page2Res.widgetStates, result);
        }

        // Page1 仅当缓存未提供视频或颜色样本时才补拉
        if (!result.video_cover.length && !result.video_poster.length || !result.color_image) {
            const page1Url = host + '/api/entrypoint-api.bx/page/json/v2?url=' + encodeURIComponent('/product/' + skuKey + '/');
            const page1Res = await fetch(page1Url).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
            if (page1Res && page1Res.widgetStates) {
                if (!result.color_image) {
                    result.color_image = bcsExtractColorImageFromWidgetStates(page1Res.widgetStates, skuKey);
                }
                if (!result.video_cover.length && !result.video_poster.length) {
                    const v = _extractVideoFromWidgetStates(page1Res.widgetStates);
                    result.video_cover = v.video_cover;
                    result.video_poster = v.video_poster;
                }
            }
        }
    } catch (e) {
        console.warn('[bcs] fetchSkuProductDetail', skuKey, e);
    }
    return result;
}

// ============================================================================
// 商品图下载：仅解析 gallery（cover + images），不触碰 buildEditUploadDataBySku
// 取值口径对齐 parseGalleryFromWidgetStates（img.src || img.url），但只返回图片、
// 不写 retData、不升 wc（wc1000 升级在 ISOLATED 侧按"仅 zip 内轮播"规则做）。
// ============================================================================
function bcsParseGalleryOnly(widgetStates) {
    var cover = '';
    var images = [];
    if (!widgetStates) return { cover: cover, images: images };
    Object.keys(widgetStates).forEach(function (key) {
        var jData = parseStateValue(widgetStates[key]);
        if (!jData || typeof jData !== 'object') return;
        var hasGalleryKey = key.indexOf('webGallery') !== -1;
        var hasGalleryShape = !!(jData.coverImage || Array.isArray(jData.images));
        if (!hasGalleryKey && !hasGalleryShape) return;
        if (!cover && jData.coverImage) cover = String(jData.coverImage);
        if (!images.length && Array.isArray(jData.images)) {
            images = jData.images
                .map(function (img) { return img && (img.src || img.url); })
                .filter(Boolean);
        }
    });
    return { cover: cover, images: images };
}

function _bcsFindProductResBySku(sku) {
    var key = String(sku);
    for (var i = 0; i < (_productResponses || []).length; i++) {
        if (String(_productResponses[i].sku) === key) return _productResponses[i].res;
    }
    return null;
}

/**
 * 采集指定商品的变体图库（仅 gallery，不调用 buildEditUploadDataBySku）。
 * @param {{ mainSku?:string, variantSkus?:string[], mode?:'variant'|'all', prefetchIfMissing?:boolean }} opts
 * @returns {Promise<{ galleries: Record<string,{cover:string,images:string[]}> }>}
 */
async function bcsCollectVariantGalleries(opts) {
    var o = opts || {};
    var mainSku = String(o.mainSku || '').trim();
    var requested = Array.isArray(o.variantSkus)
        ? o.variantSkus.map(function (s) { return String(s).trim(); }).filter(Boolean)
        : [];
    var mode = o.mode === 'all' ? 'all' : 'variant';
    var prefetch = o.prefetchIfMissing !== false;
    var imgDlScope = o.imgDlScope ? String(o.imgDlScope) : '';

    if (imgDlScope && mainSku) {
        _bcsImgDlSetProgressTargets(mainSku, [mainSku]);
    }

    function collectFor(skus) {
        var out = {};
        var seen = {};
        (skus || []).forEach(function (sku) {
            var s = String(sku);
            if (!s || seen[s]) return;
            seen[s] = true;
            var res = _bcsFindProductResBySku(s);
            if (!res) return;
            var g = bcsParseGalleryOnly(res.widgetStates);
            if (g.cover || (g.images && g.images.length)) out[s] = g;
        });
        return out;
    }

    if (mode === 'all') {
        // 全部变体：优先复用预热缓存，缺失则对主 SKU 递归预拉（emits quick-shelve-progress）
        if (prefetch && mainSku) {
            _bcsImgDlThrowIfCancelled(imgDlScope);
            await bcsPrefetchProductData(mainSku, false);
            _bcsImgDlThrowIfCancelled(imgDlScope);
            await bcsWhenBtIdle();
            _bcsImgDlThrowIfCancelled(imgDlScope);
        }
        // 变体 SKU 列表：调用方传入优先（详情 webAspects DOM），否则从主 SKU Page1 的
        // variants[].sku 派生（避免误取到缓存里别的商品的变体）；主 Page1 缺失再退回缓存全量。
        var skus = requested.slice();
        if (!skus.length) {
            var mainRes = mainSku ? _bcsFindProductResBySku(mainSku) : null;
            if (mainRes) {
                skus = [mainSku].concat(bcsParseChildSkus(mainRes).map(String));
            } else if (!imgDlScope) {
                skus = (_productResponses || []).map(function (it) { return String(it.sku); });
            } else {
                skus = mainSku ? [mainSku] : [];
            }
        }
        if (imgDlScope && skus.length) {
            _bcsImgDlSetProgressTargets(mainSku, skus);
        }
        // 传入了变体列表但缓存缺某个：逐个补拉
        if (requested.length && prefetch) {
            for (var i = 0; i < skus.length; i++) {
                _bcsImgDlThrowIfCancelled(imgDlScope);
                if (!_bcsFindProductResBySku(skus[i])) {
                    await getBt(skus[i]);
                }
            }
            await bcsWhenBtIdle();
            _bcsImgDlThrowIfCancelled(imgDlScope);
        }
        // 收集用 BFS 全量闭包（_productResponses），而非上面的浅层 skus：
        // webAspects 单跳只枚举「各维度代表 SKU」（≈各维度取值数之和），会漏掉笛卡尔积组合
        // （如 11 色 × 3 尺码 = 33，单跳仅 ~11）。预拉的 getBt 已递归走遍整张变体网格，
        // 全部变体的 Page1 都在 _productResponses 里；且缓存按主商品 scope 隔离（换商品即清），
        // 不会串入别的商品，故此处直接取缓存全量最完整。缓存为空时兜底回退浅层 skus。
        var closureSkus = (_productResponses || []).map(function (it) { return String(it.sku); });
        return { galleries: collectFor(closureSkus.length ? closureSkus : skus) };
    }

    // 当前变体（单个 SKU）：命中缓存直接用，未命中打一次 Page1（同 getBt 单次请求）
    var targetSku = requested[0] || mainSku;
    if (imgDlScope && targetSku) {
        _bcsImgDlSetProgressTargets(mainSku || targetSku, [targetSku]);
    }
    if (targetSku && !_bcsFindProductResBySku(targetSku) && prefetch) {
        _bcsImgDlThrowIfCancelled(imgDlScope);
        await getBt(targetSku);
        _bcsImgDlThrowIfCancelled(imgDlScope);
        await bcsWhenBtIdle();
        _bcsImgDlThrowIfCancelled(imgDlScope);
    }
    return { galleries: collectFor(targetSku ? [targetSku] : []) };
}

window.bcsVariantBuilder = {
    buildEditUploadDataBySku: buildEditUploadDataBySku,
    reset: bcsVariantBuilderReset,
    fetchGalleryForRows: bcsFetchGalleryForRows,
    fetchTitlesForRows: bcsFetchTitlesForRows,
    cacheSkuShopsFromApi: _cacheSkuShopsFromResponse,
    get productResponses() {
        return _productResponses;
    },
};
window.bcsPrefetchProductData = bcsPrefetchProductData;
window.bcsCollectQuickShelveSkuRows = bcsCollectQuickShelveSkuRows;
window.bcsFetchSkuProductDetail = bcsFetchSkuProductDetail;
window.bcsFetchGalleryForRows = bcsFetchGalleryForRows;
window.bcsFetchTitlesForRows = bcsFetchTitlesForRows;
window.bcsResolveColorImageForSku = bcsResolveColorImageForSku;
window.bcsResolveDetailSkuCommon = resolveDetailSkuCommon;

// ============================================================================
// 急速上架变体预热（对齐旧版 crawler.js loadDatas:1817：进商品详情页即后台 getBt 全部变体）
// 进页面就把变体拉进 _productResponses/_btFetchedSkus，点开"急速上架"弹窗时直接命中缓存秒出，
// 而不是等弹窗打开后才从零开始拉。
// ============================================================================
function _bcsIsOzonProductPage() {
    const u = window.location.href;
    return u.indexOf('ozon.ru/product') !== -1 || u.indexOf('ozon.kz/product') !== -1;
}

function _bcsExtractPageSku() {
    return (window.location.pathname.match(/(\d{7,})/) || [])[1] || '';
}

/** 读 DOM webAspects 拿全部兄弟变体并逐个 getBt（fire-and-forget，仅预热缓存）。
 *  webAspects 渲染较慢时短期轮询等待（~8s，对齐旧版 processWebAspectsOnce 的轮询窗口）。 */
function bcsEagerPrefetchVariants() {
    if (!_bcsIsOzonProductPage()) return;
    const pageSku = _bcsExtractPageSku();
    if (!pageSku || pageSku === _qsEagerPrefetchedSku) return;

    let attempts = 0;
    const maxAttempts = 40; // 40 * 200ms ≈ 8s
    const timer = setInterval(function () {
        attempts++;
        // 等待期间用户已切走到别的商品 → 放弃本次预热
        if (_bcsExtractPageSku() !== pageSku) {
            clearInterval(timer);
            return;
        }

        const wa = document.querySelector("[id*='state-webAspects']");
        let aspects = null;
        if (wa) {
            try {
                const st = safeJsonParse(wa.getAttribute('data-state') || '', null);
                if (st && Array.isArray(st.aspects)) aspects = st.aspects;
            } catch (e) { /* ignore */ }
        }

        const ready = !!(aspects && aspects.length);
        if (!ready && attempts < maxAttempts) return;

        clearInterval(timer);
        _qsEagerPrefetchedSku = pageSku;
        // 切换商品：先清掉上一个商品的变体缓存，避免混入
        if (_qsCachedMainSku && _qsCachedMainSku !== pageSku) {
            bcsVariantBuilderReset();
        }
        _qsCachedMainSku = pageSku;

        // 新商品预热：清掉上次的 429/受限瞬时状态
        bcsResetQsTransient();

        // 先按变体数定限速档位（>100 → 20/秒），再开拉，避免大商品一上来就 50/秒猛冲触发限频
        const skuSet = new Set();
        if (ready) {
            aspects.forEach(function (aspect) {
                (aspect.variants || []).forEach(function (v) {
                    if (v && v.sku) skuSet.add(String(v.sku));
                });
            });
        }
        bcsApplyVariantRateByCount(skuSet.size);

        // 主 SKU + 可见变体后台预拉（fire-and-forget；getBt 内部按 _btFetchedSkus 去重）
        getBt(pageSku);
        skuSet.forEach(function (s) { getBt(s); });
        // 进详情页即拉「全量变体」（含"展示全部"隐藏变体），对齐旧插件 loadDatas:1833 的 getBtd(id)：
        // 点急速上架时命中缓存秒开。fire-and-forget；_btdPromises 去重，点击链路复用同一 promise 不重复打 modal。
        getBtd(pageSku);
    }, 200);
}

/** SPA 导航监听：商品 SKU 变化时重新预热（对齐旧版 nav→loadDatas 重新触发） */
function bcsStartEagerPrefetchWatcher() {
    let lastSku = '';
    function tick() {
        if (!_bcsIsOzonProductPage()) {
            lastSku = '';
            return;
        }
        const sku = _bcsExtractPageSku();
        if (sku && sku !== lastSku) {
            lastSku = sku;
            bcsEagerPrefetchVariants();
        }
    }
    tick();
    setInterval(tick, 1000);
}

// 延迟启动，避免与页面首屏渲染争抢 + 轻微防风控
setTimeout(bcsStartEagerPrefetchWatcher, 1500);

// 监听来自隔离世界（ISOLATED）的消息，并返回 window 数据
(function () {
    'use strict';

    // 模拟真人鼠标滑动，防风控
    let moveCount = 0;
    const clientX = 100 + Math.random() * 200;
    const clientY = 200 + Math.random() * 300;
    const maxMoves = Math.floor(Math.random() * 10) + 5; // 5~15次滑动
    const moveInterval = setInterval(() => {
        moveCount++;
        const mousemove = new MouseEvent('mousemove', {
            bubbles: true,
            cancelable: true,
            clientX: clientX + (Math.random() - 0.5) * 30,
            clientY: clientY - moveCount * 10, // 慢慢向上滑（像看商品）
        });
        document.dispatchEvent(mousemove);
        if (moveCount >= maxMoves) {
            clearInterval(moveInterval);
            setTimeout(() => {
                const scrollY = Math.floor(Math.random() * 200) + 50; // 滚 50~250px
                window.scrollBy({
                    top: scrollY,
                    behavior: 'smooth',
                });
            }, 200);
        }
    }, Math.random() * 300 + 100);

    // 急速上架：ISOLATED 世界请求 MAIN 世界采集变体
    document.addEventListener('bcs-cache-sku-shops', function (event) {
        const detail = event && event.detail;
        if (!detail || !detail.sku) return;
        _cacheSkuShopsFromResponse(detail.sku, {
            categories: detail.categories,
            attributes: detail.attributes,
        });
    });

    document.addEventListener('quick-shelve-req', async function (event) {
        const detail = event && event.detail;
        if (!detail || !detail.requestId) return;
        const dispatch = function (payload) {
            document.dispatchEvent(new CustomEvent('quick-shelve-res', {
                detail: Object.assign({ requestId: detail.requestId }, payload),
            }));
        };
        try {
            if (detail.action === 'loadSkuRows') {
                const targetSku = detail.targetSku ? String(detail.targetSku) : '';
                const pageSku = (window.location.pathname.match(/(\d{7,})/) || [])[1] || '';
                const wantSku = targetSku || pageSku;
                // reset 改为 SKU 感知：请求的主 SKU 与预热缓存一致时复用预热结果（对齐旧版详情页
                // #cj_sale 不重拉、直接用已预热的 _productResponses）；仅切换到别的商品才清缓存重拉。
                if (detail.reset && !(wantSku && wantSku === _qsCachedMainSku)) {
                    bcsVariantBuilderReset();
                }
                if (wantSku) _qsCachedMainSku = wantSku;
                if (targetSku) {
                    await bcsPrefetchProductData(targetSku, !!detail.skipVariants);
                } else if (detail.prefetchPageSku) {
                    if (pageSku) await bcsPrefetchProductData(pageSku, false);
                }
                const qsRows = bcsCollectQuickShelveSkuRows();
                dispatch({
                    success: true,
                    rows: qsRows,
                    qsBlocked: _qsBlocked,
                    qsDropped: _qsDroppedCount,
                    qsTotal: Math.max(_qsProgressTotal, qsRows.length),
                });
                return;
            }
            if (detail.action === 'fetchSkuDetail') {
                const data = await bcsFetchSkuProductDetail(String(detail.sku || ''));
                dispatch({ success: true, data: data });
                return;
            }
            if (detail.action === 'getVariantGalleries') {
                // 商品图下载：只取 gallery，不清缓存、不调用 buildEditUploadDataBySku。
                // 复用详情页预热的 _productResponses；缺失时 getBt/prefetch 自补。
                var imgScope = detail.progressScopeId ? String(detail.progressScopeId) : '';
                var prevImgScope = _imgDlActiveScope;
                var reqMainSku = detail.mainSku ? String(detail.mainSku).trim() : '';
                // 切换商品时清变体缓存，避免上一商品 177 变体污染进度与 gallery
                if (reqMainSku && reqMainSku !== _qsCachedMainSku) {
                    bcsVariantBuilderReset();
                    bcsResetQsTransient();
                }
                if (reqMainSku) _qsCachedMainSku = reqMainSku;
                if (imgScope) {
                    _imgDlActiveScope = imgScope;
                    delete _imgDlCancelledScopes[imgScope];
                    if (reqMainSku) _bcsImgDlSetProgressTargets(reqMainSku, [reqMainSku]);
                }
                try {
                    if (imgScope && _bcsImgDlScopeCancelled(imgScope)) {
                        dispatch({ success: false, error: 'IMG_DL_CANCELLED' });
                        return;
                    }
                    const result = await bcsCollectVariantGalleries({
                        mainSku: detail.mainSku,
                        variantSkus: detail.variantSkus,
                        mode: detail.mode,
                        prefetchIfMissing: detail.prefetchIfMissing,
                        imgDlScope: imgScope,
                    });
                    if (imgScope && _bcsImgDlScopeCancelled(imgScope)) {
                        dispatch({ success: false, error: 'IMG_DL_CANCELLED' });
                        return;
                    }
                    dispatch({ success: true, galleries: (result && result.galleries) || {} });
                } catch (e) {
                    if (e && e.message === 'IMG_DL_CANCELLED') {
                        dispatch({ success: false, error: 'IMG_DL_CANCELLED' });
                        return;
                    }
                    throw e;
                } finally {
                    if (imgScope && _imgDlActiveScope === imgScope) {
                        _imgDlActiveScope = prevImgScope;
                        _bcsImgDlClearProgressTargets();
                    }
                }
                return;
            }
            if (detail.action === 'cancelImageDownload') {
                var cancelScope = detail.progressScopeId ? String(detail.progressScopeId) : '';
                if (cancelScope) _imgDlCancelledScopes[cancelScope] = true;
                if (cancelScope && _imgDlActiveScope === cancelScope) {
                    _bcsImgDlClearProgressTargets();
                }
                // 图片下载取消：清变体缓存，避免换商品/重试时进度与 gallery 沿用上一任务
                bcsVariantBuilderReset();
                bcsResetQsTransient();
                _qsCachedMainSku = '';
                dispatch({ success: true });
                return;
            }
            if (detail.action === 'resolveColorImage') {
                const skuKey = String(detail.sku || '');
                const listDetail = detail.listDetail || null;
                const colorImage = bcsResolveColorImageForSku(skuKey, listDetail);
                dispatch({ success: true, colorImage: colorImage });
                return;
            }
            if (detail.action === 'resolveDetailSkuCommon') {
                const data = await resolveDetailSkuCommon(
                    String(detail.sku || ''),
                    String(detail.mainSkuId || ''),
                );
                dispatch({ success: true, data: data });
                return;
            }
            if (detail.action === 'buildEditUploadData') {
                const sku = String(detail.sku || '');
                const skipVariants = detail.skipVariants !== false;
                _editUploadProgressActive = !!detail.progress;
                _editUploadSkipVariants = skipVariants;
                _editUploadTargetSku = sku;
                try {
                    // 切换商品时清空上一个商品的变体缓存，避免 rows/属性混入（对齐 loadSkuRows / 详情页预热切换逻辑）
                    if (sku && (detail.forceReset || sku !== _qsCachedMainSku)) {
                        bcsVariantBuilderReset();
                        bcsResetQsTransient();
                    }
                    if (sku) _qsCachedMainSku = sku;
                    if (detail.prefetch && sku) {
                        const onDetail = window.location.href.indexOf('ozon.ru/product') !== -1
                            || window.location.href.indexOf('ozon.kz/product') !== -1;
                        if (skipVariants) {
                            // 当前变体：只 ensure 当前 SKU 的 getBt，进度 1/1，不等全量预热
                            await bcsPrefetchProductData(sku, true);
                        } else if (onDetail && isVariantBtIdle() && _productResponses.length > 0) {
                            // 全部变体：缓存已预热且 idle 时只等在途请求结束
                            await bcsWhenBtIdle(20000);
                        } else {
                            await bcsPrefetchProductData(sku, false);
                        }
                    }
                    if (_editUploadProgressActive) {
                        _bcsEmitEditUploadVariantsProgress();
                    }
                    const data = await buildEditUploadDataBySku(sku, {
                        // 编辑上架/急速上架路径：对齐旧插件只对主 SKU 调一次 /sku/shops 取类目，
                        // 不逐变体补 goodsSize/特征属性（否则「全部变体」会逐变体打 /sku/shops，
                        // 并发仅 3，多变体商品要多花数秒，即"正在采集商品属性"慢的根因）。
                        // 1688 采集走 getWindowData → buildEditUploadDataBySku() 不传 options，仍走全量逐变体。
                        skuShopsMainOnly: true,
                        singleVariantOnly: skipVariants,
                        forceRefresh: !!detail.forceReset,
                    });
                    dispatch({ success: true, data: data || {} });
                } finally {
                    _editUploadProgressActive = false;
                    _editUploadSkipVariants = false;
                    _editUploadTargetSku = '';
                }
                return;
            }
            if (detail.action === 'fetchGalleryForRows') {
                await bcsFetchGalleryForRows(detail.rows || []);
                dispatch({ success: true });
                return;
            }
            if (detail.action === 'fetchTitlesForRows') {
                await bcsFetchTitlesForRows(detail.rows || [], detail.pageSku || detail.sku || '');
                dispatch({ success: true });
                return;
            }
            dispatch({ success: false, error: '未知 action' });
        } catch (e) {
            dispatch({ success: false, error: (e && e.message) || 'MAIN 世界执行失败' });
        }
    });

    // 延迟执行，防风控
    setTimeout(() => {
        // 监听来自隔离世界的消息（使用 document 事件，因为隔离世界和 MAIN 世界共享同一个 document）
        document.addEventListener('ext-req', async function (event) {
            if (event.detail && event.detail.action === 'getWindowData') {
                let result = null;
                let source = null;

                // 先判断 Ozon 当前语言是否为俄语；非 ru 时先切语言再采集，避免接口/文案非俄文
                const langEl = document.getElementsByClassName("uw_n9a")[0];
                const language = langEl ? String(langEl.innerText || "").trim() : "";
                if (language !== "RU") {
                    await saveOzonLocale("ru");
                }
                // 切换货币为卢布
                await saveOzonCurrency();

                //采集ozon
                // 1688 采集复用 getBt：保持原有 50/秒、清掉急速上架可能残留的 429 降速/受限状态，避免相互影响
                bcsResetQsTransient();
                bcsOzonEntrypointQueue.maxPerSecond = QS_RATE_FAST;
                const sku = window.location.pathname.match(/-(\d+)\/?$/) || pathname.match(/\/(\d+)\/?$/)
                await getBt(sku[1])
                // 补齐"展示全部"隐藏变体：/modal/aspectsNew 全量发现后，等待其触发的 getBt 全部完成
                await getBtd(sku[1])
                await bcsWhenBtIdle()
                const goodsData = await buildEditUploadDataBySku(sku[1])

                if (typeof goodsData !== 'undefined' && goodsData !== null) {
                    result = goodsData;
                    source = 'context';
                }

                try {
                    // 此处把商品数据改造成1688的格式
                    const skuList = goodsData.rows
                    // 汇率
                    const rate = event.detail.exchangeRate || 10.8
                    // sku列表
                    const skuInfoMap = {}
                    skuList.forEach(item => {
                        let key = item.title
                        if (item.variantAttr.length > 1) {
                            key += `-${item.variantAttr.map(attr => attr.value[0]).join('-')}`;
                        } else if (item.variantAttr.length > 0) {
                            key += `-${item.variantAttr[0].value[0]}`;
                        }
                        const goodsSize = parsePackagingFromGoodsSize(item.goodsSize) || {};
                        const galleryUrls = collectGalleryUrls(item.cover_image, item.images || []);
                        skuInfoMap[key] = {
                            skuId: item.sku,
                            canBookCount: 100, //可购买数量
                            // 按币种符号换算为 CNY，避免人民币商城被当成卢布再除汇率
                            discountPrice: bcsOzonPriceToCnyText(item.price, rate),
                            skuImg: galleryUrls[0] || '',
                            images: galleryUrls.length > 1 ? galleryUrls.slice(1) : [],
                            videoList: item.video_cover, //视频列表
                            coverList: item.video_poster, //封面列表
                            ...goodsSize, //长宽高重量
                        }
                    })

                    // 用于临时存储：key = 属性名，value = 去重后的数值集合
                    const attrMap = {}
                    // 遍历所有商品
                    skuList.forEach(item => {
                        const variantAttr = item.variantAttr || [];
                        // 遍历每个商品的属性
                        variantAttr.forEach(attr => {
                            const name = attr.name;
                            const values = attr.value || [];
                            if (!name) return;
                            // 初始化name
                            if (!attrMap[name]) {
                                attrMap[name] = {}; // key = val(name), value = 完整对象
                            }
                            // 遍历值，只存【不重复的 name】
                            values.forEach(val => {
                                // 如果 val 不存在，添加
                                if (val && !attrMap[name][val]) {
                                    attrMap[name][val] = { name: val, imageUrl: item.cover_image };
                                }
                            });
                        });
                    });
                    // 转成为props数组格式
                    const props = Object.entries(attrMap).map(([attrName, valObj]) => ({
                        name: attrName,
                        values: Object.values(valObj)
                    }));
                    // sku名称
                    let skuProps = []
                    if (props.length > 0) {
                        skuProps = [{
                            prop: props[0].name, //sku款式名称
                            value: props[0].values
                        }]
                        if (props[1]) {
                            skuProps.push({
                                prop: props[1].name, //sku尺码名称
                                value: props[1].values.map((item) => {
                                    return {
                                        name: item.name,
                                    }
                                })
                            })
                        }
                    } else { //兼容无属性商品
                        skuProps = [{
                            prop: skuList[0].title,
                            value: ''
                        }]
                    }

                    // 重量尺寸等信息
                    const pieceWeightScaleInfo = []
                    for (const key in skuInfoMap) {
                        pieceWeightScaleInfo.push({
                            skuId: skuInfoMap[key].skuId,
                            length: skuInfoMap[key].length,
                            width: skuInfoMap[key].width,
                            height: skuInfoMap[key].height,
                            weight: skuInfoMap[key].weight,
                        })
                    }

                    // 合并各 SKU 轮播图作为全局主图（去重），避免仅取第一个 SKU 导致其它变体图丢失
                    const mergedMainImages = []
                    skuList.forEach(function (item) {
                        (item.images || []).forEach(function (img) {
                            if (img && mergedMainImages.indexOf(img) === -1) {
                                mergedMainImages.push(img)
                            }
                        })
                    })

                    // 获取商品详情图片URL
                    const detailImages = []
                    // Ozon 详情图
                    const ozonDetailRoot = document.querySelector('div[data-widget="webDescription"]');
                    if (ozonDetailRoot) {
                        ozonDetailRoot.querySelectorAll("img").forEach((img) => {
                            let url = img.dataset.src || img.src
                            let processedUrl = url
                            if (url && url.startsWith("//")) {
                                processedUrl = `https:${url}`
                            } else if (url && url.startsWith("/")) {
                                processedUrl = `${window.location.origin}${url}`
                            }
                            if (processedUrl && !processedUrl.includes("assets/") && !processedUrl.includes("grey.gif") && !detailImages.includes(processedUrl)) {
                                detailImages.push(processedUrl)
                            }
                        })
                    }

                    // 处理 richAnnotationJson：优先使用采集到的富文本，否则用详情图/主图生成 raImage
                    const richContentFallbackImages = detailImages.length ? detailImages : mergedMainImages;
                    const processedRichAnnotationJson = processRichAnnotationJson(goodsData.richAnnotationJson, richContentFallbackImages);
                    if (processedRichAnnotationJson) {
                        Object.keys(skuInfoMap).forEach(function (key) {
                            skuInfoMap[key].richAnnotationJson = processedRichAnnotationJson;
                        });
                    }

                    result = {
                        result: {
                            data: {
                                Root: {
                                    fields: {
                                        dataJson: {
                                            tempModel: {
                                                offerTitle: skuList[0].title //商品名
                                            },
                                            skuModel: { //SKU信息
                                                skuInfoMap,
                                                skuProps
                                            },
                                        }
                                    }
                                },
                                mainPrice: {
                                    fields: {
                                        finalPriceModel: {
                                            tradeWithoutPromotion: {
                                                offerMaxPrice: bcsOzonPriceToCnyText(skuList[0].old_price, rate) //最高价
                                            }
                                        }
                                    }
                                },
                                gallery: {
                                    fields: {
                                        // 主图：各 SKU 轮播合并；无图时回退首个 SKU
                                        mainImage: mergedMainImages.length ? mergedMainImages : (skuList[0].images || [])
                                    }
                                },
                                productPackInfo: {
                                    fields: {
                                        pieceWeightScale: {
                                            // 重量尺寸等信息
                                            pieceWeightScaleInfo
                                        }
                                    }
                                }
                            },
                            global: {
                                globalData: {
                                    model: {
                                        offerDetail: {
                                            featureAttributes: goodsData.common_attributes //商品参数
                                        }
                                    }
                                }
                            },
                            detailImages,
                            description: goodsData.description, //商品描述
                            richAnnotationJson: processedRichAnnotationJson, //处理后的富文本JSON
                        }
                    }
                    console.warn('数据采集完毕', result);
                } catch (error) {
                    console.warn('获取详情页数据失败:', error);
                }

                // 序列化后发送（goodsCategory/ozonRows 供 ISOLATED 世界同步工作台；尺寸在 ozonRows[].goodsSize）
                const clone = JSON.stringify({
                    type: 'getWindowData',
                    action: 'getWindowData',
                    source: source,
                    data: result,
                    goodsCategory: goodsData?.goodsCategory ?? null,
                    ozonRows: goodsData?.rows ?? null,
                    success: result !== null
                });
                // 发送响应回隔离世界（使用 document 事件）
                const responseEvent = new CustomEvent('ext-res', {
                    detail: clone
                });
                document.dispatchEvent(responseEvent);
            }
        });
    }, Math.random() * 700 + 300);

    // 以下代码进行css注入
    setTimeout(async () => {
        // 调整ozon插件的价格层级
        const style = document.createElement('style');
        style.textContent = `
            #bcs-real-price-box {
                z-index: 9999 !important;
            }
        `;
        document.body.appendChild(style);
    }, Math.random() * 500 + 2000);

})();
