import { createRouter, createWebHistory } from "vue-router";
import DashboardView from "../views/DashboardView.vue";
import StoreManagementView from "../views/StoreManagementView.vue";
import OrdersView from "../views/OrdersView.vue";
import StoreFinanceView from "../views/StoreFinanceView.vue";
import NotFoundView from "../views/NotFoundView.vue";

import TaskConfigView from "../views/TaskConfigView.vue";
import ProductManagementView from "../views/ProductManagementView.vue";
import IntelligenceView from "../views/IntelligenceView.vue";
import ProductSelectionView from "../views/ProductSelectionView.vue";
import ReturnOrdersView from "../views/ReturnOrdersView.vue";
import FeishuConfigView from "../views/FeishuConfigView.vue";
import UploadManagementView from "../views/UploadManagementView.vue";
import LogisticsView from "../views/LogisticsView.vue";
import AuthView from "../views/AuthView.vue";
import { useAuthStore } from "../store/auth";

const routes = [
  { path: "/login", name: "Login", component: AuthView, meta: { guestOnly: true } },
  { path: "/", name: "Dashboard", component: DashboardView, meta: { requiresAuth: true } },
  { path: "/stores", name: "StoreManagement", component: StoreManagementView, meta: { requiresAuth: true } },
  { path: "/orders", name: "Orders", component: OrdersView, meta: { requiresAuth: true } },
  { path: "/return-orders", name: "ReturnOrders", component: ReturnOrdersView, meta: { requiresAuth: true } },
  { path: "/finances", name: "StoreFinance", component: StoreFinanceView, meta: { requiresAuth: true } },
  { path: "/products", name: "ProductManagement", component: ProductManagementView, meta: { requiresAuth: true } },
  { path: "/precision-listing", name: "PrecisionListing", redirect: "/selection", meta: { requiresAuth: true } },
  { path: "/intelligence", name: "Intelligence", component: IntelligenceView, meta: { requiresAuth: true } },
  { path: "/selection", name: "ProductSelection", component: ProductSelectionView, meta: { requiresAuth: true } },
  { path: "/upload-management", name: "UploadManagement", component: UploadManagementView, meta: { requiresAuth: true } },
  { path: "/logistics", name: "Logistics", component: LogisticsView, meta: { requiresAuth: true } },
  { path: "/task-configs", name: "TaskConfig", component: TaskConfigView, meta: { requiresAuth: true } },
  { path: "/feishu-config", name: "FeishuConfig", component: FeishuConfigView, meta: { requiresAuth: true } },
  { path: "/:pathMatch(.*)*", name: "NotFound", component: NotFoundView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "Login", query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && auth.isAuthenticated) return { name: "Dashboard" };
  return true;
});

export default router;
