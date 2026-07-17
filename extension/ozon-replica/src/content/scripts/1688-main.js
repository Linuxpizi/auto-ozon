// 在 MAIN 世界中运行的脚本，可以直接访问 window 对象
// 监听来自隔离世界（ISOLATED）的消息，并返回 window 数据
(function () {
    'use strict';

    // 监听来自隔离世界的消息（使用 document 事件，因为隔离世界和 MAIN 世界共享同一个 document）
    document.addEventListener('ext-req', function (event) {
        const action = event.detail && event.detail.action;
        if (action === 'getOzonCollectData') {
            let result = null;
            let source = null;

            if (typeof window.__INIT_DATA !== 'undefined' && window.__INIT_DATA !== null) {
                result = window.__INIT_DATA;
                source = '__INIT_DATA';
            } else if (typeof window.context !== 'undefined' && window.context !== null) {
                if (typeof window.context === 'object') {
                    const keys = Object.keys(window.context);
                    if (keys.length > 0 || (window.context.module && Object.keys(window.context.module).length > 0)) {
                        result = window.context;
                        source = 'context';
                    }
                }
            }

            document.dispatchEvent(new CustomEvent('ext-res', {
                detail: {
                    type: 'getOzonCollectData',
                    action: 'getOzonCollectData',
                    source: source,
                    data: result,
                    success: result !== null
                }
            }));
            return;
        }

        if (action === 'getWindowData') {
            let result = null;
            let source = null;

            // 优先检查 window.__INIT_DATA
            if (typeof window.__INIT_DATA !== 'undefined' && window.__INIT_DATA !== null) {
                result = window.__INIT_DATA;
                source = '__INIT_DATA';
            }
            // 如果找不到，检查 window.context
            else if (typeof window.context !== 'undefined' && window.context !== null) {
                // 检查是否是对象且有数据
                if (typeof window.context === 'object') {
                    const keys = Object.keys(window.context);
                    if (keys.length > 0 || (window.context.module && Object.keys(window.context.module).length > 0)) {
                        result = window.context;
                        source = 'context';
                    }
                }
            }

            // 滚动页面触发加载详情图
            window.scrollBy({
                top: 700,
                behavior: 'smooth'
            });
            // 等待详情图加载再发送响应
            setTimeout(() => {
                // 发送响应回隔离世界（使用 document 事件）
                const responseEvent = new CustomEvent('ext-res', {
                    detail: {
                        type: 'getWindowData',
                        action: 'getWindowData',
                        source: source,
                        data: result,
                        success: result !== null
                    }
                });
                document.dispatchEvent(responseEvent);
            }, 1800);
        }
    });
})();
