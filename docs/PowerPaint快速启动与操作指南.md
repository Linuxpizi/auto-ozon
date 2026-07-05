# PowerPaint 快速启动与操作指南

> 最后更新: 2026-07-05 | 前置阅读: [PowerPaint集成方案.md](./PowerPaint集成方案.md)

---

## 一、环境要求

### 硬件

| 配置 | 推荐 | 最低 |
|------|------|------|
| GPU | RTX 3060 12GB+ | 无（CPU 模式可用） |
| RAM | 32GB | 16GB |
| 磁盘 | 20GB+ 可用空间 | 8GB（仅模型） |

> **无 GPU 也能运行**：服务默认 CPU 优先，检测到 GPU 自动切换。CPU 模式推理约 30-60 秒/张，GPU 约 3-5 秒/张。

### 软件

- Python 3.9+
- Node.js 18+
- pip / npm

---

## 二、安装与启动

### Step 1：安装 Python 依赖

```bash
cd backend

# 激活虚拟环境
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# 安装核心依赖（含 PyTorch）
pip install -r requirements.txt
```

> **无 GPU 时**：`pip install` 会自动安装 CPU 版 PyTorch，无需额外操作。
> **有 GPU 时**：如果 CUDA 12.x，建议先安装 GPU 版 PyTorch：
> ```bash
> pip install torch --index-url https://download.pytorch.org/whl/cu121
> pip install -r requirements.txt
> ```

### Step 2：下载模型

```bash
python scripts/download_powerpaint_models.py
```

模型大小约 **4GB**，下载到 `backend/models/powerpaint-v1/`。下载源：HuggingFace `JunhaoZhuang/PowerPaint-v1`。

国内网络慢时可设置镜像：

```bash
export HF_ENDPOINT=https://hf-mirror.com
python scripts/download_powerpaint_models.py
```

手动下载：访问 https://huggingface.co/JunhaoZhuang/PowerPaint-v1 ，将文件放入 `backend/models/powerpaint-v1/`。

### Step 3：启动后端

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 9000
```

启动后会看到日志：

- 有 GPU: `PowerPaint: GPU detected — NVIDIA xxx (12.0 GB), using float16`
- 无 GPU: `PowerPaint: No GPU found, running on CPU with float32 (slower)`

> **注意**：首次启动时模型加载约需 30-60 秒（CPU）/ 5-10 秒（GPU），期间接口会阻塞。PowerPaint 没有独立服务，直接运行在现有 FastAPI 进程中。

### Step 4：启动前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173 → 侧边栏「选品中心」→ 点击商品编辑抽屉 → 底部「🎨 PowerPaint 图片编辑」区域。

---

## 三、API 接口参考

所有接口前缀：`/api/powerpaint`，直接集成在现有后端中，无需单独启动。

### 3.1 查询设备状态

```http
GET /api/powerpaint/device
```

响应：

```json
{
  "device": "cpu",
  "dtype": "float32",
  "model_dir": "/path/to/models/powerpaint-v1",
  "model_exists": true,
  "cuda_available": false
}
```

### 3.2 去除物体 (Object Removal)

```http
POST /api/powerpaint/remove
Content-Type: multipart/form-data

image: <原图文件>
mask: <遮罩文件 — 白色=要去除的区域>
prompt: ""                    (可选，引导提示词)
num_inference_steps: 50        (可选，推理步数)
guidance_scale: 7.5            (可选，引导强度)
```

响应：

```json
{
  "url": "/static/edited/remove_abc12345.png",
  "task": "remove",
  "duration_ms": 35200.5,
  "device": "cpu"
}
```

**Mask 说明**：

- 格式：与原图同等尺寸的黑白图
- **白色区域** = 需要去除的物体
- **黑色区域** = 保留不变
- 支持 PNG/JPG 格式，会自动转为灰度

### 3.3 图片扩展 (Outpainting)

```http
POST /api/powerpaint/outpaint
Content-Type: multipart/form-data

image: <原图文件>
expand_h: 0.3                  (水平扩展比例，0~1)
expand_v: 0.0                  (垂直扩展比例，0~1)
prompt: ""                     (可选)
num_inference_steps: 50         (可选)
guidance_scale: 7.5             (可选)
```

**使用场景**：

- `expand_h=0.3, expand_v=0` → 左右各扩展 30%，适合窄图变宽
- `expand_h=0, expand_v=0.5` → 上下各扩展 50%，适合横图变竖
- `expand_h=0.3, expand_v=0.3` → 四周均匀扩展

### 3.4 区域修复 (Inpainting)

```http
POST /api/powerpaint/inpaint
Content-Type: multipart/form-data

image: <原图文件>
mask: <遮罩文件 — 白色=需要修复的区域>
prompt: "clean white background"  (必填，描述修复内容)
num_inference_steps: 50            (可选)
guidance_scale: 7.5                (可选)
```

**与去物体的区别**：

- **去物体**：擦除后用背景填充，prompt 通常留空
- **修复**：根据 prompt 描述的内容填充区域，需填写 prompt

---

## 四、前端操作指南

### 4.1 基本流程

```
打开编辑抽屉 → 自动检测服务状态 → 选择图片 → 选择操作 → 编辑/执行 → 预览结果 → 应用
```

### 4.2 详细步骤

**① 打开编辑抽屉**

- 在选品中心列表中，点击商品行右侧的「编辑」按钮
- 抽屉打开后自动检测 PowerPaint 服务状态（显示 CPU/GPU 标签）

**② 选择编辑图片**

- 在「🎨 PowerPaint 图片编辑」区域，点击缩略图选中目标图片
- 选中后图片会有蓝色边框高亮
- 如未自动检测到服务，点击「刷新设备」手动检测

**③ 选择操作**

| 按钮 | 功能 | 操作方式 |
|------|------|----------|
| 🗑️ 去物体 | 去除水印、Logo、杂乱元素 | 打开 Mask 编辑器，绘制要去除的区域 |
| 📐 扩图 | 智能扩展图片边缘 | 直接执行，或先调「扩图比例」滑块 |
| ✏️ 修复 | 文本引导区域修复 | 打开 Mask 编辑器，绘制区域 + 输入描述 |

**④ Mask 编辑器操作**（去物体 / 修复）

弹出 640px 宽的编辑弹窗：

1. 点击「开始绘制」进入画笔模式
2. 在图片上拖拽 —— **白色笔触**标记需要编辑的区域
3. 可调「画笔大小」滑块（5~50px）
4. 点击「清除遮罩」重新开始
5. 绘制完成后，「应用遮罩」按钮会高亮可点击
6. 点击「应用遮罩」→ 执行编辑 → 等待处理完成
7. 结果预览 →「应用到当前图片」替换原图

**⑤ 扩图操作**

1. 点击「📐 扩图比例」弹出滑块面板
2. 调整「水平扩展」和「垂直扩展」比例（0~100%）
3. 点击「📐 扩图」按钮直接执行
4. 结果预览 →「应用到当前图片」

### 4.3 与 ChatGPT AI 的关系

编辑抽屉中有两套独立的图片编辑能力，互不干扰：

```
商品图片区域
├── ChatGPT AI（上方区域）
│   ├── ✨ AI优化全部 — 替换背景/主体
│   ├── 🎨 AI批量生成 — 文生图
│   └── 每张图 ✨ 按钮 — 图片翻译（中→俄）
│
└── 🎨 PowerPaint（下方虚线框区域）
    ├── 🗑️ 去物体 — 擦除指定区域
    ├── 📐 扩图 — 边缘智能扩展
    └── ✏️ 修复 — 文本引导填充
```

- **AI 优化全部 / ✨ 按钮** → 调用 OpenAI GPT Image API
- **去物体 / 扩图 / 修复** → 调用本地 PowerPaint 模型
- 两者状态独立，可分别使用

---

## 五、常见问题

### Q: 按钮显示灰色/禁用？

**A**: 模型未加载。检查：

1. `backend/models/powerpaint-v1/` 目录下是否有 `.safetensors` 或 `.bin` 文件
2. 重启后端服务，等待模型加载完成
3. 点击「刷新设备」按钮查看状态

### Q: 推理很慢？

**A**: CPU 模式下正常（30-60 秒/张）。加速方案：

1. 安装 GPU 版 PyTorch（见 Step 1）
2. 减少 `num_inference_steps`（如 25 步，牺牲质量换速度）
3. 租用 GPU 服务器部署（如 AutoDL）

### Q: 模型下载失败？

**A**:

1. 设置 HuggingFace 镜像：`export HF_ENDPOINT=https://hf-mirror.com`
2. 手动下载：访问 https://huggingface.co/JunhaoZhuang/PowerPaint-v1
3. 检查磁盘空间（需 8GB+）

### Q: 启动报错 `No module named 'torch'`？

**A**: 运行 `pip install torch` 安装 PyTorch。无 GPU 时自动安装 CPU 版。

---

## 六、文件结构参考

```
backend/
├── app/
│   ├── api/routers/powerpaint.py      # API 路由 (4个端点)
│   ├── schemas/powerpaint.py          # 请求/响应模型
│   └── services/powerpaint_service.py # 核心推理服务 (CPU/GPU)
├── models/
│   └── powerpaint-v1/                 # 模型权重 (~4GB)
├── scripts/
│   └── download_powerpaint_models.py  # 模型下载脚本
├── static/edited/                     # 编辑结果存储
├── main.py                            # 路由注册
└── requirements.txt                   # Python 依赖

frontend/
└── src/
    ├── api/powerpaint.ts              # PowerPaint API 客户端
    └── views/ProductSelectionView.vue # 选品中心 + 编辑抽屉
```

---

## 七、注意事项

PowerPaint **没有启动独立的服务**，它直接运行在现有的 FastAPI 后端进程中：

1. **启动方式**：与其他所有 API 一起通过 `uvicorn app.main:app` 启动
2. **模型加载**：首次请求时懒加载（首次推理约 30-60 秒 CPU / 5-10 秒 GPU）
3. **资源占用**：与现有服务共享进程资源，CPU 模式约 1-2GB 额外内存
4. **无额外配置**：不需要单独的端口、环境变量或服务配置

如果需要在无 GPU 的生产环境中部署，建议使用 CPU 模式并适当降低 `num_inference_steps`（如 25 步）以加速推理。
