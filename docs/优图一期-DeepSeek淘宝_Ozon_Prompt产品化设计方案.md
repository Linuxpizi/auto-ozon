# 优图（YouTu）一期核心能力设计

## 基于 DeepSeek 的淘宝 & Ozon 商品标题及产品信息 Prompt 产品化方案

## 一、设计目标

本方案不是简单编写 Prompt，而是构建一套**可产品化、可工程化、可配置**的 Prompt Engine，使同一商品能够根据不同平台（淘宝、Ozon）自动调用不同的 Prompt 模板，实现商品信息的智能优化。

```text
商品信息
     │
     ▼
Prompt Router（平台路由）
     │
 ┌───────────────┬────────────────┐
 │               │                │
淘宝Prompt      Ozon Prompt      ...
 │               │
 ▼               ▼
标题优化        标题优化
卖点优化        本土化优化
详情优化        SEO优化
翻译优化        俄语本地化
 │               │
 ▼               ▼
统一JSON输出
```

## 二、Prompt 产品化设计

建议每个 Prompt 均采用统一模板，方便版本管理和动态参数替换。

### Prompt 结构

```text
SYSTEM
角色定义
业务目标
平台规则
输入格式
执行规则
输出格式
Few-shot Example
```

| 配置项      | 说明                 |
| ----------- | -------------------- |
| Prompt Name | prompt_title_ozon_v1 |
| Platform    | Ozon / 淘宝          |
| Language    | zh / ru              |
| Category    | 百货                 |
| Version     | v1.0                 |
| Model       | DeepSeek             |
| Output      | JSON                 |

# 三、淘宝标题优化 Prompt

**Prompt Name**

`TB_TITLE_OPTIMIZER_V1`

### System Prompt

```text
你是一名拥有10年以上经验的淘宝平台高级商品运营专家。

熟悉淘宝搜索机制、猜你喜欢推荐机制以及消费者搜索行为。
你的目标不是翻译，而是提高商品曝光率、点击率和转化率。

请严格遵循淘宝商品标题规范：
- 不得添加不存在的信息
- 不得夸大宣传
- 不得使用违规词
- 标题自然流畅
- 合理组织关键词
- 控制长度30~60个中文字符
- 输出JSON
```

### 输入

```json
{
  "category":"保温杯",
  "brand":"XX",
  "material":"304不锈钢",
  "capacity":"500ml",
  "color":"黑色",
  "feature":["保温","防漏","便携"]
}
```

### 输出

```json
{
  "title":"304不锈钢保温杯500ml男女便携学生防漏大容量水杯",
  "keywords":["...","..."],
  "reason":"..."
}
```

# 四、淘宝产品信息优化 Prompt

**Prompt Name**

`TB_PRODUCT_INFO_OPTIMIZER`

```text
请根据商品属性生成：

① 核心卖点（5条）
② 商品介绍
③ 使用场景
④ 目标用户
⑤ 注意事项

要求：
- 符合淘宝表达方式
- 语言自然
- 突出购买理由
- 输出JSON
```

# 五、Ozon 标题优化 Prompt

**Prompt Name**

`OZON_TITLE_OPTIMIZER_V1`

### System Prompt

```text
你是一名俄罗斯Ozon平台资深商品运营专家。

熟悉：
- Ozon SEO
- 俄罗斯消费者购物习惯
- 俄罗斯商品命名规范
- 俄语自然表达

目标：
生成符合Ozon搜索规则的商品标题。

要求：
- 自然俄语
- 不要中文语序
- 不要逐字翻译
- 品牌优先
- 核心商品词优先
- 属性符合俄罗斯阅读顺序
- 避免重复关键词
- 不使用营销语言
- 控制长度100~150字符
- 输出JSON
```

### 输入

```json
{
  "source_language":"zh",
  "category":"保温杯",
  "brand":"XX",
  "material":"304",
  "capacity":"500ml",
  "feature":["保温","防漏","双层"]
}
```

### 输出

```json
{
  "title_ru":"Термокружка XX из нержавеющей стали 304, 500 мл, двойные стенки, герметичная крышка",
  "keywords":["...","..."],
  "seo_score":95
}
```

# 六、Ozon 产品信息本土化 Prompt

**Prompt Name**

`OZON_LOCALIZATION_ENGINE_V1`

```text
你是一名俄罗斯本土电商运营专家。

任务不是翻译，而是Localization。

要求：
- 删除中国电商表达
- 使用俄罗斯消费者常用表达
- 使用俄语自然语言
- 强调实际用途、耐用性、家庭场景
- 适用时强调冬季使用场景
- 不编造商品属性

输出：
- 标题
- 卖点
- 产品介绍
- SEO关键词
- 使用场景
- FAQ

全部使用俄语，JSON输出。
```

输出格式：

```json
{
  "title_ru":"",
  "selling_points":[],
  "description":"",
  "faq":[],
  "keywords":[]
}
```

# 七、本土化规则（Localization Engine）

| 中国电商表达 | Ozon 本土化策略                        |
| ------------ | -------------------------------------- |
| 爆款         | 删除                                   |
| 网红推荐     | 删除                                   |
| 居家必备     | Подходит для ежедневного использования |
| 厨房         | для кухни / для дома / для семьи       |
| 500ML        | 500 мл                                 |
| 尺寸         | 按俄罗斯标准单位表达                   |
| 温度         | 使用俄语本地表达                       |

# 八、Prompt 参数化

```text
{{platform}}
{{country}}
{{language}}
{{category}}
{{brand}}
{{attribute}}
{{feature}}
{{audience}}
{{tone}}
{{output}}
```

# 九、API 设计

## 标题优化

POST `/api/v1/title/optimize`

## 商品信息优化

POST `/api/v1/product/optimize`

## 图生图 Prompt

POST `/api/v1/image/prompt`

# 十、一期 Prompt 资产

| 模块               | 数量 |
| ------------------ | ---- |
| 淘宝标题优化       | 3    |
| 淘宝商品信息优化   | 3    |
| Ozon标题优化       | 4    |
| Ozon商品信息本土化 | 6    |
| 图生图Prompt       | 8    |
| Prompt评测         | 4    |

合计约 **28 个核心 Prompt 模板**。
