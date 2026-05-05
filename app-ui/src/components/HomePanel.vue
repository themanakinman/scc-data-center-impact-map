<template>
  <div class="home-panel">
    <!-- Header -->
    <div class="panel-header">
      <div class="panel-title">
        <i class="bi bi-house-door"></i>
        Home Details
      </div>
      <div class="panel-subtitle" v-if="homeData">{{ homeAddress }}</div>
      <div class="panel-subtitle" v-else>Select a home on the map</div>
    </div>

    <!-- Empty state -->
    <div v-if="!homeData" class="empty-state">
      <div class="empty-icon">
        <i class="bi bi-cursor"></i>
      </div>
      <p class="empty-title">No home selected</p>
      <p class="empty-body">
        Zoom in on the map and click on a home to view its value over the last 10 years.
      </p>
    </div>

    <!-- Data display -->
    <div v-else class="data-wrapper d-flex flex-column" style="flex: 1; min-height: 0;">
      
      <!-- Stats Summary Row -->
      <div class="stats-row px-3 py-3 mb-2">
        <div class="stat-box d-flex flex-column">
          <span class="stat-label">Current Price</span>
          <span class="stat-value">{{ latestValue }}</span>
        </div>
      </div>

      <!-- Line Graph Wrapper -->
      <div class="graph-container px-3 pb-3 flex-grow-1 d-flex flex-column">
        <div class="graph-title mb-2">Price Trend (2016-2026)</div>
        <div class="svg-wrapper" ref="svgContainer" style="flex: 1; position: relative; min-height: 150px;">
          <svg
            v-if="points"
            width="100%"
            height="100%"
            class="line-graph"
            viewBox="0 0 300 150"
            preserveAspectRatio="none"
          >
            <!-- Grid Lines -->
            <line x1="0" y1="25" x2="300" y2="25" stroke="#f0f0f0" stroke-width="1"/>
            <line x1="0" y1="75" x2="300" y2="75" stroke="#f0f0f0" stroke-width="1"/>
            <line x1="0" y1="125" x2="300" y2="125" stroke="#f0f0f0" stroke-width="1"/>

            <!-- The Line -->
            <polyline
              :points="points"
              fill="none"
              stroke="#27AE60"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            
            <!-- Points / Dots -->
            <circle
              v-for="(pt, idx) in parsedPoints"
              :key="idx"
              :cx="pt.x"
              :cy="pt.y"
              r="3"
              fill="#ffffff"
              stroke="#27AE60"
              stroke-width="1"
            />
          </svg>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  homeData: {
    type: Object,
    default: null
  }
});

const latestValue = computed(() => {
  if (!props.homeData || !props.homeData.timeseries || props.homeData.timeseries.length === 0) return '--';
  const series = props.homeData.timeseries;
  const val = series[series.length - 1].value;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
});

const FAKE_ADDRESSES = [
  "1422 San Andreas Ct, Santa Clara, CA 95051",
  "3589 Homestead Rd, Santa Clara, CA 95051",
  "2104 Warburton Ave, Santa Clara, CA 95050",
  "850 Monroe St, Santa Clara, CA 95050",
  "1243 Henderson Ave, Sunnyvale, CA 94086",
  "675 E Taylor St, San Jose, CA 95112",
  "1042 Westlynn Way, Cupertino, CA 95014",
  "20130 Las Ondas Ct, Cupertino, CA 95014",
  "488 W Charleston Rd, Palo Alto, CA 94306",
  "1952 Channing Ave, Palo Alto, CA 94303"
];

const homeAddress = computed(() => {
  if (!props.homeData || !props.homeData.id) return "";
  // Simple hash of the ID to deterministically pick an address
  let hash = 0;
  const idStr = String(props.homeData.id);
  for (let i = 0; i < idStr.length; i++) {
    hash = (hash * 31 + idStr.charCodeAt(i)) % FAKE_ADDRESSES.length;
  }
  return FAKE_ADDRESSES[hash];
});

// Calculate SVG Polyline Points (Scaling raw data to 300x150 canvas)
const parsedPoints = computed(() => {
  if (!props.homeData || !props.homeData.timeseries || props.homeData.timeseries.length < 2) return [];
  const series = props.homeData.timeseries;
  
  const width = 300;
  const height = 150;
  const padding = 10;
  
  const times = series.map(d => d.time);
  const values = series.map(d => d.value);
  
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  
  // Base chart around expected values to make it look nicer (e.g. 60 to 90 degrees)
  const minValue = Math.min(...values) - 5;
  const maxValue = Math.max(...values) + 5;
  
  return series.map(d => {
    // scale X from 0 to width
    const x = padding + ((d.time - minTime) / (maxTime - minTime)) * (width - padding * 2);
    // scale Y from height to 0 (SVG y goes down)
    const y = height - padding - ((d.value - minValue) / (maxValue - minValue)) * (height - padding * 2);
    return { x, y };
  });
});

const points = computed(() => {
  const pts = parsedPoints.value;
  if (!pts || pts.length === 0) return null;
  return pts.map(p => `${p.x},${p.y}`).join(' ');
});

</script>

<style scoped>
.home-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 13px;
}

/* ---- Header ---- */
.panel-header {
  padding: 16px 16px 12px;
  border-bottom: 0.5px solid #f0f0f0;
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
  margin: 0;
}

/* ---- Stats ---- */
.stat-label {
  font-size: 13px;
  color: #000000;
  margin-bottom: 2px;
  font-weight: 600;
}
.stat-value {
  font-size: 18px;
  font-weight: 600;
  color: #27AE60;
}

/* ---- Graph ---- */
.graph-title {
  font-size: 12px;
  font-weight: 500;
  color: #111827;
}
.line-graph {
  border-radius: 8px;
  background-color: #fafafa;
  border: 1px solid #f0f0f0;
}
</style>
