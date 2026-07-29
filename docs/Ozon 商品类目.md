# [Ozon 商品类目](https://docs.ozon.ru/api/seller/zh/?__rr=5&abt_att=1&origin_referer=www.google.com.hk#tag/CategoryAPI)

> 平台的的商品类目一般很少会频繁变更，而且数据包很大，没有必要每次都从 Ozon 获取。可以一次性或者周期性的同步到本地
> 存储。

## 设计
1. 根据 [Ozon 商品类目](https://docs.ozon.ru/api/seller/zh/?__rr=5&abt_att=1&origin_referer=www.google.com.hk#tag/CategoryAPI)设计本地数据模型，进行存储
2. 提供相关的 API
3. frontend 提供手动同步的入口
   1. 需要可以指定 Ozon 店铺
4. 平台从 Ozon 获取类目的接口需要替换成本地的
5. 只同步 **ZH_HANS — 中文**