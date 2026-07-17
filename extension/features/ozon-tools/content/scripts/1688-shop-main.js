// MAIN 世界：拦截 1688 店铺列表 ModuleAsyncService，缓存 offerList 供隔离世界读取
(function () {
    'use strict';

    const SHOP_OFFER_CACHE_KEY = '__MJGD_1688_SHOP_OFFER_CACHE__';
    const MODULE_ASYNC_API = 'mtop.alibaba.alisite.cbu.server.moduleasyncservice';

    window[SHOP_OFFER_CACHE_KEY] = {
        offerList: [],
        fetchedAt: 0,
        pageToken: '',
    };

    function isShopOfferListApiUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return url.toLowerCase().includes(MODULE_ASYNC_API);
    }

    function tryParseResponseText(text) {
        if (!text || typeof text !== 'string') return null;
        try {
            return JSON.parse(text);
        } catch (e) {
            const jsonpMatch = text.match(/^\s*\w+\s*\(([\s\S]*)\)\s*;?\s*$/);
            if (!jsonpMatch) return null;
            try {
                return JSON.parse(jsonpMatch[1]);
            } catch (e2) {
                return null;
            }
        }
    }

    function buildPageToken(offerList) {
        if (!Array.isArray(offerList) || !offerList.length) return '';
        const firstId = offerList[0] && offerList[0].id ? String(offerList[0].id) : '';
        const lastId = offerList[offerList.length - 1] && offerList[offerList.length - 1].id
            ? String(offerList[offerList.length - 1].id)
            : '';
        return `${offerList.length}:${firstId}:${lastId}`;
    }

    function cacheShopOfferList(payload) {
        if (!payload || typeof payload !== 'object') return;
        const offerList = payload.data && payload.data.content && payload.data.content.offerList;
        if (!Array.isArray(offerList)) return;
        window[SHOP_OFFER_CACHE_KEY] = {
            offerList: offerList,
            fetchedAt: Date.now(),
            pageToken: buildPageToken(offerList),
        };
    }

    function handleResponseText(text) {
        const payload = tryParseResponseText(text);
        if (!payload) return;
        cacheShopOfferList(payload);
    }

    const nativeFetch = window.fetch;
    if (typeof nativeFetch === 'function') {
        window.fetch = function (...args) {
            const requestUrl = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
            const shouldCache = isShopOfferListApiUrl(requestUrl);
            return nativeFetch.apply(this, args).then((response) => {
                if (!shouldCache) return response;
                const cloned = response.clone();
                cloned.text().then((text) => {
                    handleResponseText(text);
                }).catch(() => {});
                return response;
            });
        };
    }

    const nativeXhrOpen = XMLHttpRequest.prototype.open;
    const nativeXhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._mjgd_shop_request_url = String(url || '');
        return nativeXhrOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function (...sendArgs) {
        this.addEventListener('load', function () {
            if (isShopOfferListApiUrl(this._mjgd_shop_request_url)) {
                handleResponseText(this.responseText);
            }
        });
        return nativeXhrSend.apply(this, sendArgs);
    };

    document.addEventListener('ext-req', function (event) {
        if (!event.detail || event.detail.action !== 'getShopOfferList') return;
        const cache = window[SHOP_OFFER_CACHE_KEY] || { offerList: [], fetchedAt: 0, pageToken: '' };
        document.dispatchEvent(new CustomEvent('ext-res', {
            detail: {
                type: 'getShopOfferList',
                action: 'getShopOfferList',
                success: Array.isArray(cache.offerList),
                data: cache,
            },
        }));
    });
})();
