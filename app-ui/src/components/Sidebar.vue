<template>
  <div class="sidebar-panel pt-1 ps-3 pe-3 d-flex flex-column" style="max-height: 47vh;">

    <div v-if="activeLayers.length === 0" class="mt-4 mb-4 text-center text-secondary" style="font-weight: 200;">
      Toggle a map layer to view its details.
    </div>
    
    <div v-for="(layerInfo, index) in activeLayerInfos" :key="layerInfo.id" 
         class="layer-info-block mb-4 pb-3"
         :class="{ 'border-bottom': index !== activeLayerInfos.length - 1 }">
      <!-- Dynamic Layer Info Section -->
      <div class="mb-1 mt-4">
        <h5 class="text-dark d-flex align-items-center" style="font-size: 1.25rem;">
          <i :class="layerInfo.icon" class="me-2" style="font-size: 1.4rem;  color: #2b00b0;"></i>
          {{ layerInfo.title }}
        </h5>
      </div>

      <!-- Summary Section -->
      <div class="mb-4">
        <h6 class="section-title fs-7 mb-2">Summary</h6>
        <div class="text-secondary lh-sm" style="font-size: 0.95rem; font-weight: 200;">
          {{ layerInfo.subtext }}
        </div>
      </div>

      <!-- Details Section -->
      <div class="flex-grow-1">
        <h6 class="section-title fs-7 mb-2">Details</h6>
        <ul class="list-unstyled detail-list m-0" style="font-size: 0.80rem;">
          <li class="d-flex align-items-start mb-2">
            <i class="bi bi-info-circle fs-4 text-secondary me-3 mt-0"></i>
            <div>
              <div class="detail-label">{{ lastUpdatedDate }}</div>
              <div class="text-secondary small" style="font-weight: 200;">Info Updated</div>
            </div>
          </li>
          <li class="d-flex align-items-start mb-2">
            <i class="bi bi-clock-history fs-4 text-secondary me-3 mt-0"></i>
            <div>
              <div class="detail-label">October 28, 2021 at 6:12:36 PM PDT</div>
              <div class="text-secondary small" style="font-weight: 200;">Data Updated</div>
            </div>
          </li>
          <li class="d-flex align-items-start mb-2">
            <i class="bi bi-calendar3 fs-4 text-secondary me-3 mt-0"></i>
            <div>
              <div class="detail-label">October 28, 2021 at 1:47:17 AM PDT</div>
              <div class="text-secondary small" style="font-weight: 200;">Published Date</div>
            </div>
          </li>
          <li class="d-flex align-items-start">
            <i class="bi bi-table fs-4 text-secondary me-3 mt-0"></i>
            <div>
              <div class="detail-label">Records: {{ layerInfo.records }}</div>
              <div class="small"><a :href="layerInfo.source" target="_blank" class="detail-link" style="font-weight: 200;">View data table</a></div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  activeLayers: {
    type: Array,
    default: () => ["heatmap"],
  },
  lastUpdatedDate: {
    type: String,
    required: true
  }
});

const LAYER_REGISTRY = {
  heatmap: { 
    id: 'heatmap',
    title: 'Ambient Temperature Impact', 
    icon: 'bi bi-fire',
    subtext: 'Estimated thermal increase across the Santa Clara County network from Silicon Valley facilities.',
    records: 154,
    source: 'https://www.epa.gov/climate-indicators/climate-change-indicators-air-temperature'
  },
  choropleth: { 
    id: 'choropleth',
    title: 'Demographic Choropleth', 
    icon: 'bi bi-map',
    subtext: 'Bivariate choropleth mapping using ACS (American Community Survey) median household income and CDC SVI (Social Vulnerability Index) datasets.',
    records: 398,
    source: 'https://www.epa.gov/climate-indicators/climate-change-indicators-air-temperature'
  }
};

const activeLayerInfos = computed(() => {
  return props.activeLayers.map(layerId => LAYER_REGISTRY[layerId]).filter(Boolean);
});
</script>

<style scoped>
.sidebar-panel {
    background: #ffffffff;
}

.sidebar-panel::-webkit-scrollbar {
  width: 6px;
}
.sidebar-panel::-webkit-scrollbar-thumb {
  background: #1f4082ff;
  border-radius: 10px;
}
.sidebar-panel::-webkit-scrollbar-track {
  background: transparent;
}

.section-title {
  font-weight: 400;
  color: #111827;
}

.detail-label {
    font-weight: 400;
    font-size: 0.9rem;
    color: #212529;
    margin-bottom: 2px;
}

.detail-action-btn {
  background-color: #3100c4;
  border-color: #3100c4;
  padding: 8px 0;
  font-weight: 500;
}
.detail-action-btn:hover {
  background-color: #260099;
  border-color: #260099;
}

.detail-action-btn-outline {
  border-color: #3100c4;
  color: #3100c4;
  padding: 9px 0;
  font-weight: 500;
}
.detail-action-btn-outline:hover {
  background-color: #f3f0ff;
  color: #3100c4;
  border-color: #3100c4;
}

.detail-link {
  color: #3100c4;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.detail-link:hover {
  color: #260099;
}

button.active {
  background-color: #111827;
  color: #ffffff;
  border-color: #111827;
}
</style>