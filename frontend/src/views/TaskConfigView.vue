<template>
  <div class="container">
    <div class="page-header">
      <n-h2 class="page-title" style="margin: 0;">定时任务配置</n-h2>
      <div class="toolbar">
        <n-button size="small" @click="loadData" :loading="loading">
          {{ loading ? '刷新中...' : '刷新' }}
        </n-button>
      </div>
    </div>

    <div v-if="loading && !tasks.length" style="text-align: center; padding: 48px; color: var(--text-secondary);">
      加载中...
    </div>

    <template v-else>
      <div class="card" style="margin-bottom: 20px;">
        <table class="table">
          <thead>
            <tr>
              <th>任务名称</th>
              <th>任务标识</th>
              <th>触发方式</th>
              <th>间隔</th>
              <th>执行店铺</th>
              <th>状态</th>
              <th>上次执行</th>
              <th>结果</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="task in tasks" :key="task.task_key">
              <td>
                <div style="font-weight: 500;">{{ task.name }}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">{{ task.description }}</div>
              </td>
              <td><n-tag size="small" round>{{ task.task_key }}</n-tag></td>
              <td>{{ task.trigger_type === 'interval' ? '间隔' : 'Cron' }}</td>
              <td>{{ formatInterval(task) }}</td>
              <td>
                <template v-if="isOzonCategoryTask(task)">
                  <n-select
                    :value="task.source_store_id"
                    :options="storeOptions"
                    :loading="savingSourceStore === task.task_key"
                    placeholder="请选择 Ozon 店铺"
                    clearable
                    size="small"
                    style="min-width: 180px;"
                    @update:value="value => updateSourceStore(task, value)"
                  />
                  <div v-if="task.source_store_id === null" class="source-store-warning">
                    选择执行店铺后才能同步中文分类
                  </div>
                </template>
                <span v-else style="color: var(--text-muted);">-</span>
              </td>
              <td>
                <n-tag :type="task.enabled ? 'success' : 'default'" size="small" round>
                  {{ task.enabled ? '运行中' : '已暂停' }}
                </n-tag>
              </td>
              <td style="font-size: 12px; color: var(--text-secondary);">{{ formatTime(task.last_run_at) }}</td>
              <td>
                <n-tag v-if="task.last_status" :type="task.last_status === 'success' ? 'success' : 'error'" size="small"
                  round>
                  {{ task.last_status === 'success' ? '成功' : '失败' }}
                </n-tag>
                <span v-else style="color: var(--text-muted);">-</span>
              </td>
              <td>
                <n-space :size="6">
                  <n-button size="small" @click="toggleTask(task)">{{ task.enabled ? '暂停' : '启用'
                    }}</n-button>
                  <n-button size="small" type="primary" :loading="triggering === task.task_key"
                    :disabled="isOzonCategoryTask(task) && task.source_store_id === null"
                    @click="triggerTask(task)">
                    {{ triggering === task.task_key ? '触发中...' : '立即执行' }}
                  </n-button>
                </n-space>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { NH2, NButton, NTag, NSpace, NSelect, useMessage } from "naive-ui";
import { apiGet, apiPost, apiPut } from "../api";

interface TaskConfig {
  id: number;
  task_key: string;
  name: string;
  description: string;
  trigger_type: string;
  interval_seconds: number;
  cron_expression: string;
  enabled: boolean;
  source_store_id: number | null;
  last_run_at: string | null;
  last_status: string;
}

interface StoreOption {
  label: string;
  value: number;
}

interface TriggerResult {
  task_key: string;
  status: string;
}

const message = useMessage();
const tasks = ref<TaskConfig[]>([]);
const storeOptions = ref<StoreOption[]>([]);
const loading = ref(false);
const triggering = ref("");
const savingSourceStore = ref("");

function isOzonCategoryTask(task: TaskConfig) {
  return task.task_key === "sync_ozon_categories";
}

function formatInterval(task: TaskConfig) {
  if (task.trigger_type === 'cron') return task.cron_expression;
  const s = task.interval_seconds;
  if (s >= 86400) return `${s / 86400} 天`;
  if (s >= 3600) return `${s / 3600} 小时`;
  if (s >= 60) return `${s / 60} 分钟`;
  return `${s} 秒`;
}

function formatTime(t: string | null) {
  if (!t) return "-";
  return new Date(t).toLocaleString("zh-CN");
}

async function loadData() {
  loading.value = true;
  try {
    const [taskRows, stores] = await Promise.all([
      apiGet<TaskConfig[]>("/task-configs/"),
      apiGet<Array<{ id: number; name: string }>>("/stores/"),
    ]);
    tasks.value = taskRows;
    storeOptions.value = stores.map(store => ({
      label: store.name,
      value: store.id,
    }));
  } catch (e: any) {
    message.error("加载定时任务失败: " + (e.message || "未知错误"));
  } finally {
    loading.value = false;
  }
}

async function updateSourceStore(task: TaskConfig, sourceStoreId: number | null) {
  savingSourceStore.value = task.task_key;
  try {
    const updated = await apiPut<TaskConfig>(`/task-configs/${task.task_key}`, {
      source_store_id: sourceStoreId,
    });
    task.source_store_id = updated.source_store_id;
    message.success(sourceStoreId === null ? "已清除分类同步执行店铺" : "分类同步执行店铺已保存");
  } catch (e: any) {
    message.error("保存执行店铺失败: " + (e.message || "未知错误"));
  } finally {
    savingSourceStore.value = "";
  }
}

async function toggleTask(task: TaskConfig) {
  try {
    await apiPut(`/task-configs/${task.task_key}`, { enabled: !task.enabled });
    await loadData();
    message.success(task.enabled ? "任务已暂停" : "任务已启用");
  } catch (e: any) {
    message.error("更新任务状态失败: " + (e.message || "未知错误"));
  }
}

async function triggerTask(task: TaskConfig) {
  if (isOzonCategoryTask(task) && task.source_store_id === null) {
    message.warning("请先为 Ozon 中文分类同步任务选择执行店铺");
    return;
  }
  triggering.value = task.task_key;
  try {
    const result = await apiPost<TriggerResult>(`/task-configs/${task.task_key}/trigger`);
    await loadData();
    if (result.status === "success") {
      message.success("任务执行成功");
    } else {
      message.error("任务执行失败，请查看任务结果和后端日志");
    }
  } catch (e: any) {
    message.error("任务触发失败: " + (e.message || "未知错误"));
  } finally {
    triggering.value = "";
  }
}

onMounted(loadData);
</script>

<style scoped>
.source-store-warning {
  margin-top: 4px;
  color: var(--error-color, #d03050);
  font-size: 12px;
  white-space: nowrap;
}
</style>
