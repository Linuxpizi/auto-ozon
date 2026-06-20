# https://api-seller.ozon.ru/v1/product/import-by-sku

该方法会创建指定SKU的商品卡片副本。

该方法仅支持复制其他卖家的商品卡片，无法复制您自己的商品。

如果卖家禁止复制， 将无法创建卡片副本。

无法通过SKU更新商品。

该方法对每分钟和每天的商品操作数量有限制。如果超过限制，将返回429错误，错误说明位于message字段中，同时响应会包含以下响应头：

Item-Retry-After——距离限制更新还剩多少分钟。对于每日限制，表示距离莫斯科时间03:00还剩多少时间。
Item-Rate-Limit-Remaining——距离下一次限制重置前还可执行的操作数量。

## 输入
```json
{
  "items": [
    {
      "sku": 298789742,
      "name": "杯子",
      "offer_id": "91132",
      "currency_code": "RUB",
      "old_price": "2590",
      "price": "2300",
      "vat": "0.1"
    }
  ]
}
```

## 输出
```json
{
  "result": {
    "task_id": 176594213,
    "unmatched_sku_list": []
  }
}
```