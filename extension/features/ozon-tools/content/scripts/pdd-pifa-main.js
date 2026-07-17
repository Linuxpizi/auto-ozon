// 在 MAIN 世界中运行的脚本，拦截批发站 queryGoodsDetail 并转为 1688 兼容结构
(function () {
    'use strict';

    const PIFA_GOODS_DETAIL_API = '/pifa/goods/queryGoodsDetail';
    const PIFA_CACHE_KEY = '__PIFA_GOODS_DETAIL__';
    const POLL_INTERVAL_MS = 3000;
    const POLL_MAX_ATTEMPTS = 5;

    // 批发详情由页面 fetch/XHR 拉取，隔离世界无法读响应，只能在 MAIN 世界 hook
    window[PIFA_CACHE_KEY] = null;

    function isGoodsDetailApiUrl(url) {
        if (!url || typeof url !== 'string') {
            return false;
        }
        return url.includes(PIFA_GOODS_DETAIL_API);
    }

    function cachePifaGoodsDetail(payload) {
        if (payload && payload.success && payload.result) {
            window[PIFA_CACHE_KEY] = payload.result;
            console.warn('[pdd-pifa] 已缓存 queryGoodsDetail', window[PIFA_CACHE_KEY]);
        }
    }

    function tryParseJson(text) {
        if (!text || typeof text !== 'string') {
            return null;
        }
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    // hook fetch：透明代理，不阻断页面请求
    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
        window.fetch = function (...args) {
            const requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            const shouldCache = isGoodsDetailApiUrl(requestUrl);
            return nativeFetch.apply(this, args).then((response) => {
                if (!shouldCache) {
                    return response;
                }
                const cloned = response.clone();
                cloned.text().then((text) => {
                    cachePifaGoodsDetail(tryParseJson(text));
                }).catch(() => {});
                return response;
            });
        };
    }

    // hook XHR：批发站可能走 XMLHttpRequest（改原型，避免破坏 instanceof）
    const nativeXhrOpen = XMLHttpRequest.prototype.open;
    const nativeXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._pifa_request_url = String(url || '');
        return nativeXhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...sendArgs) {
        this.addEventListener('load', function () {
            if (isGoodsDetailApiUrl(this._pifa_request_url)) {
                cachePifaGoodsDetail(tryParseJson(this.responseText));
            }
        });
        return nativeXhrSend.apply(this, sendArgs);
    };

    function normalizeUrl(url) {
        if (!url) {
            return '';
        }
        let processedUrl = url;
        if (url.startsWith('//')) {
            processedUrl = `https:${url}`;
        } else if (url.startsWith('/')) {
            processedUrl = `${window.location.origin}${url}`;
        }
        return processedUrl;
    }

    // 批发 API 价格为分，下游 transformRawData 期望元
    function centsToYuan(cents) {
        if (cents == null || cents === '') {
            return 0;
        }
        const num = Number(cents);
        if (Number.isNaN(num)) {
            return 0;
        }
        return parseFloat((num / 100).toFixed(2));
    }

    function isValidDetailImageUrl(url) {
        return url
            && !url.includes('assets/')
            && !url.includes('grey.gif')
            && !/\.mp4(\?|$)/i.test(url);
    }

    // 批发站无 detailGallery 字段，从 DOM 采集详情图
    function collectDetailImagesFromDom() {
        const detailImages = [];

        function pushUrl(url) {
            const processedUrl = normalizeUrl(url);
            if (isValidDetailImageUrl(processedUrl) && !detailImages.includes(processedUrl)) {
                detailImages.push(processedUrl);
            }
        }

        // 批发站详情区：detailContent > DCImg > goodsIntroImg（跳过 DCImg 内的 video 块）
        document.querySelectorAll('.detailContent .DCImg img.goodsIntroImg').forEach((img) => {
            pushUrl(img.getAttribute('data-bimg-src') || img.getAttribute('data-src') || img.src);
        });

        document.querySelectorAll('.html-description').forEach((el) => {
            const roots = el.shadowRoot ? [el.shadowRoot] : [el];
            roots.forEach((root) => {
                root.querySelectorAll('img[src]').forEach((img) => {
                    pushUrl(img.getAttribute('data-src') || img.src);
                });
            });
        });

        document.querySelectorAll('div:not([class]):not([id]):not([role])').forEach((top) => {
            const mid = top.querySelector('div[class]');
            if (!mid) {
                return;
            }
            mid.querySelectorAll('div[aria-label="点击查看大图"] img').forEach((img) => {
                pushUrl(img.dataset.src || img.src);
            });
        });

        return detailImages;
    }

    // 按规格维度去重构建 skuProps，避免数百 SKU 导致 value 数组膨胀
    function buildSkuPropsFromSkus(skus) {
        if (!skus || skus.length === 0) {
            return [];
        }
        const firstSpecs = skus[0].specs || [];
        if (firstSpecs.length === 0) {
            return [];
        }

        const skuProps = [];
        const dimensionCount = firstSpecs.length >= 2 ? 2 : 1;

        for (let dim = 0; dim < dimensionCount; dim++) {
            const propName = firstSpecs[dim].spec_key;
            const valueMap = new Map();

            skus.forEach((item) => {
                const spec = item.specs[dim];
                if (!spec) {
                    return;
                }
                const specValue = spec.spec_value || spec.specValue;
                if (!specValue || valueMap.has(specValue)) {
                    return;
                }
                const entry = { name: specValue };
                if (dim === 0 && item.thumbUrl) {
                    entry.imageUrl = item.thumbUrl;
                }
                valueMap.set(specValue, entry);
            });

            skuProps.push({
                prop: propName,
                value: Array.from(valueMap.values()),
            });
        }

        return skuProps;
    }

    // 将批发 API result 转为下游 transformRawData 可消费的 1688 形态
    function build1688ShapeFromPifaResult(pifaResult) {
        const rawSkus = pifaResult.goodsSkuInfos || [];
        const skus = rawSkus.map((sku) => ({
            skuId: sku.skuId,
            specs: (sku.skuSpecs || []).map((spec) => ({
                spec_key: spec.specKey,
                spec_value: spec.specValue,
            })),
            groupPrice: centsToYuan(sku.wholesalePrice ?? sku.groupPrice),
            limitQuantity: sku.quantity ?? 0,
            thumbUrl: sku.thumbUrl,
            weight: 0,
        }));

        const skuProps = buildSkuPropsFromSkus(skus);

        const mainImage = (pifaResult.goodsCarouselInfos || [])
            .filter((item) => item.type === 1 && item.url)
            .map((item) => item.url);

        const skuInfoMap = skus.reduce((acc, item) => {
            let key = `${item.specs[0].spec_value}&gt;`;
            if (item.specs[1]) {
                key += `${item.specs[1].spec_value}`;
            }
            acc[key] = {
                skuId: item.skuId,
                canBookCount: item.limitQuantity,
                discountPrice: item.groupPrice,
                skuImg: item.thumbUrl,
            };
            return acc;
        }, {});

        const detailImages = collectDetailImagesFromDom();

        return {
            result: {
                data: {
                    Root: {
                        fields: {
                            dataJson: {
                                tempModel: {
                                    offerTitle: pifaResult.goodsName,
                                },
                                skuModel: {
                                    skuInfoMap,
                                    skuProps,
                                },
                            },
                        },
                    },
                    mainPrice: {
                        fields: {
                            finalPriceModel: {
                                tradeWithoutPromotion: {
                                    offerMaxPrice: centsToYuan(pifaResult.maxWholesalePrice),
                                },
                            },
                        },
                    },
                    gallery: {
                        fields: {
                            mainImage,
                        },
                    },
                    productPackInfo: {
                        fields: {
                            pieceWeightScale: {
                                pieceWeightScaleInfo: skus.map((item) => ({
                                    skuId: item.skuId,
                                    weight: item.weight,
                                })),
                            },
                        },
                    },
                },
                global: {
                    globalData: {
                        model: {
                            offerDetail: {
                                featureAttributes: [],
                            },
                        },
                    },
                },
                detailImages,
            },
        };
    }

    function waitForPifaGoodsDetail() {
        return new Promise((resolve) => {
            if (window[PIFA_CACHE_KEY]) {
                resolve(window[PIFA_CACHE_KEY]);
                return;
            }
            // 请求可能没有完成，需要轮询等待
            let attempts = 0;
            const timer = setInterval(() => {
                attempts += 1;
                if (window[PIFA_CACHE_KEY]) {
                    clearInterval(timer);
                    resolve(window[PIFA_CACHE_KEY]);
                    return;
                }
                if (attempts >= POLL_MAX_ATTEMPTS) {
                    clearInterval(timer);
                    resolve(null);
                }
            }, POLL_INTERVAL_MS);
        });
    }

    function dispatchGetWindowDataResponse(source, data) {
        const clone = JSON.stringify({
            type: 'getWindowData',
            action: 'getWindowData',
            source,
            data,
            success: data !== null,
        });
        document.dispatchEvent(new CustomEvent('ext-res', { detail: clone }));
    }

    setTimeout(() => {
        document.addEventListener('ext-req', async function (event) {
            if (!event.detail || event.detail.action !== 'getWindowData') {
                return;
            }

            let result = null;
            let source = null;

            try {
                const pifaResult = await waitForPifaGoodsDetail();
                if (pifaResult) {
                    result = build1688ShapeFromPifaResult(pifaResult);
                    source = 'context';
                    console.warn('[pdd-pifa] 数据组装成功', result);
                }
            } catch (error) {
                console.warn('[pdd-pifa] 获取批发详情数据失败:', error);
            }

            dispatchGetWindowDataResponse(source, result);
        });
    }, Math.random() * 700 + 300);

})();
