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
          <label class="label">合同货币</label>
          <input v-model="form.contract_currency" class="input" placeholder="例如 USD" />
        </div>
        <div>
          <label class="label">备注</label>
          <input v-model="form.notes" class="input" placeholder="备注信息" />
        </div>
        <div style="grid-column: span 2; display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
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
import { apiPost, apiPut } from "../api";
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
  contract_currency: "",
  notes: "",
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
        contract_currency: val.contract_currency || "",
        notes: val.notes || "",
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
  form.contract_currency = "";
  form.notes = "";
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

  const body: Record<string, any> = {
    account_name: form.account_name,
    name: form.name,
    client_id: form.client_id,
    api_key: form.api_key,
    warehouse_id: form.warehouse_id,
    warehouse_status: form.warehouse_status,
    type_id: form.type_id,
    status: form.status,
    contract_currency: form.contract_currency,
    notes: form.notes,
  };

  try {
    if (props.editingStore?.id) {
      await apiPut(`/stores/${props.editingStore.id}`, body);
    } else {
      await apiPost("/stores/", body);
    }
    emit("saved");
    close();
  } catch (error: any) {
    console.error(error);
    submitError.value = error?.message || "操作失败，请重试";
  }
}
</script>
