# AI 设计优化执行方案

基于 `AI 设计优化.md` 需求,结合选品中心编辑抽屉的操作场景,梳理可落地的开发方案。

---

## 一、功能全景

### 1.1 文字类

| 功能 | 场景 | 技术 | 接口 |
|------|------|------|------|
| 标题中→俄翻译 | 编辑抽屉 - 商品名称 [翻译] | DeepSeek (OpenAI接口) | `/api/v1/ai/translate` |
| 属性中→俄翻译 | 编辑抽屉 - 商品属性 [翻译]/[翻译全部] | the AI | `/api/v1/ai/translate-batch` |
| 描述中→俄翻译 | 编辑抽屉 - 商品描述 [翻译] | the AI | `/api/v1/ai/translate` |
| 标题优化(去同质化) | 编辑抽屉 - 商品名称 [AI优化] | DeepSeek | `/api/v1/title/optimize` ✅已有 |
| 描述优化 | 编辑抽屉 - 商品描述 [AI优化] | DeepSeek | `/api/v1/ai/optimize-description` |
| 属性优化 | 编辑抽屉 - 商品属性 [AI优化全部] | the AI | `/api/v1/ai/optimize-description` |

### 1.2 图片类

| 功能 | 场景 | 技术 | 接口 |
|------|------|------|------|
| 图片文字翻译 | 编辑抽屉 - 图片 [🌐翻译] | GPT Image 2 edit | `/api/v1/ai/translate-image` |
| 替换产品图主体 | 编辑抽屉 - 图片 [✏️替换] | GPT Image 2 edit | `/api/v1/ai/replace-image-subject` |
| 文生图/批量生成 | 编辑抽屉 - 图片区域 [AI批量生成] | GPT Image 2 generation | `/api/v1/ai/generate-image` |

---

## 二、现有资产

### 已完成 ✅

| 文件 | 作用 |
|------|------|
| `backend/app/services/prompt_engine.py` | DeepSeek调用、prompt渲染、JSON解析 |
| `backend/app/services/localization_rules.py` | 中文电商用语→俄语映射 |
| `backend/app/api/routers/title_optimize.py` | 标题优化API |
| `backend/app/api/routers/product_optimize.py` | 产品优化API |
| `backend/app/api/routers/image_prompt.py` | MJ/SD prompt生成(非GPT Image 2) |
| `backend/app/crud/prompt_template.py` | Prompt模板CRUD |
| `backend/app/schemas/prompt_template.py` | 模板Schema |
| `frontend/src/api/request.ts` | axios封装 |

### 待开发 🔲

| 文件 | 作用 |
|------|------|
| `backend/app/schemas/ai.py` | AI翻译/图片Schema |
| `backend/app/services/ai_translate_service.py` | 文字翻译服务 |
| `backend/app/services/image_service.py` | GPT Image 2图片处理 |
| `backend/app/api/routers/ai_translate.py` | 翻译API路由 |
| `backend/app/api/routers/ai_image.py` | 图片API路由 |
| `frontend/src/api/ai.ts` | AI API封装 |
| `frontend/src/components/selection/AiButton.vue` | AI按钮组件 |
| `frontend/src/components/selection/ImageManager.vue` | 图片管理组件 |

---

## 三、核心模块设计

### 3A. 文字翻译 (the AI)

**翻译Prompt模板:**
```
你是一名专业中俄翻译,专注电商领域。
规则:
1. 翻译地道自然,非逐字翻译
2. 删除中国电商夸张用语(爆款/网红/必备等)
3. 保留核心参数(材质/容量/尺寸)
4. 单位转换:ML→мл, CM→см, KG→кг
5. 符合Ozon搜索习惯
6. 不添加原文不存在的属性
CONTEXT: 该文本属于{{context}}(标题/描述/属性)
品类: {{category}}
输出: {"translated": "..."}
```

**批量翻译(属性):**
- 一次请求传入多组 key/value
- AI 返回 key_ru + value_ru 映射

### 3B. 图片处理 (GPT Image 2)

**图片翻译:**
- 调用 OpenAI Images Edit API
- prompt: "Replace all Chinese text with Russian. Keep layout, colors, product appearance unchanged."
- 保存结果到 `static/images/`

**图片主体替换:**
- 调用 OpenAI Images Edit API
- prompt: 根据用户输入(如"white background product photo")

**文生图:**
- 调用 OpenAI Images Generation API
- 根据商品信息(品类/特征/风格)自动构建prompt
- 返回多张候选图

### 3C. 前端编辑抽屉集成

**AiButton组件:**
```vue
<template>
  <n-button size="small" :loading="loading" @click="$emit('click')">
    <template #icon><n-icon :component="icon" /></template>
    {{ label }}
  </n-button>
</template>
```
Props: type(translate/optimize/generate), loading, label

**各模块按钮分布:**

| 模块 | 左侧(只读) | 右侧(编辑) |
|------|------------|------------|
| 商品名称 | 原始标题 | [🌐翻译] [✨AI优化] + input |
| 商品描述 | 原始描述 | [🌐翻译] [✨AI优化] + textarea |
| 商品属性 | 原始属性列表 | [🌐翻译全部] [✨AI优化全部] + 每行[翻译] |
| 图片 | 原图缩略图 | ImageManager:删除/添加/翻译/替换/生成 |

---

## 四、文件变更清单

### 新增

| 路径 | 说明 |
|------|------|
| `backend/app/schemas/ai.py` | TranslateRequest/Response, ImageRequest/Response |
| `backend/app/services/ai_translate_service.py` | 翻译prompt + DeepSeek调用 |
| `backend/app/services/image_service.py` | GPT Image 2封装(edit/generate) |
| `backend/app/api/routers/ai_translate.py` | translate, translate-batch端点 |
| `backend/app/api/routers/ai_image.py` | translate-image, replace, generate端点 |
| `frontend/src/api/ai.ts` | AI API调用封装 |
| `frontend/src/components/selection/AiButton.vue` | AI操作按钮 |
| `frontend/src/components/selection/ImageManager.vue` | 图片管理 |

### 修改

| 路径 | 内容 |
|------|------|
| `backend/app/core/config.py` | +OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_IMAGE_MODEL |
| `backend/app/main.py` | 注册ai_translate, ai_image路由 |
| `frontend/src/components/selection/EditPanelOptimized.vue` | 各模块集成AI按钮 |
| `frontend/src/components/selection/SelectionEditDrawer.vue` | 引入ImageManager |

---

## 五、Prompt模板清单

| 模板名 | 平台 | 用途 |
|--------|------|------|
| OZON_TITLE_TRANSLATE_V1 | OZON | 标题翻译 |
| OZON_TITLE_OPTIMIZE_V1 | OZON | 标题优化(已有) |
| OZON_DESC_TRANSLATE_V1 | OZON | 描述翻译 |
| OZON_DESC_OPTIMIZE_V1 | OZON | 描述优化 |
| OZON_ATTR_TRANSLATE_V1 | OZON | 属性翻译 |
| OZON_ATTR_OPTIMIZE_V1 | OZON | 属性优化 |

---

## 六、实施步骤

### Phase 1: 后端文字翻译/优化
1. `schemas/ai.py` — 新增Translate/Optimize请求响应Schema
2. `services/ai_translate_service.py` — 翻译prompt + DeepSeek调用
3. `api/routers/ai_translate.py` — translate, translate-batch端点
4. `services/ai_optimize_service.py` — 描述优化prompt
5. 注册路由到main.py

### Phase 2: 后端图片处理
6. `config.py` — 增加OpenAI图片配置
7. `services/image_service.py` — GPT Image 2封装
8. `api/routers/ai_image.py` — 图片翻译/替换/生成端点
9. 注册路由

### Phase 3: 前端AI按钮
10. `api/ai.ts` — 封装所有AI API调用
11. `AiButton.vue` — 统一AI按钮组件
12. `ImageManager.vue` — 图片管理组件

### Phase 4: 前端集成
13. `EditPanelOptimized.vue` — 标题/描述/属性模块集成AI按钮
14. `SelectionEditDrawer.vue` — 引入ImageManager
15. 前端联调

### Phase 5: 调优
16. seed_prompts.py 初始化模板
17. 翻译质量测试
18. 图片处理效果测试
19. 错误处理与loading状态优化

---

## 七、API端点汇总

| 端点 | 方法 | 状态 |
|------|------|------|
| `/api/v1/title/optimize` | POST | ✅已有 |
| `/api/v1/product/optimize` | POST | ✅已有 |
| `/api/v1/image/prompt` | POST | ✅已有 |
| `/api/v1/ai/translate` | POST | 🔲待开发 |
| `/api/v1/ai/translate-batch` | POST | 🔲待开发 |
| `/api/v1/ai/optimize-description` | POST | 🔲待开发 |
| `/api/v1/ai/translate-image` | POST | 🔲待开发 |
| `/api/v1/ai/replace-image-subject` | POST | 🔲待开发 |
| `/api/v1/ai/generate-image` | POST | 🔲待开发 |
