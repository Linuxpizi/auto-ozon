# Ozon 商品指标采集接口审计

> 审计对象：被 `.gitignore` 排除的原始 `ozon/` 扩展包及 source map。  
> 本文只记录与商品数据和采集指标直接相关的 Ozon 网络请求。  
> 不记录账户、上架、AI、图片处理、配置、充值等业务请求，也不使用任何 BCS 接口。

## 1. 结论

原始扩展可直接从 Ozon 页面和 Ozon 同源接口采集商品数据，主要来源是：

1. 列表页和详情页 DOM；
2. Ozon `entrypoint-api` 的 Page1 商品 `widgetStates`；
3. Ozon `entrypoint-api` 的全量变体弹窗；
4. Ozon `entrypoint-api` 的 Page2 商品详情；
5. Ozon `otherOffersFromSellers` 跟卖列表；
6. Ozon `shop-in-shop-info` 卖家公司信息。

这些请求复用当前 Ozon 商城登录态，不需要第三方业务平台账号。公开商品响应没有提供的经营
指标必须保持“未知”，不能用 `0`、空字符串、采集时间或商品价格等其他字段代替。

## 2. 请求域与认证

根据当前页面使用以下商城域：

- `https://www.ozon.ru`
- `https://ozon.kz`

同源请求依赖浏览器中的 Ozon Cookie。需要显式传 Cookie 的 `fetch` 使用：

```ts
fetch(url, { credentials: 'include' })
```

MAIN world 中的同源 XHR 会自然复用当前页面 Cookie。请求中不附加第三方 token 或业务平台
认证头。

## 3. 商品指标接口

### 3.1 Page1 商品数据

```http
GET {ozonOrigin}/api/entrypoint-api.bx/page/json/v2?url={encodedProductPath}
```

内层路径：

```text
/product/{sku}/
```

推荐构造方式：

```ts
const path = `/product/${encodeURIComponent(sku)}/`
const url = `${origin}/api/entrypoint-api.bx/page/json/v2?url=${encodeURIComponent(path)}`
```

响应中的 `widgetStates` 是以 widget key 为键、JSON 字符串或对象为值的映射。原始代码按
widget 名称和对象结构提取：

| Widget/结构 | 可采集字段 |
| --- | --- |
| `webProductHeading` | 商品标题 |
| `webPrice` | 当前价、绿色价、黑色价、划线原价、货币符号 |
| `webGallery` | 主图、轮播图、视频封面、视频地址 |
| `webAspects` | 变体 SKU、规格值、颜色样本图 |
| 评分/评论结构 | 评分、评论数（响应存在时） |
| `webCurrentSeller` | 当前卖家 ID、名称或链接 |
| `webCharacteristics` | Page1 中实际存在的基础属性 |
| `webHashtags` | 商品标签 |

可直接形成的卡片指标包括 SKU、标题、当前价、划线价、评分、评论数、媒体数量、变体数量、
卖家 ID，以及响应中明确存在的品牌和属性。

### 3.2 全量变体

```http
GET {ozonOrigin}/api/entrypoint-api.bx/page/json/v2?url=%2Fmodal%2FaspectsNew%3Fproduct_id%3D{sku}
```

内层路径：

```text
/modal/aspectsNew?product_id={sku}
```

可采集：

- 全量变体 SKU；
- 商品页未展开的隐藏变体；
- 规格组和规格值；
- 变体封面或颜色样本图。

原始实现先从 Page1 `webAspects` 发现变体，再用该接口补齐“展示全部”中的隐藏变体，并按
SKU 去重。

### 3.3 Page2 商品详情

```http
GET {ozonOrigin}/api/entrypoint-api.bx/page/json/v2?url={encodedPage2Path}
```

原始代码按 SKU 直接请求的内层路径：

```text
/product/{sku}/?&abt_att=1&layout_page_index=2&origin_referer=www.ozon.ru&layout_container=pdpPage2column
```

页面返回的 `nextPage` 也可以作为候选路径，但必须限定在当前 Ozon 域。

| Widget/结构 | 可采集字段 |
| --- | --- |
| `webCharacteristics` | 品牌、材质、尺寸、重量及其他商品属性 |
| `webDescription` | 商品描述 |
| 富文本结构 | 富媒体详情 |
| `webHashtags` | 标签 |
| 类目/面包屑结构 | 类目路径和名称（响应存在时） |

包装长宽高和重量只有在响应明确提供对应商品属性时才可写入。不得用图片尺寸、页面布局尺寸
或其他无关字段推算包装信息。

### 3.4 跟卖卖家和价格区间

```http
GET {ozonOrigin}/api/entrypoint-api.bx/page/json/v2?url=%2Fmodal%2FotherOffersFromSellers%3Fproduct_id%3D{sku}%26sort%3Dprice%26page_changed%3Dtrue
```

内层路径：

```text
/modal/otherOffersFromSellers?product_id={sku}&sort=price&page_changed=true
```

从 `webSellerList` 的 `sellers` 数组提取：

- 跟卖卖家数量；
- 每个卖家的 SKU/商品链接；
- 每个卖家的展示价格；
- 最低价、最高价及对应 SKU；
- 响应中存在的卖家名称、评分或配送信息。

当前商品自身的页面价格应参与最低价/最高价比较。只有接口请求成功且卖家数组明确为空时，
才能记为 `0` 个跟卖；请求失败时必须显示未知。

### 3.5 卖家公司信息

```http
GET {ozonOrigin}/api/entrypoint-api.bx/page/json/v2?url={encodedSellerPath}
```

内层路径：

```text
/modal/shop-in-shop-info?seller_id={sellerId}&page_changed=true
```

可采集卖家公司原始名称和页面披露的卖家主体文本。公司名称翻译不属于数据采集，应在本地
处理或保持原文，不能为翻译调用业务平台接口。

## 4. DOM 采集来源

网络请求前先从当前 DOM 读取，以减少重复访问 Page1：

| 页面来源 | 可采集字段 |
| --- | --- |
| 商品卡链接 | SKU、商品 URL |
| 商品卡标题 | 标题 |
| 商品卡图片 | 主图 |
| 商品卡价格文本 | 当前展示价格和货币单位 |
| 商品卡评分/评论区域 | 评分、评论数（页面存在时） |
| 详情页 widget `data-state` | 当前卖家、价格、标题、图库等 |

Ozon 列表使用虚拟滚动，DOM 节点可能被复用。缓存必须以 SKU 为键，不能只按节点位置保存。

## 5. 字段可得性矩阵

### 5.1 可直接采集

| 字段 | 真实来源 |
| --- | --- |
| `article` / SKU | URL、商品卡、Page1 |
| 标题 | DOM、`webProductHeading` |
| 品牌 | `webCharacteristics` 或页面属性 |
| 类目 | Page2 类目/面包屑结构 |
| 当前价格 | DOM、`webPrice` |
| 划线原价 | `webPrice` |
| 评分、评论数 | DOM、评分 widget |
| 图片、视频 | `webGallery` |
| 变体 SKU、规格 | `webAspects`、`aspectsNew` |
| 跟卖卖家数 | `otherOffersFromSellers` |
| 跟卖最低/最高价 | 跟卖列表加当前商品价 |
| 卖家 ID | `webCurrentSeller` |
| 卖家公司名 | `shop-in-shop-info` |
| 描述、富文本、标签 | Page2 widgets |
| 长宽高、重量 | Page2 明确提供的商品属性 |

### 5.2 可由真实采集值在本地计算

| 指标 | 计算依据 |
| --- | --- |
| 变体数量 | 去重后的变体 SKU 数量 |
| 跟卖价格跨度 | `最高价 - 最低价` |
| 跟卖价差比例 | `(最高价 - 最低价) / 最低价` |
| 折扣率 | 当前价与划线原价均存在时计算 |
| 图片数、视频数 | 去重后的媒体数组长度 |
| 属性完整度 | 约定字段中实际采集到的字段数占比 |

计算结果应标记为“本地计算”，不能冒充 Ozon 返回的官方经营指标。

### 5.3 Ozon 公开商品接口无法可靠提供

以下字段不在上述 Ozon 商品响应中稳定提供，应显示 `--`/未知或从卡片中隐藏：

- 月销量 `monthsales`；
- 月销售额 `gmvSum`；
- 月周转动态 `salesDynamics`；
- 广告费用占比 `drr`；
- 促销天数、推广天数、促销销售额占比；
- 商品卡浏览量 `sessioncount`；
- 商品卡加购率 `convTocartPdp`；
- 搜索目录浏览量 `sessionCountSearch`；
- 搜索目录加购率 `convToCartSearchRate`；
- 商品展示总量 `views`；
- 展示转化率 `convViewToOrder`；
- 商品点击率 `goodsClickRate`；
- 退货取消率 `returnCancelRate`；
- 发货模式汇总 `sources`（除非当前响应明确给出）；
- 官方上架日期 `createDate`；
- 后台统计口径的平均售价 `avgprice`；
- 非 Ozon 页面直接披露的分档履约佣金。

禁止以下替代：

- 用当前价格代替平均售价；
- 用评论数代替浏览量；
- 用扩展采集时间代替商品上架日期；
- 用请求失败代替 `0` 个跟卖；
- 用默认 `0` 代替未知销量、GMV、曝光或转化率。

## 6. 请求调度和风控

原始扩展对 Page1 和变体请求使用共享队列：

1. 限制并发数和每秒请求数；
2. 大量变体时降低速率；
3. HTTP 429 时读取 `Retry-After` 并退避；
4. 403、HTML 挑战页或验证码页视为被限制；
5. 命中验证码后清空队列并停止后续请求；
6. 同一 SKU 的 Page1、Page2 和跟卖结果做短期缓存；
7. 列表滚动时只请求新出现且缓存中不存在的 SKU。

不应再向外部聚合服务发送固定探活 SKU；探活会增加无意义请求，也可能触发风控。

## 7. 推荐的数据合并顺序

```text
列表/详情 DOM 快照
  -> Page1 商品 widgetStates
  -> aspectsNew 全量变体（需要时）
  -> Page2 属性和描述（相关字段启用时）
  -> otherOffersFromSellers（跟卖字段启用时）
  -> shop-in-shop-info（详情主卡需要公司名时）
  -> 按 SKU 合并并记录字段来源
  -> 本地计算派生指标
  -> 未获得字段保持 unknown
```

推荐保存来源元数据：

```ts
type CollectedMetric<T> = {
  value: T | null
  source: 'dom' | 'ozon-page1' | 'ozon-page2' | 'ozon-offers' | 'computed'
  collectedAt: string
}
```

这样可以区分 Ozon 原始值、本地计算值和缺失值，避免迁移后再次用默认值掩盖空值。

## 8. 明确排除范围

本文不包含：

- 任何第三方业务平台 API；
- 登录、账号、套餐、积分、偏好同步；
- 商品创建、快速上架、仓库、品牌搜索；
- AI 编辑、图片翻译、去水印、图片搜索；
- 配置、汇率、物流报价、佣金树下载；
- 仅用于页面跳转的 `window.open`；
- 浏览器自动加载的图片、CSS、字体；
- 服务端内部网络调用。

最终指标采集链路只访问当前 Ozon 商城域，并只保存响应中能够验证的真实商品数据。