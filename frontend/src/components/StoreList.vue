<template>
  <div>
    <table class="table" style="font-size: 13px;">
      <thead>
        <tr>
          <th>店铺名称</th>
          <th>Client ID</th>
          <th>API Key</th>
          <th>卖家评级</th>
          <th>错误指数</th>
          <th>仓库 ID</th>
          <th>仓库状态</th>
          <th>状态</th>
          <th>备注</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="store in stores" :key="store.id">
          <td>{{ store.name }}</td>
          <td style="max-width: 100px; overflow: hidden; text-overflow: ellipsis;">{{ store.client_id }}</td>
          <td>
            <n-tooltip trigger="hover">
              <template #trigger>
                <span style="font-family: monospace; letter-spacing: 1px;">{{ maskKey(store.api_key) }}</span>
              </template>
              点击查看完整 Key 时需通过编辑弹窗
            </n-tooltip>
          </td>
          <td>
            <n-popover trigger="click" v-if="parseRating(store.seller_rating)">
              <template #trigger>
                <n-button text type="info" size="small" style="font-weight: 600; font-size: 13px;">
                  {{ parseRating(store.seller_rating)?.company_name || '--' }}
                </n-button>
              </template>
              <div style="min-width: 280px; max-height: 400px; overflow-y: auto;">
                <div style="margin-bottom: 8px;"><b>公司名：</b>{{ parseRating(store.seller_rating)?.company_name }}</div>
                <div style="margin-bottom: 8px;"><b>币种：</b>{{ parseRating(store.seller_rating)?.currency }}</div>
                <table style="font-size: 12px; width: 100%; border-collapse: collapse;">
                  <thead>
                    <tr style="border-bottom: 1px solid #eee;">
                      <th style="text-align: left; padding: 4px;">指标</th>
                      <th style="text-align: left; padding: 4px;">当前值</th>
                      <th style="text-align: left; padding: 4px;">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(r, i) in parseRating(store.seller_rating)?.ratings" :key="i" style="border-bottom: 1px solid #f5f5f5;">
                      <td style="padding: 4px; max-width: 180px;">{{ translateRating(r.rating, r.name) }}</td>
                      <td style="padding: 4px;">
                        <template v-if="r.current_value">
                          <n-tag v-if="r.status === 'OK'" type="success" size="small" round>{{ r.current_value.formatted }}</n-tag>
                          <n-tag v-else-if="r.status === 'WARNING'" type="warning" size="small" round>{{ r.current_value.formatted }}</n-tag>
                          <n-tag v-else-if="r.status === 'CRITICAL'" type="error" size="small" round>{{ r.current_value.formatted }}</n-tag>
                          <span v-else>{{ r.current_value.formatted || r.current_value.value }}</span>
                        </template>
                        <span v-else style="color: #999;">--</span>
                      </td>
                      <td style="padding: 4px;">
                        <n-tag v-if="r.status === 'OK'" type="success" size="small" round>正常</n-tag>
                        <n-tag v-else-if="r.status === 'WARNING'" type="warning" size="small" round>警告</n-tag>
                        <n-tag v-else-if="r.status === 'CRITICAL'" type="error" size="small" round>危险</n-tag>
                        <n-tag v-else size="small" round>{{ STATUS_MAP[r.status] || r.status }}</n-tag>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </n-popover>
            <span v-else style="color: var(--text-muted);">--</span>
          </td>
          <td>
            <n-popover trigger="click" v-if="parseErrorIndex(store.fbs_error_index)">
              <template #trigger>
                <n-button text type="warning" size="small" style="font-weight: 600; font-size: 13px;">
                  {{ parseErrorIndex(store.fbs_error_index)?.index ?? '--' }}
                </n-button>
              </template>
              <div style="min-width: 300px; max-height: 400px; overflow-y: auto;">
                <div style="margin-bottom: 6px; font-size: 13px; color: var(--text-secondary);">
                  币种：{{ parseErrorIndex(store.fbs_error_index)?.currency_code }}
                </div>
                <div style="margin-bottom: 6px; font-size: 13px; color: var(--text-secondary);">
                  统计周期：{{ parseErrorIndex(store.fbs_error_index)?.period_from }} ~ {{ parseErrorIndex(store.fbs_error_index)?.period_to }}
                </div>
                <div style="margin-bottom: 8px; font-size: 13px; color: var(--text-secondary);">
                  处理费用合计：{{ parseErrorIndex(store.fbs_error_index)?.processing_costs_sum }}
                </div>
                <table style="font-size: 12px; width: 100%; border-collapse: collapse;" v-if="(parseErrorIndex(store.fbs_error_index)?.defects || []).length">
                  <thead>
                    <tr style="border-bottom: 1px solid #eee;">
                      <th style="text-align: left; padding: 4px;">日期</th>
                      <th style="text-align: right; padding: 4px;">当日指数</th>
                      <th style="text-align: right; padding: 4px;">当日费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(d, i) in parseErrorIndex(store.fbs_error_index)?.defects" :key="i" style="border-bottom: 1px solid #f5f5f5;">
                      <td style="padding: 4px;">{{ d.date }}</td>
                      <td style="padding: 4px; text-align: right;">
                        <n-tag :type="d.index_by_date > 5 ? 'error' : d.index_by_date > 2 ? 'warning' : 'success'" size="small" round>
                          {{ d.index_by_date }}
                        </n-tag>
                      </td>
                      <td style="padding: 4px; text-align: right;">{{ d.processing_costs_sum_by_date }}</td>
                    </tr>
                  </tbody>
                </table>
                <div v-else style="font-size: 12px; color: var(--text-muted); padding: 4px 0;">暂无缺陷数据</div>
              </div>
            </n-popover>
            <span v-else style="color: var(--text-muted);">--</span>
          </td>
          <td>{{ store.warehouse_id }}</td>
          <td>
            <n-tag :type="store.warehouse_status === 'deleted' ? 'error' : 'success'" size="small" round>
              {{ store.warehouse_status === 'deleted' ? '已删除' : '有效' }}
            </n-tag>
          </td>
          <td>
            <n-tag :type="store.status === 'active' ? 'success' : 'default'" size="small" round>
              {{ store.status === 'active' ? '有效' : '停用' }}
            </n-tag>
          </td>
          <td style="max-width: 120px; overflow: hidden; text-overflow: ellipsis;">{{ store.notes }}</td>
          <td>
            <n-space :size="6">
              <n-button size="small" type="primary" :loading="syncingId === store.id" @click="emitSync(store.id)">同步</n-button>
              <n-button size="small" @click="emitEdit(store)">编辑</n-button>
              <n-button size="small" type="error" @click="emitDelete(store.id)">删除</n-button>
            </n-space>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { PropType } from "vue";
import { NTag, NTooltip, NButton, NSpace, NPopover } from "naive-ui";
import type { StoreItem } from "../store";

defineProps({
  stores: {
    type: Array as PropType<StoreItem[]>,
    default: () => [],
  },
});

const syncingId = ref<number | null>(null);
const emit = defineEmits<{
  "edit-store": [store: StoreItem];
  "delete-store": [id: number];
  "sync-store": [id: number, done: () => void];
}>();

function emitSync(id: number) {
  syncingId.value = id;
  emit("sync-store", id, () => { syncingId.value = null; });
}

function maskKey(key: string): string {
  if (!key) return "";
  if (key.length <= 8) return "*".repeat(key.length);
  return key.slice(0, 4) + "****" + key.slice(-4);
}

const RATING_NAME_MAP: Record<string, string> = {
  rating_delivery_complaints_fbo: "FBO 投诉率",
  rating_delivery_complaints_fbs: "FBS 投诉率",
  rating_delivery_complaints_rfbs_sd: "rFBS 投诉率",
  rating_price_green: "价格指数 - 绿色区间占比",
  rating_price_yellow: "价格指数 - 黄色区间占比",
  rating_price_red: "价格指数 - 红色区间占比",
  rating_price_super: "价格指数 - 超值区间占比",
  rating_review_avg_score_total: "商品评分",
  rating_shipment_delay_cb: "发货延迟率 (global)",
  rating_general_indicator_fbs_rfbs: "FBS/rFBS 综合评级",
};

function translateRating(ratingKey: string, fallbackName: string): string {
  return RATING_NAME_MAP[ratingKey] || fallbackName;
}

const STATUS_MAP: Record<string, string> = {
  OK: "正常",
  WARNING: "警告",
  CRITICAL: "危险",
  UNKNOWN: "未知",
};

function parseErrorIndex(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function parseRating(raw: string | null | undefined): Record<string, any> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function emitEdit(store: StoreItem) {
  emit("edit-store", store);
}
function emitDelete(id: number) {
  if (!confirm("确认删除该店铺吗？此操作不可恢复。")) return;
  emit("delete-store", id);
}
</script>
