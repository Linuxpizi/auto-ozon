<template>
  <div class="container">
    <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
      <h2 class="section-title" style="margin: 0;">定时任务配置</h2>
      <button class="button-secondary" @click="loadData" :disabled="loading">
        {{ loading ? '刷新中...' : '刷新' }}
      </button>
    </div>

    <div v-if="loading && !tasks.length" style="text-align: center; padding: 48px; color: #64748b;">
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
                <div style="font-size: 12px; color: #64748b;">{{ task.description }}</div>
              </td>
              <td><code style="background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 12px;">{{ task.task_key }}</code></td>
              <td>{{ task.trigger_type === 'interval' ? '间隔' : 'Cron' }}</td>
              <td>{{ formatInterval(task) }}</td>
              <td>
                <span :class="['badge', task.enabled ? 'badge-active' : 'badge-inactive']">
                  {{ task.enabled ? '运行中' : '已暂停' }}
                </span>
              </td>
              <td style="font-size: 12px; color: #64748b;">{{ formatTime(task.last_run_at) }}</td>
              <td>
                <span v-if="task.last_status" :class="['badge', task.last_status === 'success' ? 'badge-success' : 'badge-inactive']">
                  {{ task.last_status === 'success' ? '成功' : '失败' }}
                </span>
                <span v-else style="color: #94a3b8;">-</span>
              </td>
              <td>
                <div style="display: flex; gap: 4px;">
                  <button class="button-link" @click="toggleTask(task)">{{ task.enabled ? '暂停' : '启用' }}</button>
                  <button class="button-link" @click="triggerTask(task)" :disabled="triggering === task.task_key">
                    {{ triggering === task.task_key ? '触发中...' : '立即执行' }}
                  </button>
                </div>
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
    alert("操作失败");
  }
}

async function triggerTask(task: TaskConfig) {
  triggering.value = task.task_key;
  try {
    const result = await apiPost<{ status: string }>(`/task-configs/${task.task_key}/trigger`);
    alert(`执行完成: ${result.status}`);
    await loadData();
  } catch (e: any) {
    alert(`触发失败: ${e.message}`);
  } finally {
    triggering.value = "";
  }
}

onMounted(loadData);
</script>
