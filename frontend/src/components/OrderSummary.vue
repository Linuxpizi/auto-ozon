<template>
  <div>
    <!-- 图片悬浮放大浮层 -->
    <teleport to="body">
      <div v-if="hoverImage" style="position: fixed; z-index: 9999; pointer-events: none; padding: 8px; background: #fff; border-radius: 8px; box-shadow: 0 4px 24px rgba(0,0,0,0.25);"
        :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 'px' }">
        <img :src="hoverImage" style="width: 420px; height: 420px; object-fit: contain; border-radius: 6px;" />
      </div>
    </teleport>
    <table class="table" style="font-size: 13px;">
      <thead>
        <tr>
          <th>图片 / 货件号 / SKU</th>
          <th>订单号</th>
          <th>创建日期</th>
          <th>状态</th>
          <th>取消原因</th>
          <th>取消时间</th>
          <th>必须发货 / 商品名称</th>
          <th>运单号 / 数量 / 成交价</th>
          <th>店铺</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="order in orders" :key="order.id">
          <td>
            <div style="display: flex; align-items: center; gap: 6px;">
              <img v-if="order.image_url" :src="order.image_url"
                style="width: 64px; height: 64px; object-fit: cover; border-radius: 6px; flex-shrink: 0; cursor: pointer;" alt=""
                @mouseenter="showHoverImage($event, order.image_url)"
                @mouseleave="hideHoverImage" />
              <a v-if="getProductUrl(order)"
                :href="getProductUrl(order)!"
                target="_blank" rel="noopener noreferrer"
                style="min-width: 0; color: var(--accent, #1677ff); text-decoration: none; display: block;"
                @mouseenter="$event.currentTarget.style.textDecoration='underline'"
                @mouseleave="$event.currentTarget.style.textDecoration='none'">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: underline; text-underline-offset: 2px;">{{
                  order.shipment_number }}</div>
                <div style="font-size: 12px; color: var(--accent, #1677ff); text-decoration: inherit;">{{ order.offer_id || order.sku }}</div>
              </a>
              <div v-else style="min-width: 0;">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{
                  order.shipment_number }}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">{{ order.offer_id || order.sku }}</div>
              </div>
            </div>
          </td>
          <td style="white-space: nowrap;">{{ order.order_number }}</td>
          <td style="white-space: nowrap; font-size: 12px; color: var(--text-secondary);">{{ formatDateTime(order.in_process_at) }}</td>
          <td>
            <n-tag :type="statusType(order.status)" size="small" round>
              {{ statusLabel(order.status) }}
            </n-tag>
          </td>
          <td style="font-size: 12px; max-width: 200px; word-break: break-all;">
            <span v-if="order.status === 'cancelled'">
              <span style="color: var(--danger); font-weight: 500;">{{ cancelInitiatorLabel(order) }}</span>
              <span v-if="order.cancellation_reason_message"> — {{ order.cancellation_reason_message }}</span>
            </span>
            <span v-else style="color: var(--text-secondary);">-</span>
          </td>
          <td style="font-size: 12px; color: var(--text-secondary); white-space: nowrap;">
            <span v-if="order.cancelled_at">{{ formatDateTime(order.cancelled_at) }}</span>
            <span v-else>-</span>
          </td>
          <td>
            <div style="min-width: 0;">
              <div v-if="order.must_ship_by" style="font-size: 12px; color: var(--danger); white-space: nowrap;">
                截止: {{ formatDate(order.must_ship_by) }}
              </div>
              <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">{{ order.product_name }}
              </div>
            </div>
          </td>
          <td>
            <div>{{ order.tracking_number || '-' }}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">{{ totalQuantity(order) }}件 / {{ currencySymbol(order) }}{{ displayPrice(order).toFixed(2) }}</div>
          </td>
          <td>
            <div>{{ order.store_name }}</div>
            <div v-if="order.express_delivery" style="font-size: 12px; color: var(--accent); font-weight: 500;">极速</div>
          </td>
          <td>
            <n-space :size="6">
              <n-button v-if="hasAction(order, 'ship')" type="warning" size="small"
                @click="emitShip(order)">备货</n-button>
              <n-button v-else-if="hasAction(order, 'cancel')" type="error" size="small" @click="emitCancel(order)">取消</n-button>
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
import { NTag, NButton, NSpace } from "naive-ui";
import type { OrderItem } from "../store";

const hoverImage = ref("");
const hoverPos = ref({ x: 0, y: 0 });

function showHoverImage(e: MouseEvent, url: string) {
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  // Position to the right of the image, or to the left if not enough space
  let x = rect.right + 12;
  if (x + 440 > window.innerWidth) {
    x = rect.left - 444;
  }
  let y = rect.top - 80;
  if (y < 8) y = 8;
  hoverPos.value = { x, y };
  hoverImage.value = url;
}

function hideHoverImage() {
  hoverImage.value = "";
}

function getProductUrl(order: OrderItem): string | null {
  // Ozon consumer-facing product page
  // https://www.ozon.ru/product/{product_id}/
  const OZON_PRODUCT_BASE = "https://www.ozon.ru/product";

  // Try order.product_id first
  if (order.product_id) {
    return `${OZON_PRODUCT_BASE}/${order.product_id}/`;
  }
  // Fallback: order.sku IS the Ozon product_id
  if (order.sku && /^\d+$/.test(order.sku)) {
    return `${OZON_PRODUCT_BASE}/${order.sku}/`;
  }
  // Fallback: extract from products_json
  try {
    const products = JSON.parse(order.products_json || "[]");
    if (products.length > 0) {
      const pid = products[0].product_id || products[0].sku;
      if (pid && /^\d+$/.test(String(pid))) {
        return `${OZON_PRODUCT_BASE}/${pid}/`;
      }
    }
  } catch {}
  return null;
}


defineProps({
  orders: {
    type: Array as PropType<OrderItem[]>,
    default: () => [],
  },
});

const emit = defineEmits<{
  "edit-order": [order: OrderItem];
  "delete-order": [id: number];
  "ship-order": [order: OrderItem];
  "cancel-order": [order: OrderItem];
}>();

const statusMap: Record<string, { label: string; type: "success" | "warning" | "error" | "info" | "default" }> = {
  awaiting_registration: { label: "等待登记", type: "default" },
  acceptance_in_progress: { label: "接收中", type: "info" },
  awaiting_approve: { label: "等待确认", type: "default" },
  awaiting_packaging: { label: "待包装", type: "warning" },
  awaiting_deliver: { label: "待发货", type: "info" },
  arbitration: { label: "仲裁", type: "error" },
  client_arbitration: { label: "客户配送仲裁", type: "error" },
  delivering: { label: "配送中", type: "info" },
  driver_pickup: { label: "司机正在送货", type: "info" },
  cancelled: { label: "已取消", type: "error" },
  not_accepted: { label: "未接收", type: "error" },
};

function statusLabel(status: string) {
  return statusMap[status]?.label || status;
}
function statusType(status: string) {
  return statusMap[status]?.type || "default";
}

function cancelInitiatorLabel(order: OrderItem): string {
  const map: Record<string, string> = {
    seller: "卖家取消",
    buyer: "买家取消",
    system: "系统取消",
    "Продавец": "卖家取消",
    "Покупатель": "买家取消",
    "Ozon": "平台取消",
  };
  return map[order.cancellation_initiator] || order.cancellation_initiator || "已取消";
}

function hasAction(order: OrderItem, action: string): boolean {
  if (action === "ship") {
    return order.status === "awaiting_packaging";
  }
  try {
    const actions = JSON.parse(order.available_actions || "[]");
    return Array.isArray(actions) && actions.includes(action);
  } catch {
    return false;
  }
}

function totalQuantity(order: OrderItem): number {
  try {
    const products = JSON.parse(order.products_json || "[]");
    if (products.length > 0) {
      return products.reduce((sum: number, p: any) => sum + (p.quantity || 1), 0);
    }
  } catch {}
  return order.quantity;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  USD: "$",
  EUR: "€",
  CNY: "¥",
  KZT: "₸",
  BYN: "Br",
  UZS: "so'm",
};

function currencySymbol(order: OrderItem): string {
  const code = (order.currency_code || "").toUpperCase();
  return CURRENCY_SYMBOLS[code] || code + " ";
}

function displayPrice(order: OrderItem): number {
  // customer_price = total from Ozon financial_data (already includes qty)
  if (order.customer_price > 0) return order.customer_price;
  // unit_price = per-unit, multiply by quantity for total
  return order.unit_price * order.quantity;
}

function formatDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function formatDateTime(d: string | null) {
  if (!d) return "-";
  const dt = new Date(d);
  return dt.toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" });
}

function emitEdit(order: OrderItem) {
  emit("edit-order", order);
}
function emitDelete(id: number) {
  if (!confirm("确认删除该订单吗？")) return;
  emit("delete-order", id);
}
function emitShip(order: OrderItem) {
  emit("ship-order", order);
}
function emitCancel(order: OrderItem) {
  emit("cancel-order", order);
}
</script>
