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

const routes = [
  { path: "/", name: "Dashboard", component: DashboardView },
  { path: "/stores", name: "StoreManagement", component: StoreManagementView },
  { path: "/orders", name: "Orders", component: OrdersView },
  { path: "/return-orders", name: "ReturnOrders", component: ReturnOrdersView },
  { path: "/finances", name: "StoreFinance", component: StoreFinanceView },
  { path: "/products", name: "ProductManagement", component: ProductManagementView },
  { path: "/precision-listing", name: "PrecisionListing", redirect: "/selection" },
  { path: "/intelligence", name: "Intelligence", component: IntelligenceView },
  { path: "/selection", name: "ProductSelection", component: ProductSelectionView },
  { path: "/task-configs", name: "TaskConfig", component: TaskConfigView },
  { path: "/feishu-config", name: "FeishuConfig", component: FeishuConfigView },
  { path: "/:pathMatch(.*)*", name: "NotFound", component: NotFoundView },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
