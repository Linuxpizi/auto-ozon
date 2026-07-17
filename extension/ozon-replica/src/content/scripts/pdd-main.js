// 在 MAIN 世界中运行的脚本，可以直接访问 window 对象
// 监听来自隔离世界（ISOLATED）的消息，并返回 window 数据
(function () {
    'use strict';

    // 模拟真人鼠标滑动，对抗风控
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

    // 延迟执行，对抗风控
    setTimeout(() => {
        // 监听来自隔离世界的消息（使用 document 事件，因为隔离世界和 MAIN 世界共享同一个 document）
        document.addEventListener('ext-req', function (event) {
            if (event.detail && event.detail.action === 'getWindowData') {
                let result = null;
                let source = null;

                // 拼多多详情页数据
                const rawData = JSON.parse(JSON.stringify(window.rawData))
                console.warn('window.rawData', rawData);
                if (typeof rawData !== 'undefined' && rawData !== null) {
                    result = rawData.store;
                    source = 'context';
                }

                try {
                    // 此处把拼多多的数据改造成1688的格式
                    const pddData = result.initDataObj
                    const skuProps = [{
                        prop: pddData.goods.skus[0].specs[0].spec_key,
                        value: pddData.goods.skus.map((item) => {
                            return {
                                name: item.specs[0].spec_value,
                                imageUrl: item.thumbUrl
                            }
                        })
                    }]
                    if (pddData.goods.skus[0].specs[1]) {
                        skuProps.push({
                            prop: pddData.goods.skus[0].specs[1].spec_key,
                            value: pddData.goods.skus.map((item) => {
                                return {
                                    name: item.specs[1].spec_value,
                                }
                            })
                        })
                    }
                    // 获取商品详情图片URL
                    const detailImages = []
                    if (pddData.goods.detailGallery) {
                        // 处理detailGallery中的图片URL
                        pddData.goods.detailGallery.forEach((item) => {
                            detailImages.push(item.url)
                        })
                    } else {
                        // 没有detailGallery时，从DOM中获取图片URL
                        const urls = []
                        // 详情图class名会不定期改变，改为匹配详情图dom结构
                        document.querySelectorAll('div:not([class]):not([id]):not([role])').forEach(top => {
                            const mid = top.querySelector('div[class]');
                            if (!mid) return;
                            mid.querySelectorAll('div[aria-label="点击查看大图"] img').forEach(img => {
                                urls.push(img.dataset.src || img.src);
                            });
                        });
                        urls.forEach((url) => {
                            // 处理相对URL，转换为绝对URL
                            let processedUrl = url
                            if (url && url.startsWith("//")) {
                                processedUrl = `https:${url}`
                            } else if (url && url.startsWith("/")) {
                                processedUrl = `${window.location.origin}${url}`
                            }
                            // 逻辑：如果url为空或包含"assets/"或包含"grey.gif"，则不添加；否则添加（去重）
                            if (processedUrl && !processedUrl.includes("assets/") && !processedUrl.includes("grey.gif") && !detailImages.includes(processedUrl)) {
                                detailImages.push(processedUrl)
                            }
                        })
                    }
                    result = {
                        result: {
                            data: {
                                Root: {
                                    fields: {
                                        dataJson: {
                                            tempModel: {
                                                offerTitle: pddData.goods.goodsName //商品名
                                            },
                                            skuModel: {
                                                //SKU信息
                                                skuInfoMap: pddData.goods.skus.reduce((acc, item) => {
                                                    let key = `${item.specs[0].spec_value}&gt;`
                                                    if (item.specs[1]) {
                                                        key += `${item.specs[1].spec_value}`
                                                    }
                                                    acc[key] = {
                                                        skuId: item.skuId,
                                                        canBookCount: item.limitQuantity,
                                                        discountPrice: item.groupPrice,
                                                        skuImg: item.thumbUrl
                                                    }
                                                    return acc
                                                }, {}),
                                                //SKU信息
                                                skuProps
                                            },
                                        }
                                    }
                                },
                                mainPrice: {
                                    fields: {
                                        finalPriceModel: {
                                            tradeWithoutPromotion: {
                                                offerMaxPrice: pddData.goods.maxGroupPrice
                                            }
                                        }
                                    }
                                },
                                gallery: {
                                    fields: {
                                        //主图
                                        mainImage: pddData.goods.topGallery.map((item) => item.url)
                                    }
                                },
                                productPackInfo: {
                                    fields: {
                                        pieceWeightScale: {
                                            // 重量尺寸等信息
                                            pieceWeightScaleInfo: pddData.goods.skus.map((item) => {
                                                return {
                                                    skuId: item.skuId,
                                                    weight: item.weight
                                                }
                                            })
                                        }
                                    }
                                }
                            },
                            global: {
                                globalData: {
                                    model: {
                                        offerDetail: {
                                            featureAttributes: pddData.goods.goodsProperty.map((item) => { //品牌材质等信息
                                                return {
                                                    name: item.key,
                                                    value: item.values
                                                }
                                            })
                                        }
                                    }
                                }
                            },
                            detailImages
                        }
                    }
                    console.warn('数据采集完毕', result);
                } catch (error) {
                    console.warn('获取拼多多详情页数据失败:', error);
                }

                // 拼多多拦截了detail，需要序列化后发送
                const clone = JSON.stringify({
                    type: 'getWindowData',
                    action: 'getWindowData',
                    source: source,
                    data: result,
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

    // 以下代码对拼多多网页进行css注入
    setTimeout(async () => {
        // 隐藏右侧二维码和直播浮窗
        if (document.getElementsByClassName('pdd-go-to-app-pc')[0]) {
            document.getElementsByClassName('pdd-go-to-app-pc')[0].style.display = 'none'
        }
        if (document.getElementsByClassName('QQhsQXOW SDhVWyU1 YUSblXiv')[0]) {
            document.getElementsByClassName('QQhsQXOW SDhVWyU1 YUSblXiv')[0].style.display = 'none'
        }

        // 拼多多网页样式设置了vertical-align: baseline; 会污染插件样式
        // 遍历页面所有 style 标签，删除包含指定样式的片段
        // 目标样式的特征字符串
        const TARGET_STYLE_FRAGMENTS = [
            `blockquote,body,button,dd,dl,dt,fieldset,form,h1,h2,h3,h4,h5,h6,hr,input,legend,li,ol,p,pre,td,textarea,th,ul{border:0;list-style:none outside none;vertical-align:baseline}`,
            `vertical-align: baseline;`,
            `-webkit-scrollbar`,
        ];
        // 获取页面所有 <style> 标签
        const allStyles = document.querySelectorAll('style');
        allStyles.forEach(styleTag => {
            try {
                let cssText = styleTag.textContent || '';
                let modified = false;
                // 遍历所有要删除的片段，命中就替换
                TARGET_STYLE_FRAGMENTS.forEach(fragment => {
                    if (cssText.includes(fragment)) {
                        console.log('命中，执行样式清除');
                        cssText = cssText.replaceAll(fragment, '');
                        modified = true;
                    }
                });
                // 如果有修改，更新到页面
                if (modified) {
                    styleTag.textContent = cssText;
                }
            } catch (e) {
                console.warn('样式清除失败:', e);
            }
        });

        // 拼多多网页引入了这个css文件，其中的隐藏滚动条会污染插件样式
        // 获取所有符合条件的 link 标签（返回 NodeList）
        const links = document.querySelectorAll('link[href^="https://static.pddpic.com/assets/css/sku_"]');
        // 转成数组方便遍历
        const linkArray = Array.from(links);
        linkArray.forEach(async (linkTag) => {
            try {
                // 下载原始CSS
                const response = await fetch(linkTag.href);
                let css = await response.text();
                // 移除隐藏滚动条的样式
                css = css.replaceAll('-webkit-scrollbar', '');
                // 删除原始link标签
                linkTag.parentNode.removeChild(linkTag);
                // 插入修改后的CSS
                const style = document.createElement('style');
                // 调整拼多多底部功能的z-index
                css += `
                    .Rrut_NDL, .c1z6RLfM, .p-fill-modal, .VdePho19, .JcgkjxBF, .m4HArFRm, .sku-plus1, #skuImageSlider, .oNT1oGZu {
                        z-index: 10 !important;
                    }
                `;
                style.textContent = css;
                document.body.appendChild(style);
                console.log('拼多多SKU CSS 修改成功，滚动条已恢复');
            } catch (e) {
                console.warn('css修改失败:', e);
            }
        });
    }, Math.random() * 500 + 2000);

})();
