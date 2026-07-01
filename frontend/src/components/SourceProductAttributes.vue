<template>
  <div class="source-attributes">
    <n-spin :show="loading">
      <n-empty v-if="!product && !loading" description="暂无采集数据" />

      <template v-if="product">
        <!-- 1. 基础商品信息 -->
        <n-collapse default-expanded-names="basic">
          <n-collapse-item title="📦 基础商品信息" name="basic">
            <div class="attr-section">
              <div class="attr-row">
                <span class="attr-label">名称</span>
                <span class="attr-value attr-value--title">{{ product.title || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">品牌</span>
                <span class="attr-value">
                  <n-tag v-if="product.brand" size="small" :bordered="false" type="info">{{ product.brand }}</n-tag>
                  <span v-else>-</span>
                </span>
              </div>
              <div class="attr-row">
                <span class="attr-label">分类</span>
                <span class="attr-value attr-value--breadcrumb">{{ product.category || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">卖家</span>
                <span class="attr-value">{{ product.sellerName || product.seller_name || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">商品ID</span>
                <span class="attr-value attr-value--mono">{{ product.sourceId || product.source_id || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">来源链接</span>
                <span class="attr-value">
                  <n-button
                    v-if="product.sourceUrl || product.source_url"
                    text
                    type="primary"
                    size="small"
                    tag="a"
                    :href="product.sourceUrl || product.source_url"
                    target="_blank"
                  >
                    查看原链接 ↗
                  </n-button>
                  <span v-else>-</span>
                </span>
              </div>
            </div>
          </n-collapse-item>

          <!-- 2. 价格与促销 -->
          <n-collapse-item title="💰 价格与促销" name="price">
            <div class="attr-section">
              <div class="attr-row">
                <span class="attr-label">当前价格</span>
                <span class="attr-value attr-value--price">{{ currencySymbol }}{{ product.price || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">原价</span>
                <span class="attr-value attr-value--old-price">
                  <template v-if="product.oldPrice || product.old_price">
                    <span class="strikethrough">{{ currencySymbol }}{{ product.oldPrice || product.old_price }}</span>
                  </template>
                  <template v-else>-</template>
                </span>
              </div>
              <div class="attr-row">
                <span class="attr-label">折扣</span>
                <span class="attr-value">
                  <n-tag v-if="product.discount" size="small" type="error" :bordered="false">
                    {{ product.discount }}
                  </n-tag>
                  <span v-else-if="discountPercent" class="discount-badge">
                    -{{ discountPercent }}%
                  </span>
                  <span v-else>-</span>
                </span>
              </div>
              <div class="attr-row">
                <span class="attr-label">货币</span>
                <span class="attr-value">{{ product.platform === '1688' ? (product.currency || 'CNY') : (product.currency || 'RUB') }}</span>
              </div>
            </div>
          </n-collapse-item>

          <!-- 3. 物理规格 -->
          <n-collapse-item title="📏 物理规格" name="physical">
            <div class="attr-section">
              <div v-if="hasPhysicalSpecs">
                <div class="attr-row">
                  <span class="attr-label">重量</span>
                  <span class="attr-value">{{ physicalSpec.weight_g ? `${physicalSpec.weight_g} g` : '-' }}</span>
                </div>
                <div class="attr-row">
                  <span class="attr-label">长</span>
                  <span class="attr-value">{{ physicalSpec.depth_mm ? `${physicalSpec.depth_mm} mm` : '-' }}</span>
                </div>
                <div class="attr-row">
                  <span class="attr-label">宽</span>
                  <span class="attr-value">{{ physicalSpec.width_mm ? `${physicalSpec.width_mm} mm` : '-' }}</span>
                </div>
                <div class="attr-row">
                  <span class="attr-label">高</span>
                  <span class="attr-value">{{ physicalSpec.height_mm ? `${physicalSpec.height_mm} mm` : '-' }}</span>
                </div>
              </div>
              <div v-else class="attr-section--empty">
                暂无物理规格数据
              </div>
            </div>
          </n-collapse-item>

          <!-- 4. 评价与市场 -->
          <n-collapse-item title="⭐ 评价与市场" name="reviews">
            <div class="attr-section">
              <div class="attr-row">
                <span class="attr-label">评分</span>
                <span class="attr-value">
                  <template v-if="product.rating">
                    <span class="rating-display">
                      <span class="rating-stars">⭐ {{ product.rating.toFixed(1) }}</span>
                      <n-progress
                        type="line"
                        :percentage="(product.rating / 5) * 100"
                        :show-indicator="false"
                        style="width: 100px; height: 6px;"
                        :status="product.rating >= 4 ? 'success' : product.rating >= 3 ? 'warning' : 'error'"
                      />
                    </span>
                  </template>
                  <span v-else>-</span>
                </span>
              </div>
              <div class="attr-row">
                <span class="attr-label">评论数</span>
                <span class="attr-value">{{ product.reviewCount || product.review_count || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">库存状态</span>
                <span class="attr-value">
                  <n-tag v-if="product.stock" size="small" :bordered="false" :type="product.stock === 'in_stock' ? 'success' : 'warning'">
                    {{ stockLabel }}
                  </n-tag>
                  <span v-else>-</span>
                </span>
              </div>
            </div>
          </n-collapse-item>

          <!-- 5. 媒体资源 -->
          <n-collapse-item title="🖼️ 媒体资源" name="media">
            <div class="attr-section">
              <!-- Images Grid -->
              <div class="media-group">
                <span class="attr-label">商品图片 ({{ imageList.length }})</span>
                <div class="image-grid" v-if="imageList.length > 0">
                  <div
                    v-for="(img, idx) in imageList"
                    :key="idx"
                    class="image-cell"
                    @click="previewImage(idx)"
                  >
                    <img
                      :src="img"
                      :alt="`图片 ${idx + 1}`"
                      @error="onImgError"
                      loading="lazy"
                    />
                    <div class="image-index">{{ idx + 1 }}</div>
                    <div v-if="idx === 0" class="image-badge">主图</div>
                  </div>
                </div>
                <div v-else class="attr-section--empty">暂无图片</div>
              </div>

              <!-- Videos -->
              <div v-if="videoList.length > 0" class="media-group" style="margin-top: 12px;">
                <span class="attr-label">视频 ({{ videoList.length }})</span>
                <div class="video-list">
                  <div v-for="(vid, idx) in videoList" :key="idx" class="video-cell">
                    <n-button size="small" tertiary type="info">
                      🎬 视频 {{ idx + 1 }}
                    </n-button>
                  </div>
                </div>
              </div>
            </div>
          </n-collapse-item>

          <!-- 6. SKU 变体 -->
          <n-collapse-item title="🏷️ SKU 变体" name="variants" v-if="hasVariants">
            <div class="attr-section">
              <n-data-table
                :columns="variantColumns"
                :data="variantList"
                :bordered="false"
                :single-line="false"
                size="small"
              />
            </div>
          </n-collapse-item>

          <!-- 7. 通用属性 -->
          <n-collapse-item title="📝 通用属性" name="generic" v-if="genericAttributes.length > 0">
            <div class="attr-section">
              <div class="generic-table">
                <div
                  v-for="(attr, idx) in genericAttributes"
                  :key="idx"
                  class="attr-row"
                >
                  <span class="attr-label">{{ attr.name }}</span>
                  <span class="attr-value">{{ attr.value }}</span>
                </div>
              </div>
            </div>
          </n-collapse-item>

          <!-- 8. Ozon 内部数据 -->
          <n-collapse-item title="🏪 Ozon 内部数据" name="ozon_internal">
            <div class="attr-section">
              <div class="attr-row">
                <span class="attr-label">分类ID</span>
                <span class="attr-value attr-value--mono">{{ product.ozonCategoryId || product.ozon_category_id || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">类型ID</span>
                <span class="attr-value attr-value--mono">{{ product.ozonTypeId || product.ozon_type_id || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">商品ID</span>
                <span class="attr-value attr-value--mono">{{ product.product_id || product.sourceId || '-' }}</span>
              </div>
              <div class="attr-row">
                <span class="attr-label">采集时间</span>
                <span class="attr-value">{{ scrapedAtDisplay }}</span>
              </div>
            </div>
          </n-collapse-item>
        </n-collapse>
      </template>
    </n-spin>

    <!-- Image Preview Modal -->
    <n-modal v-model:show="showImagePreview" preset="card" style="width: 600px;" title="图片预览">
      <div class="preview-container">
        <img
          v-if="previewImageUrl"
          :src="previewImageUrl"
          style="max-width: 100%; max-height: 400px; object-fit: contain;"
        />
      </div>
      <div style="text-align: center; margin-top: 8px; color: var(--text-secondary); font-size: 12px;">
        {{ previewImageIndex + 1 }} / {{ imageList.length }}
      </div>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, h } from 'vue';
import { NTag, NButton } from 'naive-ui';
import type { DataTableColumns } from 'naive-ui';

interface Props {
  product: any;
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

// --- Image preview ---
const showImagePreview = ref(false);
const previewImageUrl = ref('');
const previewImageIndex = ref(0);

function previewImage(idx: number) {
  previewImageIndex.value = idx;
  previewImageUrl.value = imageList.value[idx];
  showImagePreview.value = true;
}

function onImgError(e: Event) {
  (e.target as HTMLImageElement).style.display = 'none';
}

// --- Computed ---
const product = computed(() => props.product);

const imageList = computed((): string[] => {
  const p = product.value;
  if (!p) return [];
  const images = p.images || p.source_images;
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return images ? [images] : [];
    }
  }
  return [];
});

const videoList = computed((): string[] => {
  const p = product.value;
  if (!p) return [];
  return p.videoUrls || p.video_urls || [];
});

const physicalSpec = computed(() => {
  const p = product.value;
  if (!p) return {};
  // Try spec_list first
  const specList = p.spec_list || p.specList;
  if (Array.isArray(specList) && specList.length > 0) {
    return specList[0];
  }
  // Fallback to top-level fields
  return {
    weight_g: p.weight,
    depth_mm: p.depth,
    height_mm: p.height,
    width_mm: p.width,
  };
});

const hasPhysicalSpecs = computed(() => {
  const spec = physicalSpec.value;
  return spec.weight_g || spec.depth_mm || spec.width_mm || spec.height_mm;
});

const discountPercent = computed(() => {
  const p = product.value;
  if (!p) return 0;
  const price = parseFloat(p.price);
  const oldPrice = parseFloat(p.oldPrice || p.old_price);
  if (oldPrice > 0 && price > 0 && oldPrice > price) {
    return Math.round(((oldPrice - price) / oldPrice) * 100);
  }
  return 0;
});

const CURRENCY_MAP: Record<string, string> = { RUB: '₽', CNY: '¥', USD: '$', EUR: '€' };

const currencySymbol = computed(() => {
  const p = product.value;
  if (!p) return '₽';
  const cur = (p.currency || '').toUpperCase();
  return CURRENCY_MAP[cur] || '₽';
});

const stockLabel = computed(() => {
  const p = product.value;
  if (!p?.stock) return '';
  const map: Record<string, string> = {
    in_stock: '有货',
    out_of_stock: '缺货',
    pre_order: '预售',
  };
  return map[p.stock] || p.stock;
});

const scrapedAtDisplay = computed(() => {
  const p = product.value;
  if (!p?.scrapedAt && !p?.scraped_at) return '-';
  const date = new Date(p.scrapedAt || p.scraped_at);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
});

const genericAttributes = computed(() => {
  const p = product.value;
  if (!p) return [];
  const attrs = p.attributes || [];
  if (Array.isArray(attrs)) return attrs;
  // Handle JSON string
  if (typeof attrs === 'string') {
    try {
      const parsed = JSON.parse(attrs);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
});

const hasVariants = computed(() => {
  return variantList.value.length > 0;
});

const variantList = computed(() => {
  const p = product.value;
  if (!p) return [];
  const specList = p.spec_list || p.specList;
  if (Array.isArray(specList) && specList.length > 0) {
    return specList;
  }
  const skuList = p.sku_list || p.skuList;
  if (Array.isArray(skuList) && skuList.length > 0) {
    return skuList;
  }
  return [];
});

const variantColumns: DataTableColumns<any> = [
  {
    title: '颜色',
    key: 'color',
    width: 100,
    render: (row) => row.color || '-',
  },
  {
    title: '尺码',
    key: 'size',
    width: 80,
    render: (row) => row.size || '-',
  },
  {
    title: '重量(g)',
    key: 'weight_g',
    width: 80,
    render: (row) => row.weight_g || '-',
  },
  {
    title: '长(mm)',
    key: 'depth_mm',
    width: 80,
    render: (row) => row.depth_mm || '-',
  },
  {
    title: '宽(mm)',
    key: 'width_mm',
    width: 80,
    render: (row) => row.width_mm || '-',
  },
  {
    title: '高(mm)',
    key: 'height_mm',
    width: 80,
    render: (row) => row.height_mm || '-',
  },
  {
    title: 'SKU',
    key: 'sku',
    width: 120,
    render: (row) => row.sku || row.offer_id || '-',
  },
  {
    title: '条形码',
    key: 'barcode',
    width: 120,
    render: (row) => row.barcode || '-',
  },
];
</script>

<style scoped>
.source-attributes {
  font-size: 13px;
}

.attr-section {
  padding: 4px 0;
}

.attr-section--empty {
  color: var(--text-secondary);
  font-size: 12px;
  padding: 8px 0;
}

.attr-row {
  display: flex;
  align-items: flex-start;
  padding: 6px 0;
  border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.04));
  gap: 12px;
}

.attr-row:last-child {
  border-bottom: none;
}

.attr-label {
  flex-shrink: 0;
  width: 80px;
  color: var(--text-secondary);
  font-size: 12px;
  padding-top: 2px;
}

.attr-value {
  flex: 1;
  word-break: break-all;
}

.attr-value--title {
  font-weight: 500;
  line-height: 1.4;
}

.attr-value--breadcrumb {
  color: var(--text-secondary);
  font-size: 12px;
}

.attr-value--mono {
  font-family: monospace;
  font-size: 12px;
}

.attr-value--price {
  font-weight: 600;
  color: #f5a623;
  font-size: 15px;
}

.attr-value--old-price .strikethrough {
  text-decoration: line-through;
  color: var(--text-secondary);
}

.discount-badge {
  display: inline-block;
  background: rgba(220, 53, 69, 0.15);
  color: #e74c3c;
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.rating-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rating-stars {
  font-size: 13px;
}

.media-group {
  margin-bottom: 8px;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.image-cell {
  width: 100%;
  aspect-ratio: 4 / 5;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-color, rgba(255, 255, 255, 0.08));
  position: relative;
  cursor: pointer;
  transition: border-color 0.2s;
}

.image-cell:hover {
  border-color: rgba(64, 158, 255, 0.5);
}

.image-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-index {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 10px;
  text-align: center;
  padding: 2px 0;
}

.image-badge {
  position: absolute;
  top: 4px;
  left: 4px;
  background: rgba(64, 158, 255, 0.85);
  color: #fff;
  font-size: 9px;
  padding: 1px 5px;
  border-radius: 3px;
}

.video-list {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.video-cell {
  display: flex;
  align-items: center;
}

.generic-table {
  display: flex;
  flex-direction: column;
}

.preview-container {
  text-align: center;
  background: #1a1a2e;
  border-radius: 8px;
  padding: 12px;
}
</style>
