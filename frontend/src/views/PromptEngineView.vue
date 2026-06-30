<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">优图 Prompt 引擎</n-h2>
    </div>

    <!-- Tab Navigation -->
    <n-tabs v-model:value="activeTab" type="line" animated style="margin-bottom: 20px;">
      <n-tab name="playground">🎯 智能优化</n-tab>
      <n-tab name="templates">📋 模板管理</n-tab>
      <n-tab name="localization">🌍 本土化规则</n-tab>
    </n-tabs>

    <!-- ═══════════════ Playground ═══════════════ -->
    <template v-if="activeTab === 'playground'">
      <n-grid :cols="2" :x-gap="20">
        <!-- Left: Title Optimization -->
        <n-gi>
          <div class="card">
            <div class="card-title">🏷️ 标题优化</div>
            <div class="card-subtitle">根据商品属性自动生成平台最优标题</div>

            <n-form label-placement="left" label-width="80" size="small" style="margin-top: 12px;">
              <n-form-item label="平台">
                <n-radio-group v-model:value="titleForm.platform">
                  <n-radio value="TB">淘宝</n-radio>
                  <n-radio value="OZON">Ozon</n-radio>
                </n-radio-group>
              </n-form-item>
              <n-form-item label="语言">
                <n-select v-model:value="titleForm.language" :options="langOptions" style="width: 120px;" />
              </n-form-item>
              <n-form-item label="品类">
                <n-input v-model:value="titleForm.category" placeholder="如：保温杯" />
              </n-form-item>
              <n-form-item label="品牌">
                <n-input v-model:value="titleForm.brand" placeholder="品牌名" />
              </n-form-item>
              <n-form-item label="材质">
                <n-input v-model:value="titleForm.material" placeholder="如：304不锈钢" />
              </n-form-item>
              <n-form-item label="容量">
                <n-input v-model:value="titleForm.capacity" placeholder="如：500ml" />
              </n-form-item>
              <n-form-item label="颜色">
                <n-input v-model:value="titleForm.color" placeholder="如：黑色" />
              </n-form-item>
              <n-form-item label="特征">
                <n-select v-model:value="titleForm.feature" multiple tag filterable placeholder="回车添加特征"
                  :options="featureOptions" />
              </n-form-item>
              <n-form-item label="模板">
                <n-select v-model:value="titleForm.template_name" clearable placeholder="自动路由（可不选）"
                  :options="titleTemplateOptions" style="width: 100%;" />
              </n-form-item>
            </n-form>

            <div style="text-align: right;">
              <n-button type="primary" :loading="titleLoading" @click="runTitleOptimize">
                {{ titleLoading ? '优化中...' : '🚀 生成标题' }}
              </n-button>
            </div>

            <!-- Title Result -->
            <div v-if="titleResult" class="result-box" style="margin-top: 16px;">
              <div class="result-label">优化标题</div>
              <div class="result-text">{{ titleResult.title || titleResult.title_ru }}</div>

              <div v-if="titleResult.seo_score !== undefined && titleResult.seo_score !== null" class="result-label" style="margin-top: 8px;">
                SEO 评分
              </div>
              <div v-if="titleResult.seo_score !== undefined && titleResult.seo_score !== null">
                <n-progress type="line" :percentage="titleResult.seo_score" :height="12" :border-radius="4"
                  :indicator-text-color="titleResult.seo_score >= 80 ? '#18a058' : '#f0a020'"
                  :color="titleResult.seo_score >= 80 ? '#18a058' : '#f0a020'" />
              </div>

              <div v-if="titleResult.keywords?.length" class="result-label" style="margin-top: 8px;">关键词</div>
              <div v-if="titleResult.keywords?.length" style="display: flex; flex-wrap: wrap; gap: 6px;">
                <n-tag v-for="(kw, i) in titleResult.keywords" :key="i" size="small" round>
                  {{ kw }}
                </n-tag>
              </div>

              <div v-if="titleResult.reason" class="result-label" style="margin-top: 8px;">推荐理由</div>
              <div v-if="titleResult.reason" style="font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
                {{ titleResult.reason }}
              </div>
            </div>
          </div>
        </n-gi>

        <!-- Right: Product Info Optimization -->
        <n-gi>
          <div class="card">
            <div class="card-title">📦 产品信息优化</div>
            <div class="card-subtitle">生成卖点、描述、使用场景、FAQ 等完整产品信息</div>

            <n-form label-placement="left" label-width="80" size="small" style="margin-top: 12px;">
              <n-form-item label="平台">
                <n-radio-group v-model:value="productForm.platform">
                  <n-radio value="TB">淘宝</n-radio>
                  <n-radio value="OZON">Ozon</n-radio>
                </n-radio-group>
              </n-form-item>
              <n-form-item label="语言">
                <n-select v-model:value="productForm.language" :options="langOptions" style="width: 120px;" />
              </n-form-item>
              <n-form-item label="标题">
                <n-input v-model:value="productForm.title" placeholder="商品标题" />
              </n-form-item>
              <n-form-item label="品牌">
                <n-input v-model:value="productForm.brand" placeholder="品牌名" />
              </n-form-item>
              <n-form-item label="描述">
                <n-input v-model:value="productForm.description" type="textarea" :rows="3" placeholder="商品原始描述（可选）" />
              </n-form-item>
              <n-form-item label="特征">
                <n-select v-model:value="productForm.features" multiple tag filterable placeholder="回车添加"
                  :options="featureOptions" />
              </n-form-item>
              <n-form-item label="模板">
                <n-select v-model:value="productForm.template_name" clearable placeholder="自动路由（可不选）"
                  :options="productTemplateOptions" style="width: 100%;" />
              </n-form-item>
            </n-form>

            <div style="text-align: right;">
              <n-button type="primary" :loading="productLoading" @click="runProductOptimize">
                {{ productLoading ? '优化中...' : '🚀 生成信息' }}
              </n-button>
            </div>

            <!-- Product Result -->
            <div v-if="productResult" class="result-box" style="margin-top: 16px;">
              <template v-if="productResult.title || productResult.title_ru">
                <div class="result-label">标题</div>
                <div class="result-text">{{ productResult.title_ru || productResult.title }}</div>
              </template>

              <template v-if="productResult.selling_points?.length">
                <div class="result-label" style="margin-top: 8px;">核心卖点</div>
                <ul style="margin: 4px 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.8;">
                  <li v-for="(sp, i) in productResult.selling_points" :key="i">{{ sp }}</li>
                </ul>
              </template>

              <template v-if="productResult.description">
                <div class="result-label" style="margin-top: 8px;">产品描述</div>
                <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.6; white-space: pre-wrap;">{{ productResult.description }}</div>
              </template>

              <template v-if="productResult.usage_scenarios?.length">
                <div class="result-label" style="margin-top: 8px;">使用场景</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  <n-tag v-for="(s, i) in productResult.usage_scenarios" :key="i" size="small" round type="info">
                    {{ s }}
                  </n-tag>
                </div>
              </template>

              <template v-if="productResult.keywords?.length">
                <div class="result-label" style="margin-top: 8px;">SEO 关键词</div>
                <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                  <n-tag v-for="(kw, i) in productResult.keywords" :key="i" size="small" round>
                    {{ kw }}
                  </n-tag>
                </div>
              </template>

              <template v-if="productResult.faq?.length">
                <div class="result-label" style="margin-top: 8px;">FAQ</div>
                <div v-for="(item, i) in productResult.faq" :key="i" style="margin-bottom: 6px;">
                  <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">
                    Q: {{ item.question || item.q }}
                  </div>
                  <div style="font-size: 12px; color: var(--text-secondary); padding-left: 16px;">
                    A: {{ item.answer || item.a }}
                  </div>
                </div>
              </template>
            </div>
          </div>
        </n-gi>
      </n-grid>

      <!-- Image Prompt Section -->
      <div class="card" style="margin-top: 20px;">
        <div class="card-title">🎨 图生图 Prompt</div>
        <div class="card-subtitle">根据商品信息生成 AI 图片生成 Prompt（Midjourney / Stable Diffusion）</div>

        <n-grid :cols="4" :x-gap="12" style="margin-top: 12px;">
          <n-gi>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">品类</div>
            <n-input v-model:value="imageForm.category" placeholder="如：保温杯" size="small" />
          </n-gi>
          <n-gi>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">品牌</div>
            <n-input v-model:value="imageForm.brand" placeholder="品牌名" size="small" />
          </n-gi>
          <n-gi>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">风格</div>
            <n-select v-model:value="imageForm.style" :options="styleOptions" size="small" />
          </n-gi>
          <n-gi>
            <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">特征</div>
            <n-select v-model:value="imageForm.features" multiple tag filterable placeholder="回车添加"
              :options="featureOptions" size="small" />
          </n-gi>
        </n-grid>

        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 12px;">
          <n-radio-group v-model:value="imageForm.platform" size="small">
            <n-radio value="TB">淘宝</n-radio>
            <n-radio value="OZON">Ozon</n-radio>
          </n-radio-group>
          <n-button type="primary" :loading="imageLoading" size="small" @click="runImagePrompt">
            {{ imageLoading ? '生成中...' : '🎨 生成 Prompt' }}
          </n-button>
        </div>

        <div v-if="imageResult" class="result-box" style="margin-top: 12px;">
          <div v-for="(prompt, i) in imageResult.prompts" :key="i" style="margin-bottom: 8px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <n-tag size="small" round type="info">Prompt {{ i + 1 }}</n-tag>
              <div style="flex: 1; font-size: 13px; color: var(--text-secondary); line-height: 1.5; font-family: monospace;">
                {{ prompt }}
              </div>
              <n-button size="tiny" quaternary @click="copyText(prompt)">复制</n-button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════ Templates ═══════════════ -->
    <template v-if="activeTab === 'templates'">
      <div class="page-header" style="margin-bottom: 16px;">
        <div class="toolbar">
          <n-select v-model:value="tplFilter.platform" :options="platformOptions" clearable placeholder="平台"
            size="small" style="width: 120px;" @update:value="loadTemplates" />
          <n-select v-model:value="tplFilter.language" :options="langOptions" clearable placeholder="语言"
            size="small" style="width: 100px;" @update:value="loadTemplates" />
          <n-select v-model:value="tplFilter.is_active" :options="activeOptions" clearable placeholder="状态"
            size="small" style="width: 100px;" @update:value="loadTemplates" />
          <n-button size="small" @click="loadTemplates">刷新</n-button>
          <n-button type="primary" size="small" @click="openTemplateForm()">新建模板</n-button>
        </div>
      </div>

      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>名称</th>
              <th>平台</th>
              <th>语言</th>
              <th>类别</th>
              <th>版本</th>
              <th>模型</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tpl in templates" :key="tpl.id">
              <td style="font-weight: 600; font-size: 13px;">{{ tpl.name }}</td>
              <td>
                <n-tag :type="tpl.platform === 'OZON' ? 'info' : 'warning'" size="small" round>
                  {{ tpl.platform === 'OZON' ? 'Ozon' : '淘宝' }}
                </n-tag>
              </td>
              <td style="font-size: 13px;">{{ tpl.language }}</td>
              <td style="font-size: 13px;">{{ tpl.category || '-' }}</td>
              <td style="font-size: 13px;">{{ tpl.version }}</td>
              <td style="font-size: 12px; color: var(--text-secondary);">{{ tpl.model }}</td>
              <td>
                <n-tag :type="tpl.is_active ? 'success' : 'default'" size="small" round>
                  {{ tpl.is_active ? '启用' : '禁用' }}
                </n-tag>
              </td>
              <td>
                <n-space :size="6">
                  <n-button size="tiny" quaternary @click="openTemplateForm(tpl)">编辑</n-button>
                  <n-button size="tiny" quaternary type="error" @click="deleteTemplate(tpl)">删除</n-button>
                </n-space>
              </td>
            </tr>
            <tr v-if="!templates.length">
              <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">暂无模板，请运行 seed_prompts.py 导入</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Template Form Drawer -->
      <n-drawer v-model:show="tplFormVisible" :width="600" placement="right">
        <n-drawer-content :title="editingTemplate ? '编辑模板' : '新建模板'" closable>
          <n-form label-placement="left" label-width="80" size="small">
            <n-form-item label="名称" required>
              <n-input v-model:value="tplForm.name" :disabled="!!editingTemplate" placeholder="如：TB_TITLE_OPTIMIZER_V2" />
            </n-form-item>
            <n-form-item label="平台" required>
              <n-select v-model:value="tplForm.platform" :options="platformOptions" />
            </n-form-item>
            <n-form-item label="语言" required>
              <n-select v-model:value="tplForm.language" :options="langOptions" />
            </n-form-item>
            <n-form-item label="类别">
              <n-select v-model:value="tplForm.category" :options="categoryOptions" clearable />
            </n-form-item>
            <n-form-item label="版本">
              <n-input v-model:value="tplForm.version" />
            </n-form-item>
            <n-form-item label="模型">
              <n-input v-model:value="tplForm.model" />
            </n-form-item>
            <n-form-item label="System Prompt" required>
              <n-input v-model:value="tplForm.system_prompt" type="textarea" :rows="10"
                placeholder="系统提示词..." />
            </n-form-item>
            <n-form-item label="输入 Schema">
              <n-input v-model:value="tplForm.input_schema" type="textarea" :rows="3"
                placeholder='{"category":"", "brand":""}' />
            </n-form-item>
            <n-form-item label="输出 Schema">
              <n-input v-model:value="tplForm.output_schema" type="textarea" :rows="3"
                placeholder='{"title":"","keywords":[]}' />
            </n-form-item>
            <n-form-item label="输出格式">
              <n-select v-model:value="tplForm.output_format" :options="[{ label: 'JSON', value: 'JSON' }]" />
            </n-form-item>
            <n-form-item label="启用">
              <n-switch v-model:value="tplForm.is_active" />
            </n-form-item>
            <n-form-item label="描述">
              <n-input v-model:value="tplForm.description" type="textarea" :rows="2" placeholder="模板描述..." />
            </n-form-item>
          </n-form>

          <template #footer>
            <n-space>
              <n-button @click="tplFormVisible = false">取消</n-button>
              <n-button type="primary" :loading="tplSaving" @click="saveTemplate">
                {{ tplSaving ? '保存中...' : '保存' }}
              </n-button>
            </n-space>
          </template>
        </n-drawer-content>
      </n-drawer>
    </template>

    <!-- ═══════════════ Localization Rules ═══════════════ -->
    <template v-if="activeTab === 'localization'">
      <div class="card">
        <div class="card-title">🌍 中文电商表达 → 俄语本土化映射规则</div>
        <div class="card-subtitle" style="margin-top: 4px;">Ozon 平台自动应用这些规则，确保商品信息符合俄罗斯消费者习惯</div>

        <table class="table" style="margin-top: 16px;">
          <thead>
            <tr>
              <th style="width: 180px;">中文表达</th>
              <th style="width: 40px;">类型</th>
              <th>俄语本土化策略</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, i) in localizationRules" :key="i">
              <td style="font-weight: 600; font-size: 13px;">{{ item.zh }}</td>
              <td>
                <n-tag :type="item.type === '删除' ? 'error' : 'info'" size="tiny" round>
                  {{ item.type }}
                </n-tag>
              </td>
              <td style="font-size: 13px; color: var(--text-secondary);">
                {{ item.ru || '(删除 - 不保留)' }}
              </td>
            </tr>
          </tbody>
        </table>

        <div style="margin-top: 20px; padding: 16px; border-radius: 8px; background: var(--bg-card-alt); font-size: 13px; line-height: 1.8; color: var(--text-secondary);">
          <div style="font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">💡 工作原理</div>
          <div>1. 当平台选择 <b>Ozon</b> 时，系统自动调用 <code>localization_rules.py</code></div>
          <div>2. 规则对商品输入数据中的中文字段进行替换或删除</div>
          <div>3. 处理后的数据再送入 LLM 生成最终的俄语内容</div>
          <div>4. 确保生成的俄语内容不含中国电商特有表达（如"爆款"、"网红推荐"等）</div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { NTag, NButton, NInput, NSelect, NForm, NFormItem, NSwitch, NSpace, NDrawer, NDrawerContent, NGrid, NGi, NTabs, NTab, NH2, NPagination, NProgress, NRadioGroup, NRadio, useMessage } from "naive-ui";
import { apiGet, apiPost, apiPut, apiDelete } from "../api";

const message = useMessage();
const activeTab = ref("playground");

// ── Options ─────────────────────────────────────────────────────────
const langOptions = [
  { label: "中文", value: "zh" },
  { label: "Русский", value: "ru" },
  { label: "English", value: "en" },
];

const platformOptions = [
  { label: "淘宝", value: "TB" },
  { label: "Ozon", value: "OZON" },
];

const styleOptions = [
  { label: "写实 (Realistic)", value: "realistic" },
  { label: "扁平 (Flat)", value: "flat" },
  { label: "3D", value: "3d" },
  { label: "极简 (Minimalist)", value: "minimalist" },
];

const categoryOptions = [
  { label: "TITLE", value: "TITLE" },
  { label: "PRODUCT", value: "PRODUCT" },
  { label: "IMAGE", value: "IMAGE" },
  { label: "LOCALIZATION", value: "LOCALIZATION" },
  { label: "EVAL", value: "EVAL" },
];

const activeOptions = [
  { label: "启用", value: true },
  { label: "禁用", value: false },
];

const featureOptions = [
  { label: "保温", value: "保温" },
  { label: "防漏", value: "防漏" },
  { label: "便携", value: "便携" },
  { label: "双层", value: "双层" },
  { label: "大容量", value: "大容量" },
  { label: "轻量", value: "轻量" },
  { label: "不锈钢", value: "不锈钢" },
  { label: "耐热", value: "耐热" },
  { label: "防摔", value: "防摔" },
  { label: "可定制", value: "可定制" },
];

// ── Title Optimization ──────────────────────────────────────────────
const titleLoading = ref(false);
const titleResult = ref<any>(null);
const titleForm = reactive({
  platform: "OZON",
  language: "ru",
  category: "",
  brand: "",
  material: "",
  capacity: "",
  color: "",
  feature: [] as string[],
  template_name: null as string | null,
});

const titleTemplateOptions = computed(() =>
  templates.value
    .filter((t: any) => t.platform === titleForm.platform && t.category === "TITLE")
    .map((t: any) => ({ label: t.name, value: t.name }))
);

async function runTitleOptimize() {
  if (!titleForm.brand && !titleForm.category) {
    message.warning("请至少填写品牌或品类");
    return;
  }
  titleLoading.value = true;
  titleResult.value = null;
  try {
    const data = await apiPost("/v1/title/optimize", titleForm);
    titleResult.value = data;
    message.success("标题优化完成");
  } catch (e: any) {
    message.error(e.message || "优化失败");
  } finally {
    titleLoading.value = false;
  }
}

// ── Product Optimization ────────────────────────────────────────────
const productLoading = ref(false);
const productResult = ref<any>(null);
const productForm = reactive({
  platform: "OZON",
  language: "ru",
  title: "",
  brand: "",
  description: "",
  features: [] as string[],
  template_name: null as string | null,
});

const productTemplateOptions = computed(() =>
  templates.value
    .filter((t: any) => t.platform === productForm.platform && t.category === "PRODUCT")
    .map((t: any) => ({ label: t.name, value: t.name }))
);

async function runProductOptimize() {
  if (!productForm.title) {
    message.warning("请填写商品标题");
    return;
  }
  productLoading.value = true;
  productResult.value = null;
  try {
    const data = await apiPost("/v1/product/optimize", productForm);
    productResult.value = data;
    message.success("产品信息优化完成");
  } catch (e: any) {
    message.error(e.message || "优化失败");
  } finally {
    productLoading.value = false;
  }
}

// ── Image Prompt ────────────────────────────────────────────────────
const imageLoading = ref(false);
const imageResult = ref<any>(null);
const imageForm = reactive({
  category: "",
  brand: "",
  style: "realistic",
  features: [] as string[],
  platform: "OZON",
  language: "ru",
});

async function runImagePrompt() {
  if (!imageForm.category) {
    message.warning("请填写品类");
    return;
  }
  imageLoading.value = true;
  imageResult.value = null;
  try {
    const data = await apiPost("/v1/image/prompt", imageForm);
    imageResult.value = data;
    message.success("图生图 Prompt 生成完成");
  } catch (e: any) {
    message.error(e.message || "生成失败");
  } finally {
    imageLoading.value = false;
  }
}

// ── Template CRUD ───────────────────────────────────────────────────
const templates = ref<any[]>([]);
const tplFilter = reactive({ platform: null as string | null, language: null as string | null, is_active: null as boolean | null });
const tplFormVisible = ref(false);
const tplSaving = ref(false);
const editingTemplate = ref<any>(null);
const tplForm = reactive({
  name: "",
  platform: "OZON",
  language: "ru",
  category: "TITLE" as string | null,
  version: "v1.0",
  model: "deepseek-chat",
  system_prompt: "",
  input_schema: "",
  output_schema: "",
  output_format: "JSON",
  is_active: true,
  description: "",
});

async function loadTemplates() {
  try {
    const params: Record<string, any> = { limit: 200 };
    if (tplFilter.platform) params.platform = tplFilter.platform;
    if (tplFilter.language) params.language = tplFilter.language;
    if (tplFilter.is_active !== null && tplFilter.is_active !== undefined) params.is_active = tplFilter.is_active;
    templates.value = await apiGet("/v1/prompts", params);
  } catch (e) {
    console.error("Failed to load templates", e);
  }
}

function openTemplateForm(tpl?: any) {
  editingTemplate.value = tpl || null;
  if (tpl) {
    Object.assign(tplForm, {
      name: tpl.name,
      platform: tpl.platform,
      language: tpl.language,
      category: tpl.category,
      version: tpl.version,
      model: tpl.model,
      system_prompt: tpl.system_prompt,
      input_schema: tpl.input_schema || "",
      output_schema: tpl.output_schema || "",
      output_format: tpl.output_format,
      is_active: tpl.is_active,
      description: tpl.description || "",
    });
  } else {
    Object.assign(tplForm, {
      name: "",
      platform: "OZON",
      language: "ru",
      category: "TITLE",
      version: "v1.0",
      model: "deepseek-chat",
      system_prompt: "",
      input_schema: "",
      output_schema: "",
      output_format: "JSON",
      is_active: true,
      description: "",
    });
  }
  tplFormVisible.value = true;
}

async function saveTemplate() {
  if (!tplForm.name || !tplForm.system_prompt) {
    message.warning("名称和 System Prompt 为必填项");
    return;
  }
  tplSaving.value = true;
  try {
    if (editingTemplate.value) {
      await apiPut(`/v1/prompts/${editingTemplate.value.id}`, tplForm);
      message.success("模板已更新");
    } else {
      await apiPost("/v1/prompts", tplForm);
      message.success("模板已创建");
    }
    tplFormVisible.value = false;
    await loadTemplates();
  } catch (e: any) {
    message.error(e.message || "保存失败");
  } finally {
    tplSaving.value = false;
  }
}

async function deleteTemplate(tpl: any) {
  if (!confirm(`确认删除模板「${tpl.name}」？`)) return;
  try {
    await apiDelete(`/v1/prompts/${tpl.id}`);
    message.success("已删除");
    await loadTemplates();
  } catch (e: any) {
    message.error(e.message || "删除失败");
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => message.success("已复制"));
}

// ── Localization Rules ──────────────────────────────────────────────
const localizationRules = [
  { zh: "爆款", type: "删除", ru: "" },
  { zh: "网红推荐", type: "删除", ru: "" },
  { zh: "网红", type: "删除", ru: "" },
  { zh: "爆款热卖", type: "删除", ru: "" },
  { zh: "居家必备", type: "替换", ru: "Подходит для ежедневного использования" },
  { zh: "厨房", type: "替换", ru: "для кухни / для дома / для семьи" },
  { zh: "厨房用品", type: "替换", ru: "для кухни и дома" },
  { zh: "家庭", type: "替换", ru: "для семьи" },
  { zh: "家庭必备", type: "替换", ru: "подходит для дома и семьи" },
  { zh: "冬季", type: "替换", ru: "зимний" },
  { zh: "保暖", type: "替换", ru: "сохраняет тепло" },
  { zh: "便携", type: "替换", ru: "портативный" },
  { zh: "防漏", type: "替换", ru: "герметичная крышка" },
  { zh: "大容量", type: "替换", ru: "большая вместимость" },
  { zh: "不锈钢", type: "替换", ru: "из нержавеющей стали" },
  { zh: "双层", type: "替换", ru: "двойные стенки" },
  { zh: "尺寸", type: "替换", ru: "按俄罗斯标准单位表达" },
  { zh: "温度", type: "替换", ru: "使用俄语本地表达" },
];

// ── Init ────────────────────────────────────────────────────────────
onMounted(() => {
  loadTemplates();
});
</script>

<style scoped>
.result-box {
  padding: 12px 16px;
  border-radius: 8px;
  background: var(--bg-card-alt, rgba(99, 102, 241, 0.06));
  border: 1px solid rgba(99, 102, 241, 0.12);
}

.result-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.result-text {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;
}

.code-block {
  background: var(--bg-sidebar, #1a1a2e);
  color: #e0e0e0;
  padding: 12px;
  border-radius: 6px;
  font-family: monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow-x: auto;
  white-space: pre;
}
</style>