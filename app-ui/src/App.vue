<template>
  <div class="dashboard-shell position-relative" style="height: 100vh; overflow: hidden;">
    
    <!-- Background Absolute Map Layer -->
    <div class="position-absolute top-0 start-0 w-100 h-100" style="z-index: 1;">
      <BaseMap
        :active-layers="activeLayers"
        :is-adding-mode="isAddingDataCenter"
        :mode="currentMode"
        @exit-adding-mode="exitAddingMode"
        @map-data-updated="updateTime"
        @comparison-stats-updated="onStatsUpdated"
        @home-selected="onHomeSelected"
      />
    </div>

    <!-- Foreground Floating UI Overlay -->
    <div class="d-flex h-100 p-3 position-absolute top-0 start-0 w-100" style="z-index: 10; pointer-events: none; gap: 16px;">
      
      <!-- Collapsible Floating Left Stack -->
      <div 
        class="sidebar-wrapper d-flex flex-column gap-3" 
        :class="{ 'collapsed': !isSidebarOpen }"
        style="pointer-events: auto; min-height: 3vh;"
      >
        <!-- Floating Title Card -->
        <div ref="titleCardRef" class="row bg-white text-dark py-3 px-3 m-0 shadow-sm flex-shrink-0 position-relative" style="border-radius: 12px;">
          <div class="col p-0">
            <h4 class="mb-0 fs-3" style="font-weight: 200;">Santa Clara County <br> Data Center Impact</h4>
          </div>
          <button
              @click="isSidebarOpen = false"
              class="sidebar-toggle-btn position-absolute top-0 end-0 mt-2 me-2 shadow-none"
              title="Hide Sidebar"
              style="z-index: 50;"
          >
              <i class="bi bi-chevron-double-left fs-6"></i>
          </button>
        </div>

        <!-- Floating Sidebar Panel -->
        <div class="bg-white position-relative overflow-hidden d-flex shadow-sm flex-column" style="border-radius: 12px;">
          <div class="position-relative w-100 m-0 p-0" style="overflow-y: auto;">
            <Sidebar :active-layers="activeLayers" :last-updated-date="lastUpdatedDate" />
          </div>
        </div>

      </div> <!-- /sidebar-wrapper -->

      <!-- Contextual Toolbar Track -->
      <div class="toolbar-track position-relative h-100" style="pointer-events: auto;">
        
        <transition name="fade-btn">
          <button 
            v-show="!isSidebarOpen" 
            @click="isSidebarOpen = true" 
            class="sidebar-toggle-btn position-absolute top-0 start-0 shadow-sm" 
            title="Show Sidebar"
            style="z-index: 50; margin-left: 8px; margin-top: 8px;"
          >
            <i class="bi bi-chevron-double-right fs-6"></i>
          </button>
        </transition>

        <!-- Floating Vertical icon toolbar -->
        <div class="layer-toolbar d-flex flex-column " :style="{ top: toolbarTopOffset, transform: 'none' }">
          <button
            v-for="layer in layers"
            :key="layer.id"
            class="toolbar-btn"
            :class="{ active: activeLayers.includes(layer.id) }"
            @click="toggleLayer(layer.id)"
            @mouseenter="hoveredLayer = layer.id"
            @mouseleave="hoveredLayer = null"
          >
            <i :class="layer.icon"></i>
            <transition name="tooltip-fade">
              <span v-if="hoveredLayer === layer.id" class="toolbar-tooltip">{{ layer.label }}</span>
            </transition>
          </button>

          <button
            class="toolbar-btn"
            :class="{ active: isAddingDataCenter }"
            @click="toggleAddingMode"
            @mouseenter="hoveredLayer = 'adddc'"
            @mouseleave="hoveredLayer = null"
          >
            <i :class="isAddingDataCenter ? 'bi bi-x-lg' : 'bi bi-plus-lg'"></i>
            <transition name="tooltip-fade">
              <span v-if="hoveredLayer === 'adddc'" class="toolbar-tooltip">{{ isAddingDataCenter ? 'Cancel Placement' : 'Add Data Center' }}</span>
            </transition>
          </button>

          <button
            class="toolbar-btn"
            :class="{ active: currentMode === 'comparison' }"
            @click="toggleComparisonMode"
            @mouseenter="hoveredLayer = 'comparison'"
            @mouseleave="hoveredLayer = null"
          >
            <i class="bi bi-layout-split"></i>
            <transition name="tooltip-fade">
              <span v-if="hoveredLayer === 'comparison'" class="toolbar-tooltip">Compare Demographics & Infrastructure</span>
            </transition>
          </button>

          <button
            class="toolbar-btn"
            :class="{ active: currentMode === 'home' }"
            @click="toggleHomeMode"
            @mouseenter="hoveredLayer = 'home'"
            @mouseleave="hoveredLayer = null"
          >
            <i class="bi bi-house-door"></i>
            <transition name="tooltip-fade">
              <span v-if="hoveredLayer === 'home'" class="toolbar-tooltip">Inspect Individual House Value</span>
            </transition>
          </button>
        </div>
      </div>

      <!-- Comparison Panel -->
      <transition name="slide-panel">
        <div
          v-if="currentMode === 'comparison'"
          class="comparison-panel-wrapper"
        >
          <ComparisonPanel
            :region-a="comparisonStats.regionA"
            :region-b="comparisonStats.regionB"
          />
        </div>
      </transition>

      <!-- Home Panel -->
      <transition name="slide-panel">
        <div
          v-if="currentMode === 'home'"
          class="comparison-panel-wrapper"
        >
          <HomePanel
            :home-data="selectedHomeData"
          />
        </div>
      </transition>



    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from "vue";
import Sidebar from "./components/Sidebar.vue";
import BaseMap from "./components/BaseMap.vue";
import ComparisonPanel from "./components/ComparisonPanel.vue";
import HomePanel from "./components/HomePanel.vue";

const activeLayers = ref(["heatmap"]);
const hoveredLayer = ref(null);
const isSidebarOpen = ref(true);

const isAddingDataCenter = ref(false);
const hoveringAddButton = ref(false);

const titleCardRef = ref(null);
const toolbarTopOffset = ref('120px');

const lastUpdatedDate = ref(new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'long' }));

const currentMode = ref('default');

const comparisonStats = ref({ regionA: null, regionB: null });
const selectedHomeData = ref(null);

function onStatsUpdated(stats) {
  comparisonStats.value = stats;
}

function toggleComparisonMode() {
  currentMode.value = currentMode.value === 'comparison' ? 'default' : 'comparison';
  if (currentMode.value === 'comparison') {
    if (!activeLayers.value.includes('choropleth')) {
      activeLayers.value.push('choropleth');
    }
  } else {
    comparisonStats.value = { regionA: null, regionB: null };
    activeLayers.value = activeLayers.value.filter(l => l !== 'choropleth');
  }
}

function toggleAddingMode() {
  isAddingDataCenter.value = !isAddingDataCenter.value;
  syncHeatmapLayer();
}

function exitAddingMode(success) {
  isAddingDataCenter.value = false;
  // If we successfully added a point, keep the heatmap on so the user sees the result.
  // Otherwise (cancel), hide it.
  if (!success) {
    activeLayers.value = activeLayers.value.filter(l => l !== 'heatmap');
  }
}

function syncHeatmapLayer() {
  if (isAddingDataCenter.value) {
    if (!activeLayers.value.includes('heatmap')) {
      activeLayers.value.push('heatmap');
    }
  } else {
    activeLayers.value = activeLayers.value.filter(l => l !== 'heatmap');
  }
}

function toggleHomeMode() {
  currentMode.value = currentMode.value === 'home' ? 'default' : 'home';
  if (currentMode.value !== 'home') {
    selectedHomeData.value = null;
  }
}

function onHomeSelected(data) {
  selectedHomeData.value = data;
}

function updateTime() {
  lastUpdatedDate.value = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'long' });
}

onMounted(() => {
  const resizeObserver = new ResizeObserver((entries) => {
    for (let entry of entries) {
      if (entry.borderBoxSize && entry.borderBoxSize[0]) {
        toolbarTopOffset.value = `${entry.borderBoxSize[0].blockSize + 16}px`;
      } else if (entry.contentRect) {
        // Fallback for older browsers
        toolbarTopOffset.value = `${entry.contentRect.height + 16}px`;
      }
    }
  });
  if (titleCardRef.value) {
    resizeObserver.observe(titleCardRef.value);
  }
});

const layers = [
  { id: "heatmap",    icon: "bi bi-fire",     label: "Toggle Thermal Reachability Heatmap" },
  { id: "choropleth", icon: "bi bi-map",      label: "Toggle Demographic Choropleth Map" }
];

function toggleLayer(view) {
  if (activeLayers.value.includes(view)) {
    activeLayers.value = activeLayers.value.filter(l => l !== view);
  } else {
    activeLayers.value.push(view);
  }
}
</script>

<style scoped>
.dashboard-shell {
  min-height: 100vh;
  background: #f5f6f8;
}

.sidebar-toggle-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  border: none;
  background-color: rgba(255, 255, 255, 0.85);
  color: #6c757d;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.sidebar-toggle-btn:hover {
  background-color: #2b00b0;
  color: #ffffff;
}

.layer-toolbar {
  position: absolute;
  left: 0;
  width: 48px;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
  z-index: 20;
  padding: 0;
  align-items: stretch;
}

.layer-toolbar > .toolbar-btn:first-child {
  border-radius: 12px 12px 0 0;
}

.layer-toolbar > .toolbar-btn:last-child {
  border-radius: 0 0 12px 12px;
}

/* CHANGED: default button is dark icon on white */
.toolbar-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 1.25rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.toolbar-btn:hover {
  background: #f3f4f6;
  color: #2b00b0;
}

/* CHANGED: active = purple background, white icon */
.toolbar-btn.active {
  background: #2b00b0;
  color: #ffffff;
}


.add-dc-btn {
  position: relative;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #2b00b0;
  color: #ffffff;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  cursor: pointer;
  transition: transform 0.2s, background 0.2s;
}
.add-dc-btn:hover {
  transform: scale(1.05);
  background: #3c00f0;
}
.add-dc-btn.active-add {
  background: #e90000;
}
.add-dc-btn.active-add:hover {
  background: #ff1c1c;
}

.add-tooltip {
  position: absolute;
  bottom: calc(100% + 12px);
  left: 50%;
  transform: translateX(-50%);
  background: #ffffff;
  color: #1d1d1d;
  font-size: 13px;
  font-weight: 400;
  padding: 6px 12px;
  border-radius: 4px;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  font-family: var(--sans);
}
.add-tooltip::after {
  content: "";
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 5px;
  border-style: solid;
  border-color: #ffffff transparent transparent transparent;
}

.toolbar-tooltip {
  position: absolute;
  left: calc(100% + 12px);
  top: 50%;
  transform: translateY(-50%);
  background: #ffffff;
  color: #1a1a1a;
  font-size: 13px;
  font-weight: 400;
  padding: 6px 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-family: var(--sans);
}

.toolbar-tooltip::before {
  content: "";
  position: absolute;
  top: 50%;
  right: 100%;
  transform: translateY(-50%);
  border-width: 5px 5px 5px 0;
  border-style: solid;
  border-color: transparent #ffffff transparent transparent;
}

.tooltip-fade-enter-active,
.tooltip-fade-leave-active {
  transition: opacity 0.12s ease;
}
.tooltip-fade-enter-from,
.tooltip-fade-leave-to {
  opacity: 0;
}

.sidebar-wrapper {
  width: 360px;
  flex-shrink: 0;
  transition: margin-left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  margin-left: 0;
}

.sidebar-wrapper.collapsed {
  margin-left: -392px; 
}

.fade-btn-enter-active,
.fade-btn-leave-active {
  transition: opacity 0.3s ease;
}
.fade-btn-enter-from,
.fade-btn-leave-to {
  opacity: 0;
}

.comparison-panel-wrapper {
  position: absolute;
  top: 130px;
  right: 12px;
  width: 300px;
  max-height: calc(100vh - 24px);
  background: #ffffff;
  border-radius: 14px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.slide-panel-enter-active,
.slide-panel-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
}
.slide-panel-enter-from,
.slide-panel-leave-to {
  transform: translateX(20px);
  opacity: 0;
}
</style>