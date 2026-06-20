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
import { NH2, NButton, NTag, NSpace } from "naive-ui";
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
  last_run_at: string | null;
  last_status: string;
}

const tasks = ref<TaskConfig[]>([]);
const loading = ref(false);
const triggering = ref("");

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
    tasks.value = await apiGet<TaskConfig[]>("/task-configs/");
  } catch (e) {
    console.error(e);
  } finally {
    loading.value = false;
  }
}

async function toggleTask(task: TaskConfig) {
  try {
    await apiPut(`/task-configs/${task.task_key}`, { enabled: !task.enabled });
    await loadData();
  } catch (e) {
    console.error(e);
  }
}

async function triggerTask(task: TaskConfig) {
  triggering.value = task.task_key;
  try {
    await apiPost(`/task-configs/${task.task_key}/trigger`);
    await loadData();
  } catch (e) {
    console.error(e);
  } finally {
    triggering.value = "";
  }
}

onMounted(loadData);
</script>
