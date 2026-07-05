# PowerPaint 集成方案 — 选品中心图片编辑

> 最后更新: 2026-07-05 | 状态: 方案设计阶段

---

## 一、项目概述

### 1.1 PowerPaint 是什么

PowerPaint (ECCV 2024) 是 OpenMMLab 开源的高质量多功能图像修补模型，基于 Stable Diffusion，用**单一模型**同时支持：

| 功能 | 说明 | 选品中心用途 |
|------|------|-------------|
| **Object Removal** | 智能擦除图片中指定物体 | 去水印、Logo、杂乱元素 |
| **Image Inpainting** | 文本引导区域填充 | 修复产品图缺陷 |
| **Image Outpainting** | 图片边缘智能扩展 | 调整比例适配 Ozon 要求 (1:1, 3:4) |
| **Shape-Guided Inpainting** | 形状可控物体生成 | 替换背景、局部修改 |

- **许可证**: MIT (可商用)
- **模型**: HuggingFace `JunhaoZhuang/PowerPaint-v1` (U-Net) 或 `JunhaoZhuang/PowerPaint-v2-1` (BrushNet)
- **依赖**: Python 3.9 + PyTorch + diffusers + ControlNet

### 1.2 与现有图片能力的互补关系

项目当前已有 `image_service.py`，使用 **OpenAI GPT Image API** 实现：

| 功能 | 当前方案 (GPT Image) | PowerPaint 补充 |
|------|---------------------|----------------|
| 图片翻译 (中文→俄文) | ✅ GPT Image Edit | ❌ 不擅长 OCR 级文字替换 |
| 主体/背景替换 | ✅ GPT Image Edit | ✅ 更精细的 mask 控制 |
| 文生图 | ✅ GPT Image Generation | ❌ 不做纯文生图 |
| **去水印/去物体** | ❌ 无 | ✅ 核心强项 |
| **图片比例扩展** | ❌ 无 | ✅ 核心强项 |
| **区域修复** | ❌ 无 | ✅ 核心强项 |

**结论**: PowerPaint 与现有 GPT Image 方案是**互补关系**，不是替代关系。

---

## 二、技术架构设计

### 2.1 部署架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                │
│   ProductSelectionView.vue  →  编辑抽屉  →  AI 图片编辑面板     │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP API
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│              auto-ozon Backend (FastAPI)                         │
│                                                                 │
│   /api/powerpaint/remove     — 去物体                           │
│   /api/powerpaint/outpaint   — 图片扩展                         │
│   /api/powerpaint/inpaint    — 区域修复                         │
│                                                                 │
│   services/powerpaint_service.py  ← 核心服务层                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │ 内部调用
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│         PowerPaint Service (独立进程 / Docker)                   │
│                                                                 │
│   方案 A: 同机部署 (有 GPU)                                      │
│     → 直接 import powerpaint 模块, 启动时加载模型                 │
│                                                                 │
│   方案 B: 独立服务 (远程 GPU)                                     │
│     → FastAPI 包装 PowerPaint, 通过 HTTP 调用                    │
│                                                                 │
│   方案 C: 云 API 替代 (无 GPU)                                   │
│     → Replicate / Stability AI 托管模型                         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 文件结构变更

```
backend/
├── app/
│   ├── api/routers/
│   │   └── powerpaint.py          ← 新增: API 路由
│   ├── schemas/
│   │   └── powerpaint.py          ← 新增: 请求/响应模型
│   ├── services/
│   │   └── powerpaint_service.py  ← 新增: 核心服务
│   └── main.py                    ← 修改: 注册路由
├── powerpaint_worker/             ← 新增: 独立 Worker (方案 B)
│   ├── server.py
│   ├── Dockerfile
│   └── requirements.txt
└── requirements.txt               ← 修改: 添加 httpx (已存在)
```

---

## 三、三种部署方案详解

### 方案 A: 同机 GPU 部署 (推荐 — 有 GPU 服务器时)

直接在后端进程内加载 PowerPaint 模型。

#### 优点
- 延迟最低 (~3-5 秒/张)
- 架构最简单，无额外服务

#### 缺点
- 后端进程内存占用大 (模型 ~2-4GB)
- 需要 GPU 服务器运行后端

#### 实现

```python
# backend/app/services/powerpaint_service.py

import io
import logging
import torch
from PIL import Image
from pathlib import Path

logger = logging.getLogger(__name__)

# 模型单例，避免重复加载
_pipe = None


def _get_pipe():
    """懒加载 PowerPaint pipeline (首次调用时加载模型)"""
    global _pipe
    if _pipe is not None:
        return _pipe

    from powerpaint.utils import load_model  # PowerPaint 的加载函数

    device = "cuda" if torch.cuda.is_available() else "cpu"
    dtype = torch.float16 if device == "cuda" else torch.float32

    checkpoint_dir = Path(__file__).resolve().parent.parent.parent / "checkpoints" / "ppt-v1"
    _pipe = load_model(str(checkpoint_dir), device=device, dtype=dtype)
    logger.info("PowerPaint model loaded on %s", device)
    return _pipe


def remove_object(image_bytes: bytes, mask_bytes: bytes, prompt: str = "") -> bytes:
    """移除图片中的指定物体"""
    pipe = _get_pipe()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    mask = Image.open(io.BytesIO(mask_bytes)).convert("L")

    # PowerPaint Object Removal 模式
    result = pipe(
        image=image,
        mask_image=mask,
        prompt=prompt or "clean background",
        task="object_removal",
        num_inference_steps=50,
        guidance_scale=7.5,
    ).images[0]

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()


def outpaint_image(image_bytes: bytes, horizontal_ratio: float = 0.5,
                   vertical_ratio: float = 0.5) -> bytes:
    """图片边缘智能扩展"""
    pipe = _get_pipe()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

    result = pipe(
        image=image,
        horizontal_ratio=horizontal_ratio,
        vertical_ratio=vertical_ratio,
        task="outpainting",
        num_inference_steps=50,
        guidance_scale=7.5,
    ).images[0]

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()


def inpaint_region(image_bytes: bytes, mask_bytes: bytes, prompt: str) -> bytes:
    """文本引导区域填充"""
    pipe = _get_pipe()
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    mask = Image.open(io.BytesIO(mask_bytes)).convert("L")

    result = pipe(
        image=image,
        mask_image=mask,
        prompt=prompt,
        task="object_inpainting",
        num_inference_steps=50,
        guidance_scale=7.5,
    ).images[0]

    buf = io.BytesIO()
    result.save(buf, format="PNG")
    return buf.getvalue()
```

### 方案 B: 独立 Worker 服务 (推荐 — 远程 GPU 服务器)

PowerPaint 作为独立 FastAPI 服务部署在 GPU 服务器上，auto-ozon 后端通过 HTTP 调用。

#### 优点
- 后端不占 GPU 内存
- GPU 服务器可以独立扩缩
- Docker 一键部署

#### 缺点
- 多一次网络跳转 (+10-50ms)
- 需要管理额外服务

#### PowerPaint Worker (部署在 GPU 服务器)

```python
# powerpaint_worker/server.py

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from PIL import Image
import io

app = FastAPI(title="PowerPaint Worker")

# 启动时加载模型
_pipe = None

@app.on_event("startup")
def load_model():
    global _pipe
    from powerpaint.utils import load_model as _load
    import torch
    device = "cuda" if torch.cuda.is_available() else "cpu"
    _pipe = _load("./checkpoints/ppt-v1", device=device, dtype=torch.float16)


@app.post("/remove")
async def remove(image: UploadFile = File(...), mask: UploadFile = File(...),
                 prompt: str = Form("")):
    img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    msk = Image.open(io.BytesIO(await mask.read())).convert("L")
    result = _pipe(image=img, mask_image=msk, prompt=prompt or "clean background",
                   task="object_removal", num_inference_steps=50).images[0]
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.post("/outpaint")
async def outpaint(image: UploadFile = File(...),
                   h_ratio: float = Form(0.5), v_ratio: float = Form(0.5)):
    img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    result = _pipe(image=img, horizontal_ratio=h_ratio, vertical_ratio=v_ratio,
                   task="outpainting", num_inference_steps=50).images[0]
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")


@app.post("/inpaint")
async def inpaint(image: UploadFile = File(...), mask: UploadFile = File(...),
                  prompt: str = Form(...)):
    img = Image.open(io.BytesIO(await image.read())).convert("RGB")
    msk = Image.open(io.BytesIO(await mask.read())).convert("L")
    result = _pipe(image=img, mask_image=msk, prompt=prompt,
                   task="object_inpainting", num_inference_steps=50).images[0]
    buf = io.BytesIO()
    result.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
```

```dockerfile
# powerpaint_worker/Dockerfile
FROM nvidia/cuda:12.1.0-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y python3.10 python3-pip git git-lfs
RUN git lfs install

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN git lfs clone https://huggingface.co/JunhaoZhuang/PowerPaint-v1/ ./checkpoints/ppt-v1

COPY server.py .
EXPOSE 8099
CMD ["python3", "server.py"]
```

#### auto-ozon 后端调用

```python
# backend/app/services/powerpaint_service.py (方案 B 版本)

import httpx
import logging
from app.core.config import POWERPAINT_URL

logger = logging.getLogger(__name__)

POWERPAINT_BASE = POWERPAINT_URL  # e.g. "http://gpu-server:8099"

async def remove_object(image_bytes: bytes, mask_bytes: bytes, prompt: str = "") -> bytes:
    """移除图片中的指定物体"""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{POWERPAINT_BASE}/remove",
            files={"image": ("image.png", image_bytes, "image/png"),
                   "mask": ("mask.png", mask_bytes, "image/png")},
            data={"prompt": prompt or "clean background"},
        )
        resp.raise_for_status()
        return resp.content


async def outpaint_image(image_bytes: bytes, h_ratio: float = 0.5,
                         v_ratio: float = 0.5) -> bytes:
    """图片边缘智能扩展"""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{POWERPAINT_BASE}/outpaint",
            files={"image": ("image.png", image_bytes, "image/png")},
            data={"h_ratio": h_ratio, "v_ratio": v_ratio},
        )
        resp.raise_for_status()
        return resp.content


async def inpaint_region(image_bytes: bytes, mask_bytes: bytes, prompt: str) -> bytes:
    """文本引导区域填充"""
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            f"{POWERPAINT_BASE}/inpaint",
            files={"image": ("image.png", image_bytes, "image/png"),
                   "mask": ("mask.png", mask_bytes, "image/png")},
            data={"prompt": prompt},
        )
        resp.raise_for_status()
        return resp.content
```

### 方案 C: 云 API 替代 (无 GPU 时的降级方案)

不自部署 PowerPaint，改用商业 API。

| 服务 | 功能匹配度 | 单价 | 推荐场景 |
|------|-----------|------|---------|
| **Replicate (stability-ai/sdxl-inpainting)** | ⭐⭐⭐⭐ | $0.01/张 | 最接近 PowerPaint |
| **Photoroom** | ⭐⭐⭐ | $0.10/张 | 专精背景去除 |
| **Remove.bg** | ⭐⭐ | $0.035/张 | 仅背景去除 |

---

## 四、前端集成方案

### 4.1 编辑抽屉图片面板增加 AI 编辑

在现有的 `ProductSelectionView.vue` 编辑抽屉的图片管理区域，为每张图片增加 AI 编辑能力：

```
┌─────────────────────────────────────────────┐
│  ── 商品图片 ── [AI批量处理]                │
│                                             │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  img1   │ │  img2   │ │  img3   │       │
│  │         │ │         │ │         │       │
│  │ ✨ ✕ 📐│ │ ✨ ✕ 📐│ │ ✨ ✕ 📐│       │
│  └─────────┘ └─────────┘ └─────────┘       │
│                                             │
│  ✨=AI编辑  ✕=删除  📐=扩展比例            │
│                                             │
│  [+添加]                                    │
└─────────────────────────────────────────────┘
```

### 4.2 AI 编辑弹窗

点击 ✨ 按钮后弹出编辑工具面板：

```vue
<!-- components/ImageAIEditor.vue (新增) -->
<template>
  <n-modal v-model:show="visible" preset="card" title="AI 图片编辑" :style="{ width: '700px' }">
    <div class="editor-layout">
      <!-- 左侧: 原图 + Mask 画板 -->
      <div class="editor-canvas">
        <canvas ref="canvasRef" @mousedown="startDraw" @mousemove="draw" @mouseup="endDraw" />
        <div class="toolbar">
          <n-button @click="tool = 'brush'" :type="tool === 'brush' ? 'primary' : 'default'">
            🖌️ 画笔 (标记要编辑的区域)
          </n-button>
          <n-button @click="tool = 'eraser'" :type="tool === 'eraser' ? 'primary' : 'default'">
            🧹 橡皮
          </n-button>
          <n-slider v-model:value="brushSize" :min="5" :max="50" :step="5" style="width: 120px" />
        </div>
      </div>

      <!-- 右侧: 操作选择 -->
      <div class="editor-actions">
        <n-radio-group v-model:value="editMode">
          <n-space vertical>
            <n-radio value="remove">🗑️ 去除物体 (擦除选中区域)</n-radio>
            <n-radio value="inpaint">✏️ 区域修复 (用文字描述填充)</n-radio>
            <n-radio value="outpaint">📐 扩展图片 (调整比例)</n-radio>
          </n-space>
        </n-radio-group>

        <!-- 区域修复时显示文字输入 -->
        <n-input v-if="editMode === 'inpaint'" v-model:value="editPrompt"
                 type="textarea" placeholder="描述要生成的内容，如: white clean background" />

        <!-- 扩展比例 -->
        <template v-if="editMode === 'outpaint'">
          <n-space>
            <span>水平扩展:</span>
            <n-slider v-model:value="hRatio" :min="0" :max="1" :step="0.1" />
          </n-space>
          <n-space>
            <span>垂直扩展:</span>
            <n-slider v-model:value="vRatio" :min="0" :max="1" :step="0.1" />
          </n-space>
        </template>

        <n-button type="primary" @click="applyEdit" :loading="processing">
          ✨ 应用编辑
        </n-button>
      </div>
    </div>

    <!-- 结果预览 -->
    <div v-if="resultUrl" class="result-preview">
      <n-divider>编辑结果</n-divider>
      <div style="display: flex; gap: 16px; justify-content: center">
        <div>
          <p style="text-align: center; color: #999; font-size: 12px">原图</p>
          <img :src="originalUrl" style="max-height: 200px; border: 1px solid #eee; border-radius: 4px" />
        </div>
        <div>
          <p style="text-align: center; color: #999; font-size: 12px">结果</p>
          <img :src="resultUrl" style="max-height: 200px; border: 1px solid #eee; border-radius: 4px" />
        </div>
      </div>
      <n-space justify="center" style="margin-top: 12px">
        <n-button @click="rejectResult">❌ 重新编辑</n-button>
        <n-button type="primary" @click="acceptResult">✅ 使用此结果</n-button>
      </n-space>
    </div>
  </n-modal>
</template>
```

### 4.3 API 调用层

```typescript
// frontend/src/api/powerpaint.ts (新增)

export interface PowerPaintResponse {
  url: string       // 编辑后的图片 URL
  original_url: string
}

export const powerpaintApi = {
  /** 去除物体 — 需要上传原图和 mask */
  async removeObject(image: File | Blob, mask: File | Blob, prompt = ''): Promise<PowerPaintResponse> {
    const form = new FormData()
    form.append('image', image)
    form.append('mask', mask)
    if (prompt) form.append('prompt', prompt)
    const res = await fetch('/api/powerpaint/remove', { method: 'POST', body: form })
    return res.json()
  },

  /** 图片扩展 */
  async outpaint(image: File | Blob, hRatio = 0.5, vRatio = 0.5): Promise<PowerPaintResponse> {
    const form = new FormData()
    form.append('image', image)
    form.append('horizontal_ratio', String(hRatio))
    form.append('vertical_ratio', String(vRatio))
    const res = await fetch('/api/powerpaint/outpaint', { method: 'POST', body: form })
    return res.json()
  },

  /** 区域修复 */
  async inpaint(image: File | Blob, mask: File | Blob, prompt: string): Promise<PowerPaintResponse> {
    const form = new FormData()
    form.append('image', image)
    form.append('mask', mask)
    form.append('prompt', prompt)
    const res = await fetch('/api/powerpaint/inpaint', { method: 'POST', body: form })
    return res.json()
  },
}
```

---

## 五、后端 API 路由

### 5.1 Pydantic 模型

```python
# backend/app/schemas/powerpaint.py

from pydantic import BaseModel


class PowerPaintResponse(BaseModel):
    url: str
    original_url: str
    task: str
    duration_ms: float


class OutpaintRequest(BaseModel):
    horizontal_ratio: float = 0.5  # 0-1
    vertical_ratio: float = 0.5    # 0-1
```

### 5.2 路由

```python
# backend/app/api/routers/powerpaint.py

import time
import uuid
import logging
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException

from app.services import powerpaint_service

router = APIRouter(prefix="/api/powerpaint", tags=["powerpaint"])
logger = logging.getLogger(__name__)

STATIC_DIR = Path(__file__).resolve().parent.parent.parent / "static" / "edited"


def _save_result(data: bytes, prefix: str) -> str:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}_{uuid.uuid4().hex[:8]}.png"
    (STATIC_DIR / name).write_bytes(data)
    return f"/static/edited/{name}"


@router.post("/remove")
async def api_remove(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(""),
):
    """去除图片中的物体"""
    t0 = time.time()
    try:
        img_bytes = await image.read()
        mask_bytes = await mask.read()
        result = await powerpaint_service.remove_object(img_bytes, mask_bytes, prompt)
        url = _save_result(result, "remove")
        return {"url": url, "original_url": "", "task": "remove",
                "duration_ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        logger.error("PowerPaint remove failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/outpaint")
async def api_outpaint(
    image: UploadFile = File(...),
    horizontal_ratio: float = Form(0.5),
    vertical_ratio: float = Form(0.5),
):
    """图片边缘扩展"""
    t0 = time.time()
    try:
        img_bytes = await image.read()
        result = await powerpaint_service.outpaint_image(
            img_bytes, horizontal_ratio, vertical_ratio
        )
        url = _save_result(result, "outpaint")
        return {"url": url, "original_url": "", "task": "outpaint",
                "duration_ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        logger.error("PowerPaint outpaint failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/inpaint")
async def api_inpaint(
    image: UploadFile = File(...),
    mask: UploadFile = File(...),
    prompt: str = Form(...),
):
    """文本引导区域修复"""
    t0 = time.time()
    try:
        img_bytes = await image.read()
        mask_bytes = await mask.read()
        result = await powerpaint_service.inpaint_region(img_bytes, mask_bytes, prompt)
        url = _save_result(result, "inpaint")
        return {"url": url, "original_url": "", "task": "inpaint",
                "duration_ms": round((time.time() - t0) * 1000)}
    except Exception as e:
        logger.error("PowerPaint inpaint failed: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
```

### 5.3 注册路由 (main.py 变更)

```python
# 在 main.py 的 import 行增加:
from app.api.routers import powerpaint

# 在 app.include_router(...) 区域增加:
app.include_router(powerpaint.router)
```

### 5.4 环境变量 (.env 变更)

```bash
# PowerPaint 配置
POWERPAINT_URL=http://localhost:8099   # 方案 B 时填 GPU 服务器地址
# 方案 A 时无需此变量，模型在后端进程内加载
```

---

## 六、硬件与成本评估

### 6.1 硬件需求

| 组件 | 最低 | 推荐 |
|------|------|------|
| GPU | RTX 2060 6GB | RTX 3060 12GB |
| RAM | 16GB | 32GB |
| 存储 | 20GB (模型 ~4GB) | 50GB SSD |
| 推理速度 | ~10-15 秒/张 | ~3-5 秒/张 |

### 6.2 成本对比 (月处理 1000 张)

| 方案 | 月成本 | 单张 | 前期投入 |
|------|--------|------|---------|
| 方案 A: 自部署 (GPU 云) | $200-400 | $0.20-0.40 | 1-2 天 |
| 方案 B: 独立 Worker | $150-300 | $0.15-0.30 | 2-3 天 |
| 方案 C-1: Replicate API | $10 | $0.01 | 0.5 天 |
| 方案 C-2: Photoroom API | $100 | $0.10 | 0.5 天 |
| 方案 C-3: Remove.bg API | $35 | $0.035 | 0.5 天 |

---

## 七、实施路线图

### Phase 1: 快速验证 (1-2 天)
- [ ] 在本地/服务器试跑 PowerPaint Gradio Demo
- [ ] 测试 10 张典型商品图的去水印/扩展效果
- [ ] 确认效果满足选品中心需求

### Phase 2: 后端集成 (2-3 天)
- [ ] 实现 `powerpaint_service.py` (选方案 A 或 B)
- [ ] 实现 `api/routers/powerpaint.py`
- [ ] 编写单元测试

### Phase 3: 前端集成 (2-3 天)
- [ ] 实现 `ImageAIEditor.vue` 组件 (Mask 画板 + 操作面板)
- [ ] 集成到编辑抽屉图片区域
- [ ] API 调用层

### Phase 4: 优化迭代 (持续)
- [ ] 批量处理队列 (Celery)
- [ ] 编辑历史/撤销
- [ ] 预设模板 (白底、标准比例等)

---

## 八、风险与注意事项

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| GPU 服务器成本 | 高 | 图片量少时用方案 C (云 API) |
| 推理延迟 | 中 | 异步任务 + loading 状态 + 缩略图预览 |
| 模型质量 | 中 | 先用 10 张图验证效果再决定 |
| 依赖冲突 | 低 | PowerPaint 用独立 conda env / Docker 隔离 |
| 内存占用 | 中 | 方案 B 将模型隔离到独立进程 |

---

## 九、与现有系统的融合点

### 9.1 编辑抽屉图片区 (已设计，尚未完全实现)

根据 `docs/选品中心设计.md` 3.3.4 节，编辑抽屉图片区域设计了:
- ✅ 每张图片悬浮 ✨ 按钮 → **直接对接 PowerPaint**
- ✅ AI 批量处理按钮 → **批量调用 PowerPaint**
- ✅ 主图标记 → 扩展后仍保持主图地位

### 9.2 采集流程自动预处理 (可选)

采集时自动对图片进行:
1. 自动检测水印/杂乱元素 → 自动去除
2. 自动检测比例 → 自动扩展到 Ozon 标准比例
3. 生成缩略图预览 → 选品时快速判断

---

## 十、决策建议

| 场景 | 推荐方案 | 理由 |
|------|---------|------|
| 有 GPU 服务器 | **方案 B** (独立 Worker) | 解耦、可扩展、Docker 部署 |
| 无 GPU，图片量小 (<500/月) | **方案 C-1** (Replicate API) | 成本最低，效果接近 |
| 无 GPU，图片量大 (>1000/月) | **租 GPU 服务器 + 方案 B** | 长期更划算 |
| 先验证效果 | **本地跑 Gradio** | 零成本评估 |

**我的建议**: 先执行 **Phase 1** (本地跑 Gradio 验证效果)，确认效果满意后再决定走哪条路线。整个 Phase 1 只需 1-2 天，零成本。
