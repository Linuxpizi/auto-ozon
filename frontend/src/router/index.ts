import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../store/auth";

const routes = [
  { path: "/login", name: "Login", component: () => import("../views/AuthView.vue"), meta: { guestOnly: true } },
  { path: "/", name: "Dashboard", component: () => import("../views/DashboardView.vue"), meta: { requiresAuth: true } },
  { path: "/stores", name: "StoreManagement", component: () => import("../views/StoreManagementView.vue"), meta: { requiresAuth: true } },
  { path: "/orders", name: "Orders", component: () => import("../views/OrdersView.vue"), meta: { requiresAuth: true } },
  { path: "/return-orders", name: "ReturnOrders", component: () => import("../views/ReturnOrdersView.vue"), meta: { requiresAuth: true } },
  { path: "/finances", name: "StoreFinance", component: () => import("../views/StoreFinanceView.vue"), meta: { requiresAuth: true } },
  { path: "/products", name: "ProductManagement", component: () => import("../views/ProductManagementView.vue"), meta: { requiresAuth: true } },
  { path: "/precision-listing", name: "PrecisionListing", redirect: "/selection", meta: { requiresAuth: true } },
  { path: "/intelligence", name: "Intelligence", component: () => import("../views/IntelligenceView.vue"), meta: { requiresAuth: true } },
  { path: "/selection", name: "ProductSelection", component: () => import("../views/ProductSelectionView.vue"), meta: { requiresAuth: true } },
  { path: "/upload-management", name: "UploadManagement", component: () => import("../views/UploadManagementView.vue"), meta: { requiresAuth: true } },
  { path: "/logistics", name: "Logistics", component: () => import("../views/LogisticsView.vue"), meta: { requiresAuth: true } },
  { path: "/task-configs", name: "TaskConfig", component: () => import("../views/TaskConfigView.vue"), meta: { requiresAuth: true } },
  { path: "/feishu-config", name: "FeishuConfig", component: () => import("../views/FeishuConfigView.vue"), meta: { requiresAuth: true } },
  { path: "/:pathMatch(.*)*", name: "NotFound", component: () => import("../views/NotFoundView.vue") },
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
