<template>
  <div v-if="visible" class="dialog-overlay" @click.self="close">
    <div class="dialog">
      <h2 class="section-title">{{ editingStore ? '编辑店铺' : '添加店铺' }}</h2>
      <form class="grid grid-2" @submit.prevent="submitStore">
        <div>
          <label class="label">所属账号</label>
          <input v-model="form.account_name" class="input" placeholder="请输入所属账号" />
        </div>
        <div>
          <label class="label">店铺名称</label>
          <input v-model="form.name" class="input" placeholder="请输入店铺名称" required />
          <p v-if="errors.name" class="error">{{ errors.name }}</p>
        </div>
        <div>
          <label class="label">Client ID</label>
          <input v-model="form.client_id" class="input" placeholder="请输入 Client ID" required />
          <p v-if="errors.client_id" class="error">{{ errors.client_id }}</p>
        </div>
        <div>
          <label class="label">API Key</label>
          <input v-model="form.api_key" class="input" placeholder="请输入 API Key" required />
          <p v-if="errors.api_key" class="error">{{ errors.api_key }}</p>
        </div>
        <div>
          <label class="label">仓库 ID</label>
          <input v-model="form.warehouse_id" class="input" placeholder="请输入仓库 ID" />
        </div>
        <div>
          <label class="label">仓库状态</label>
          <select v-model="form.warehouse_status" class="select">
            <option value="">请选择</option>
            <option value="active">有效</option>
            <option value="inactive">停用</option>
          </select>
        </div>
        <div>
          <label class="label">类型 ID</label>
          <input v-model="form.type_id" class="input" placeholder="请输入类型 ID" />
        </div>
        <div>
          <label class="label">状态</label>
          <select v-model="form.status" class="select" required>
            <option value="active">有效</option>
            <option value="inactive">停用</option>
          </select>
        </div>
        <div>
          <label class="label">刊登状态</label>
          <select v-model="form.listing_status" class="select">
            <option value="">请选择</option>
            <option value="active">在售</option>
            <option value="inactive">停售</option>
            <option value="draft">草稿</option>
          </select>
        </div>
        <div>
          <label class="label">合同货币</label>
          <input v-model="form.contract_currency" class="input" placeholder="例如 USD" />
        </div>
        <div>
          <label class="label">VAT 税率 (%)</label>
          <input v-model.number="form.vat_rate" class="input" type="number" step="0.01" placeholder="0" />
        </div>
        <div>
          <label class="label">备注</label>
          <input v-model="form.notes" class="input" placeholder="备注信息" />
        </div>
        <div class="grid" style="grid-column: span 2; gap: 8px;">
          <label class="label">自动操作</label>
          <div style="display: flex; gap: 20px; flex-wrap: wrap;">
            <label style="display: flex; align-items: center; gap: 6px; font-size: 14px;">
              <input type="checkbox" v-model="form.auto_ad" class="switch" />
              自动广告
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 14px;">
              <input type="checkbox" v-model="form.auto_archive" class="switch" />
              自动归档
            </label>
            <label style="display: flex; align-items: center; gap: 6px; font-size: 14px;">
              <input type="checkbox" v-model="form.auto_delete" class="switch" />
              自动删除
            </label>
          </div>
        </div>
        <div style="grid-column: span 2; display: flex; gap: 12px; justify-content: flex-end;">
          <button type="button" class="button-secondary" @click="close">取消</button>
          <button type="submit" class="button-primary">{{ editingStore ? '保存更改' : '添加店铺' }}</button>
        </div>
        <p v-if="submitError" class="error" style="grid-column: span 2">{{ submitError }}</p>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from "vue";
import type { StoreItem } from "../store";

const props = defineProps<{
  visible: boolean;
  editingStore?: Partial<StoreItem> | null;
}>();

const emit = defineEmits<{
  close: [];
  saved: [];
}>();

const form = reactive({
  account_name: "",
  name: "",
  client_id: "",
  api_key: "",
  warehouse_id: "",
  warehouse_status: "",
  type_id: "",
  status: "active",
  listing_status: "",
  contract_currency: "",
  vat_rate: 0,
  notes: "",
  auto_ad: false,
  auto_archive: false,
  auto_delete: false,
});

const errors = reactive<Record<string, string | null>>({ name: null, client_id: null, api_key: null });
const submitError = reactive({ value: "" });

watch(
  () => props.editingStore,
  (val) => {
    if (val) {
      Object.assign(form, {
        account_name: val.account_name || "",
        name: val.name || "",
        client_id: val.client_id || "",
        api_key: val.api_key || "",
        warehouse_id: val.warehouse_id || "",
        warehouse_status: val.warehouse_status || "",
        type_id: val.type_id || "",
        status: val.status || "active",
        listing_status: val.listing_status || "",
        contract_currency: val.contract_currency || "",
        vat_rate: val.vat_rate ?? 0,
        notes: val.notes || "",
        auto_ad: val.auto_ad ?? false,
        auto_archive: val.auto_archive ?? false,
        auto_delete: val.auto_delete ?? false,
      });
    } else {
      resetForm();
    }
  },
  { immediate: true }
);

function resetForm() {
  form.account_name = "";
  form.name = "";
  form.client_id = "";
  form.api_key = "";
  form.warehouse_id = "";
  form.warehouse_status = "";
  form.type_id = "";
  form.status = "active";
  form.listing_status = "";
  form.contract_currency = "";
  form.vat_rate = 0;
  form.notes = "";
  form.auto_ad = false;
  form.auto_archive = false;
  form.auto_delete = false;
  errors.name = errors.client_id = errors.api_key = null;
  submitError.value = "";
}

function close() {
  resetForm();
  emit("close");
}

function validate() {
  errors.name = form.name ? null : "请填写店铺名称";
  errors.client_id = form.client_id ? null : "请填写 Client ID";
  errors.api_key = form.api_key ? null : "请填写 API Key";
  return !errors.name && !errors.client_id && !errors.api_key;
}

async function submitStore() {
  submitError.value = "";
  if (!validate()) return;

  const body = {
    account_name: form.account_name,
    name: form.name,
    client_id: form.client_id,
    api_key: form.api_key,
    warehouse_id: form.warehouse_id,
    warehouse_status: form.warehouse_status,
    type_id: form.type_id,
    status: form.status,
    listing_status: form.listing_status,
    contract_currency: form.contract_currency,
    vat_rate: form.vat_rate,
    notes: form.notes,
    auto_ad: form.auto_ad,
    auto_archive: form.auto_archive,
    auto_delete: form.auto_delete,
  };

  try {
    if (props.editingStore?.id) {
      const res = await fetch(`http://localhost:8000/api/stores/${props.editingStore.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "更新店铺失败");
      }
    } else {
      const res = await fetch("http://localhost:8000/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "添加店铺失败");
      }
    }
    emit("saved");
    close();
  } catch (error: any) {
    console.error(error);
    submitError.value = error?.message || "操作失败，请重试";
  }
}
</script>
