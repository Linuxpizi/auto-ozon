// 在 MAIN 世界中运行的脚本，可以直接访问 window 对象
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

    // 延迟执行，防风控
    setTimeout(() => {
        // 监听来自隔离世界的消息（使用 document 事件，因为隔离世界和 MAIN 世界共享同一个 document）
        document.addEventListener('ext-req', async function (event) {
            if (event.detail && event.detail.action === 'getWindowData') {
                let result = null;
                let source = null;

                // 详情页数据
                const iceAppContext = JSON.parse(JSON.stringify(window.__ICE_APP_CONTEXT__))
                console.warn('window.__ICE_APP_CONTEXT__', iceAppContext);
                if (typeof iceAppContext !== 'undefined' && iceAppContext !== null) {
                    result = iceAppContext?.loaderData?.home?.data?.res;
                    source = 'context';
                }

                try {
                    // 此处把商品数据改造成1688的格式
                    let goodsData = result
                    // sku列表
                    let skuInfoMap = {}
                    let skuProps = []
                    let offerMaxPrice = 0
                    const pieceWeightScaleInfo = []
                    // 判断是否含有sku信息（淘宝部分商品没有sku）
                    if (goodsData.skuBase.props) {
                        let goodsSku = goodsData.skuBase.props[0] //款式
                        let goodsSkuSize = goodsData.skuBase.props[1] //尺码
                        let skuIdList = goodsData.skuBase.skus //sku和skuId的映射
                        let sku2info = goodsData.skuCore.sku2info
                        let sku2info0 = sku2info['0']
                        offerMaxPrice = sku2info0.price?.priceText
                        if (!offerMaxPrice) { //若没有价格，表示已被风控，此时价格需要点击商品sku获取
                            offerMaxPrice = goodsData.componentsVO?.priceVO?.price?.priceText || 0
                            // 1. 获取根容器与所有可点击子项（排除禁用项）
                            const container = document.querySelector('.content--DIGuLqdf');
                            if (container) {
                                // 获取所有非禁用的规格项
                                const items = container.querySelectorAll('.valueItem--smR4pNt4:not(.isDisabled--BhZbtUdR)');
                                if (items.length > 0) {
                                    // 2. 依次点击，每个间隔 1000~3000ms
                                    for (let i = 0; i < items.length; i++) {
                                        const item = items[i];
                                        const specName = item.querySelector('.valueItemText--T7YrR8tO')?.textContent || '未知规格';
                                        // 执行点击
                                        item.click();
                                        console.log(`已点击第 ${i + 1} 项：${specName}`);
                                        // 随机等待 1000 ~ 3000 ms
                                        const delay = Math.floor(Math.random() * 2000) + 1000;
                                        await new Promise(resolve => setTimeout(resolve, delay));
                                    }
                                    // 重新获取源数据
                                    const iceAppContext = JSON.parse(JSON.stringify(window.__ICE_APP_CONTEXT__))
                                    console.warn('重新获取window.__ICE_APP_CONTEXT__', iceAppContext);
                                    if (typeof iceAppContext !== 'undefined' && iceAppContext !== null) {
                                        result = iceAppContext?.loaderData?.home?.data?.res || {};
                                        // 重新赋值
                                        goodsData = result
                                        goodsSku = goodsData.skuBase.props[0] //款式
                                        goodsSkuSize = goodsData.skuBase.props[1] //尺码
                                        skuIdList = goodsData.skuBase.skus //sku和skuId的映射
                                        sku2info = goodsData.skuCore.sku2info
                                        sku2info0 = sku2info['0']
                                    }
                                }
                            }
                        }
                        skuInfoMap = {}
                        let subPrice = sku2info0.subPrice?.priceText //折扣价格
                        if (!subPrice) { //价格信息有可能是接口获取，此处兜底处理
                            subPrice = goodsData.componentsVO?.priceVO?.extraPrice?.priceText || 0
                        }
                        function getPrice(target) {
                            let discountPrice = subPrice
                            const skuIds = skuIdList.filter(item => item.propPath.includes(target)).map(item => item.skuId);
                            skuIds.forEach(skuId => {
                                const price = sku2info[skuId].subPrice?.priceText
                                if (price) {
                                    discountPrice = price
                                }
                            })
                            return discountPrice
                        }
                        // 有第二个props且不包含【是否】
                        if (goodsSkuSize && !goodsSkuSize.name.includes('是否')) {
                            goodsSku.values.forEach((item) => {
                                goodsSkuSize.values.forEach((itemSize) => {
                                    skuInfoMap[`${item.name}&gt;${itemSize.name}`] = {
                                        skuId: `${item.vid}:${itemSize.vid}`,
                                        canBookCount: sku2info0.limit, //可购买数量
                                        discountPrice: getPrice(item.vid),
                                        skuImg: item.image || itemSize.image //sku图片
                                    }
                                })
                            })
                        } else {
                            goodsSku.values.forEach((item) => {
                                skuInfoMap[`${item.name}`] = {
                                    skuId: `${item.vid}`,
                                    canBookCount: sku2info0.limit, //可购买数量
                                    discountPrice: getPrice(item.vid),
                                    skuImg: item.image //sku图片
                                }
                            })
                        }

                        // sku名称
                        skuProps = [{
                            prop: goodsSku.name, //sku款式名称
                            value: goodsSku.values.map((item) => {
                                return {
                                    name: item.name,
                                    imageUrl: item.image
                                }
                            })
                        }]
                        if (goodsSkuSize) {
                            skuProps.push({
                                prop: goodsSkuSize.name, //sku尺码名称
                                value: goodsSkuSize.values.map((item) => {
                                    return {
                                        name: item.name,
                                        imageUrl: item.image
                                    }
                                })
                            })
                        }

                        // 重量尺寸等信息
                        for (const key in skuInfoMap) {
                            pieceWeightScaleInfo.push({
                                skuId: skuInfoMap[key].skuId,
                                weight: skuInfoMap[key].weight || ''
                            })
                        }
                    } else {
                        const item = goodsData.item
                        offerMaxPrice = goodsData.skuCore.sku2info['0'].price?.priceText
                        skuInfoMap[`${item.title}`] = {
                            skuId: item.itemId,
                            canBookCount: 10,
                            discountPrice: goodsData.componentsVO?.priceVO?.price?.priceText || 0,
                            skuImg: item.images[0]
                        }
                        skuProps = [{
                            prop: item.title,
                            value: [{
                                name: item.title,
                                imageUrl: item.images[0]
                            }]
                        }]
                        pieceWeightScaleInfo.push({
                            skuId: item.itemId,
                            weight: ''
                        })
                    }

                    // 商品参数
                    let featureAttributes = []
                    goodsData.componentsVO.extensionInfoVO.infos.forEach((item) => {
                        if (item.title === '参数') {
                            featureAttributes = item.items.map((i) => {
                                return {
                                    name: i.title,
                                    value: i.text
                                }
                            })
                        }
                    })

                    // 获取商品详情图片URL
                    const detailImages = []
                    // 获取淘宝详情页图片dom元素
                    const imgDom = document.getElementById('imageTextInfo-container');
                    if (imgDom) {
                        // const imgs = imgDom.querySelectorAll('img.descV8-singleImage-image');
                        //有的商品没有class类名，直接获取img标签
                        const imgs = imgDom.querySelectorAll('img');
                        imgs.forEach(img => {
                            let url = img.dataset.src || img.src;
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
                                                offerTitle: goodsData.item.title //商品名
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
                                                offerMaxPrice //最高价
                                            }
                                        }
                                    }
                                },
                                gallery: {
                                    fields: {
                                        //主图
                                        mainImage: goodsData.item.images
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
                                            featureAttributes //商品参数
                                        }
                                    }
                                }
                            },
                            detailImages
                        }
                    }
                    console.warn('数据采集完毕', result);
                } catch (error) {
                    console.warn('获取详情页数据失败:', error);
                }

                // 序列化后发送
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

    // 以下代码进行css注入
    setTimeout(() => {
        // 遍历页面所有 style 标签，删除包含指定样式的片段
        // 目标样式的特征字符串
        const TARGET_STYLE_FRAGMENTS = [
            `font: 12px/1.5 tahoma, arial, 'Hiragino Sans GB',`,
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

    }, Math.random() * 500 + 2000);

})();
