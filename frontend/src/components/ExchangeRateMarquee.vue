<template>
  <div class="exchange-rate-marquee" v-if="rates.length > 0">
    <div class="marquee-label">💱 实时汇率</div>
    <div class="marquee-track" ref="trackRef">
      <div class="marquee-content" :style="{ animationDuration: scrollDuration + 's' }">
        <span v-for="(item, idx) in duplicatedRates" :key="idx" class="rate-item">
          <span class="rate-pair">{{ item.pair }}</span>
          <span class="rate-value" :class="{ 'rate-up': item.up, 'rate-down': item.down }">
            {{ item.value }}
          </span>
          <span class="rate-source">{{ item.source }}</span>
          <span class="rate-sep">│</span>
        </span>
      </div>
    </div>
    <div class="marquee-time" v-if="lastUpdate">
      更新于 {{ lastUpdate }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import { getExchangeRates } from "../api/exchange-rates";

interface RateItem {
  pair: string;
  value: string;
  source: string;
  up?: boolean;
  down?: boolean;
  numValue: number;
}

const rates = ref<RateItem[]>([]);
const prevRates = ref<Record<string, number>>({});
const lastUpdate = ref("");
let timer: ReturnType<typeof setInterval> | null = null;

const PAIR_LABELS: Record<string, string> = {
  "CNY/RUB": "人民币→卢布",
  "CNY/USD": "人民币→美元",
  "USD/RUB": "美元→卢布",
  "EUR/RUB": "欧元→卢布",
  "EUR/CNY": "欧元→人民币",
  "EUR/USD": "欧元→美元",
};

const SOURCE_LABELS: Record<string, string> = {
  pboc: "央行",
  cbr: "俄央",
  ecb: "欧央",
};

const duplicatedRates = computed(() => [...rates.value, ...rates.value]);

const scrollDuration = computed(() => {
  // Slower for more items
  return Math.max(20, rates.value.length * 5);
});

async function fetchRates() {
  try {
    const data = await getExchangeRates();
    const prev = { ...prevRates.value };
    const items: RateItem[] = [];

    for (const [pair, val] of Object.entries(data.rates)) {
      const label = PAIR_LABELS[pair] || pair;
      // Determine which source this pair came from
      let source = "";
      if (data.sources?.pboc && pair.startsWith("CNY")) source = "PBOC";
      else if (data.sources?.cbr && pair.startsWith("RUB")) source = "CBR";
      else if (data.sources?.ecb && pair.startsWith("EUR")) source = "ECB";

      const numVal = Number(val);
      const prevVal = prev[pair];
      items.push({
        pair: `${pair} ${label}`,
        value: numVal.toFixed(4),
        source,
        numValue: numVal,
        up: prevVal !== undefined && numVal > prevVal,
        down: prevVal !== undefined && numVal < prevVal,
      });
    }

    // Store current values for next comparison
    const currentRates: Record<string, number> = {};
    for (const item of items) {
      for (const [pair] of Object.entries(data.rates)) {
        if (item.pair.startsWith(pair)) {
          currentRates[pair] = item.numValue;
        }
      }
    }
    prevRates.value = currentRates;

    rates.value = items;

    // Format update time
    const now = new Date();
    lastUpdate.value = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  } catch (e) {
    console.error("Failed to fetch exchange rates:", e);
  }
}

onMounted(() => {
  fetchRates();
  // Poll every 5 minutes
  timer = setInterval(fetchRates, 5 * 60 * 1000);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.exchange-rate-marquee {
  display: flex;
  align-items: center;
  background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%);
  color: #e0e8f0;
  padding: 6px 16px;
  font-size: 13px;
  overflow: hidden;
  gap: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.marquee-label {
  font-weight: 600;
  white-space: nowrap;
  color: #60a5fa;
  font-size: 12px;
}

.marquee-track {
  flex: 1;
  overflow: hidden;
  position: relative;
  mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent);
  -webkit-mask-image: linear-gradient(90deg, transparent, black 5%, black 95%, transparent);
}

.marquee-content {
  display: inline-flex;
  white-space: nowrap;
  animation: marquee-scroll linear infinite;
}

.rate-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
}

.rate-pair {
  font-weight: 600;
  color: #ffffff;
  font-size: 12px;
}

.rate-value {
  font-family: "SF Mono", "Menlo", "Monaco", monospace;
  font-weight: 500;
  font-size: 13px;
  transition: color 0.3s;
}

.rate-up {
  color: #34d399;
}

.rate-down {
  color: #f87171;
}

.rate-source {
  font-size: 10px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 3px;
}

.rate-sep {
  color: rgba(255, 255, 255, 0.15);
}

.marquee-time {
  font-size: 11px;
  color: #64748b;
  white-space: nowrap;
}

@keyframes marquee-scroll {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}
</style>
