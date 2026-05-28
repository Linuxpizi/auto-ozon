import { defineStore } from "pinia";
import { ref } from "vue";

export interface DashboardSummary {
  total_orders: number;
  quality_check_orders: number;
  real_orders: number;
  total_gmv: number;
  quality_check_gmv: number;
  real_gmv: number;
}

export interface StoreItem {
  id: number;
  account_name: string;
  name: string;
  client_id: string;
  api_key: string;
  warehouse_id: string;
  warehouse_status: string;
  type_id: string;
  status: string;
  listing_status: string;
  contract_currency: string;
  vat_rate: number;
  auto_ad: boolean;
  auto_archive: boolean;
  auto_delete: boolean;
  notes: string;
}

export interface OrderItem {
  id: number;
  order_number: string;
  store_id: number;
  store_name: string;
  account_name: string;
  is_quality_check: boolean;
  gmv: number;
  status: string;
  shipment_number: string;
  sku: string;
  product_name: string;
  image_url: string;
  tracking_number: string;
  quantity: number;
  unit_price: number;
  must_ship_by: string | null;
  express_delivery: boolean;
  created_at: string;
  updated_at: string;
}

export const useAppStore = defineStore("app", () => {
  // Data
  const stores = ref<StoreItem[]>([]);
  const orders = ref<OrderItem[]>([]);
  const dashboard = ref<DashboardSummary>({
    total_orders: 0,
    quality_check_orders: 0,
    real_orders: 0,
    total_gmv: 0,
    quality_check_gmv: 0,
    real_gmv: 0,
  });

  // Pagination
  const storePage = ref(1);
  const storeTotal = ref(0);
  const storePageSize = ref(10);
  const orderPage = ref(1);
  const orderTotal = ref(0);
  const orderPageSize = ref(20);

  // Fetch actions
  async function fetchDashboard() {
    try {
      const res = await fetch("http://localhost:8000/api/dashboard/summary");
      const data = await res.json();
      Object.assign(dashboard.value, data);
    } catch (e) {
      console.error("fetchDashboard failed", e);
    }
  }

  async function fetchStores(params?: {
    skip?: number;
    limit?: number;
    keyword?: string;
  }) {
    try {
      const q = new URLSearchParams();
      const skip = params?.skip ?? (storePage.value - 1) * storePageSize.value;
      const limit = params?.limit ?? storePageSize.value;
      q.set("skip", String(skip));
      q.set("limit", String(limit));
      if (params?.keyword) q.set("keyword", params.keyword);

      const [listRes, countRes] = await Promise.all([
        fetch(`http://localhost:8000/api/stores?${q}`),
        fetch(`http://localhost:8000/api/stores/count?${params?.keyword ? `keyword=${encodeURIComponent(params.keyword)}` : ""}`),
      ]);
      stores.value = await listRes.json();
      const cnt = await countRes.json();
      storeTotal.value = cnt.count;
    } catch (e) {
      console.error("fetchStores failed", e);
    }
  }

  async function fetchOrders(params?: {
    skip?: number;
    limit?: number;
    store_id?: number;
    status?: string;
    keyword?: string;
  }) {
    try {
      const q = new URLSearchParams();
      const skip = params?.skip ?? (orderPage.value - 1) * orderPageSize.value;
      const limit = params?.limit ?? orderPageSize.value;
      q.set("skip", String(skip));
      q.set("limit", String(limit));
      if (params?.store_id) q.set("store_id", String(params.store_id));
      if (params?.status) q.set("status", params.status);
      if (params?.keyword) q.set("keyword", params.keyword);

      const countQ = new URLSearchParams();
      if (params?.store_id) countQ.set("store_id", String(params.store_id));
      if (params?.status) countQ.set("status", params.status);
      if (params?.keyword) countQ.set("keyword", params.keyword);

      const [listRes, countRes] = await Promise.all([
        fetch(`http://localhost:8000/api/orders?${q}`),
        fetch(`http://localhost:8000/api/orders/count?${countQ}`),
      ]);
      orders.value = await listRes.json();
      const cnt = await countRes.json();
      orderTotal.value = cnt.count;
    } catch (e) {
      console.error("fetchOrders failed", e);
    }
  }

  return {
    stores,
    orders,
    dashboard,
    storePage,
    storeTotal,
    storePageSize,
    orderPage,
    orderTotal,
    orderPageSize,
    fetchDashboard,
    fetchStores,
    fetchOrders,
  };
});
