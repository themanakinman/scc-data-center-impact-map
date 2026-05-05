<template>
  <div class="comparison-panel">

    <!-- Header -->
    <div class="panel-header">
      <div class="panel-title">
        <i class="bi bi-layout-split"></i>
        Region Comparison
      </div>
      <div class="panel-subtitle">Click tracts on the map to build each region</div>
    </div>

    <!-- Empty state: neither region has tracts yet -->
    <div v-if="!regionA && !regionB" class="empty-state">
      <div class="empty-icon">
        <i class="bi bi-map"></i>
      </div>
      <p class="empty-title">No regions selected</p>
      <p class="empty-body">
        Use the <strong>Region A</strong> and <strong>Region B</strong> buttons on the map,
        then click census tracts to build each region.
      </p>
    </div>

    <!-- Comparison table: shown as soon as at least one region has data -->
    <div v-else class="table-wrapper">

      <!-- Column headers -->
      <div class="col-headers">
        <div class="col-metric-label"></div>
        <div class="col-header region-a-header">
          <span class="region-dot dot-a"></span>
          Region A
          <span class="tract-count" v-if="regionA">{{ regionA.tractCount }} tract{{ regionA.tractCount !== 1 ? 's' : '' }}</span>
        </div>
        <div class="col-header region-b-header">
          <span class="region-dot dot-b"></span>
          Region B
          <span class="tract-count" v-if="regionB">{{ regionB.tractCount }} tract{{ regionB.tractCount !== 1 ? 's' : '' }}</span>
        </div>
      </div>

      <!-- Metric rows -->
      <div
        v-for="metric in metrics"
        :key="metric.key"
        class="metric-row"
      >
        <div class="metric-label">
          <i :class="metric.icon" class="metric-icon"></i>
          {{ metric.label }}
        </div>

        <div class="metric-cell region-a-cell" :class="getCellClass(metric.key, 'A')">
          <span v-if="regionA">{{ formatValue(metric.key, regionA) }}</span>
          <span v-else class="empty-cell">—</span>
        </div>

        <div class="metric-cell region-b-cell" :class="getCellClass(metric.key, 'B')">
          <span v-if="regionB">{{ formatValue(metric.key, regionB) }}</span>
          <span v-else class="empty-cell">—</span>
        </div>
      </div>

    </div>

    <!-- Insight footer: only when both regions have data -->
    <div v-if="regionA && regionB" class="insight-footer">
      <i class="bi bi-lightbulb insight-icon"></i>
      <span class="insight-text">{{ insight }}</span>
    </div>

  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  // Each is { tractCount, dcCount, totalMW, avgIncome, avgSVI } or null
  regionA: { type: Object, default: null },
  regionB: { type: Object, default: null },
});

// Metric row definitions — label, icon, data key, and format type
const metrics = [
  { key: 'dcCount',    label: 'Data Centers',       icon: 'bi bi-building',      fmt: 'integer' },
  { key: 'totalMW',    label: 'Total MW Load',       icon: 'bi bi-lightning-fill', fmt: 'mw'      },
  { key: 'avgIncome',  label: 'Avg. Household Income', icon: 'bi bi-cash-stack',  fmt: 'currency' },
  { key: 'avgSVI',     label: 'Avg. Vulnerability',  icon: 'bi bi-shield-exclamation', fmt: 'svi' },
];

function formatValue(key, region) {
  if (!region) return '—';
  const v = region[key];
  if (v === null || v === undefined) return '—';

  switch (key) {
    case 'dcCount':   return v.toLocaleString();
    case 'totalMW':   return `${v} MW`;
    case 'avgIncome': return `$${Math.round(v).toLocaleString()}`;
    case 'avgSVI':    return v.toFixed(3);
    default:          return String(v);
  }
}

/**
 * For each metric, highlight which region is "worse" (higher vulnerability /
 * higher MW load / lower income) with a subtle background tint.
 * Returns a CSS class string or empty string.
 */
function getCellClass(key, region) {
  const a = props.regionA;
  const b = props.regionB;
  if (!a || !b) return '';

  // For income: lower is worse
  // For SVI and MW: higher is worse
  // For dcCount: higher is worse (more infrastructure burden)
  const worseIsHigher = ['avgSVI', 'totalMW', 'dcCount'].includes(key);
  const worseIsLower  = key === 'avgIncome';

  const aVal = a[key] ?? 0;
  const bVal = b[key] ?? 0;

  let aIsWorse = false;
  let bIsWorse = false;

  if (worseIsHigher) {
    aIsWorse = aVal > bVal;
    bIsWorse = bVal > aVal;
  } else if (worseIsLower) {
    aIsWorse = aVal < bVal;
    bIsWorse = bVal < aVal;
  }

  if (region === 'A' && aIsWorse) return 'cell-worse';
  if (region === 'B' && bIsWorse) return 'cell-worse';
  if (region === 'A' && bIsWorse) return 'cell-better';
  if (region === 'B' && aIsWorse) return 'cell-better';
  return '';
}

/**
 * Auto-generated one-line insight summarising the most striking difference.
 */
const insight = computed(() => {
  const a = props.regionA;
  const b = props.regionB;
  if (!a || !b) return '';

  // Find the region with higher vulnerability
  const higherSVI  = a.avgSVI  > b.avgSVI  ? 'A' : 'B';
  const lowerIncome = a.avgIncome < b.avgIncome ? 'A' : 'B';
  const higherMW   = a.totalMW > b.totalMW ? 'A' : 'B';

  // Most interesting case: same region is more vulnerable AND has more MW load
  if (higherSVI === higherMW && higherSVI === lowerIncome) {
    return `Region ${higherSVI} has higher vulnerability, lower income, and greater infrastructure load — a compounding burden.`;
  }
  if (higherSVI === higherMW) {
    return `Region ${higherSVI} faces both higher social vulnerability and greater data center load.`;
  }
  if (higherSVI === lowerIncome) {
    return `Region ${higherSVI} is more vulnerable and lower income, but carries less infrastructure load.`;
  }

  // Default: just call out the SVI difference
  const sviDiff = Math.abs(a.avgSVI - b.avgSVI).toFixed(3);
  return `Region ${higherSVI} has a higher average vulnerability index (Δ ${sviDiff}).`;
});
</script>

<style scoped>
.comparison-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 13px;
}

/* ---- Header ---- */
.panel-header {
  padding: 16px 16px 12px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #111827;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 4px;
}

.panel-subtitle {
  font-size: 12px;
  color: #9ca3af;
  font-weight: 200;
}

/* ---- Empty state ---- */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  text-align: center;
  color: #6b7280;
}

.empty-icon {
  font-size: 28px;
  color: #d1d5db;
  margin-bottom: 12px;
}

.empty-title {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  margin: 0 0 6px;
}

.empty-body {
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
  font-weight: 100;
  margin: 0;
}

/* ---- Table ---- */
.table-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.col-headers {
  display: grid;
  grid-template-columns: 1fr 90px 90px;
  padding: 6px 16px 8px;
  gap: 4px;
  position: sticky;
  top: 0;
  background: #ffffff;
  z-index: 2;
  border-bottom: 1px solid #f0f0f0;
}

.col-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  gap: 3px;
}

.region-a-header { color: #059669; }
.region-b-header { color: #7C3AED; }

.tract-count {
  font-size: 10px;
  font-weight: 400;
  color: #9ca3af;
}

.region-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.dot-a { background: #10B981; }
.dot-b { background: #8B5CF6; }

/* ---- Metric rows ---- */
.metric-row {
  display: grid;
  grid-template-columns: 1fr 90px 90px;
  align-items: center;
  padding: 9px 16px;
  gap: 4px;
  border-bottom: 1px solid #f9fafb;
  transition: background 0.1s;
}

.metric-row:hover {
  background: #fafafa;
}

.metric-label {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #374151;
  font-size: 12px;
  font-weight: 400;
}

.metric-icon {
  color: #9ca3af;
  font-size: 13px;
  flex-shrink: 0;
}

.metric-cell {
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  color: #111827;
  padding: 4px 6px;
  border-radius: 6px;
  transition: background 0.15s;
}

.empty-cell {
  color: #d1d5db;
  font-weight: 400;
}

/* Highlight cells — worse outcome gets a warm tint, better gets a cool tint */
.cell-worse {
  background: #fef2f2;
  color: #b91c1c;
}

.cell-better {
  background: #eff6ff;
  color: #1d4ed8;
}

/* ---- Insight footer ---- */
.insight-footer {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 16px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}

.insight-icon {
  color: #f59e0b;
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 1px;
}

.insight-text {
  font-size: 12px;
  color: #374151;
  line-height: 1.5;
}
</style>