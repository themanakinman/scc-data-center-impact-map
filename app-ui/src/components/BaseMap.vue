<template>
  <div class="map-panel">
    <div class="map-stage">
      <!-- Loading Overlay -->
      <div v-if="isRecalculating" class="position-absolute top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center" style="z-index: 50; background: rgba(255,255,255,.1); backdrop-filter: blur(5px);">
         <div class="spinner-border text-primary mb-3" role="status" style="width: 2rem; height: 2rem;"></div>
      </div>

      <div ref="mapContainer" class="map-container" :class="{ 'is-adding-mode': isAddingMode }"></div>

      <!-- STEP 2: Region A / B switcher — only visible in comparison mode -->
      <transition name="fade">
        <div v-if="mode === 'comparison'" class="region-switcher">
          <button
            class="region-btn"
            :class="{ active: activeRegion === 'A' }"
            @click="activeRegion = 'A'"
          >
            <span class="region-dot dot-a"></span> Region A
          </button>
          <button
            class="region-btn"
            :class="{ active: activeRegion === 'B' }"
            @click="activeRegion = 'B'"
          >
            <span class="region-dot dot-b"></span> Region B
          </button>
          <button class="region-btn reset-btn" @click="resetSelection">
            Reset
          </button>
        </div>
      </transition>
      <!-- END STEP 2 -->

      <!-- Legends -->
      <transition name="fade">
        <div v-show="activeLayers.includes('choropleth')" class="bivariate-legend mt-3 mb-3">
          <div class="legend-title">Income × Vulnerability</div>
          <div class="legend-grid">
            <div class="corner-label empty"></div>
            <div class="axis-label top">Low Income</div>
            <div class="axis-label top">High Income</div>
            
            <div class="axis-label left">Low Vulnerability</div>
            <div class="legend-cell low_low"></div>
            <div class="legend-cell high_low"></div>
            
            <div class="axis-label left">High Vulnerability</div>
            <div class="legend-cell low_high"></div>
            <div class="legend-cell high_high"></div>
          </div>
          <div class="legend-note">Colors combine income and vulnerability levels.</div>
        </div>
      </transition>

      <transition name="fade">
        <div v-show="activeLayers.includes('heatmap')" class="reachability-legend">
          <div class="legend-title">Ambient Temperature (°F)</div>
          <div class="legend-scale">
            <span class="color-box" style="background: #e90000;"></span> +4.0
            <span class="color-box" style="background: #e46c15; margin-left: 8px;"></span> +3.0
            <span class="color-box" style="background: #5d73d6; margin-left: 8px;"></span> +2.0
            <span class="color-box" style="background: #becfeeff; margin-left: 8px;"></span> +1.0
          </div>
          <div class="legend-note" style="margin-top: 6px; font-size: 11px; color: #6b7280;">
            Estimated overlapping temperature effect.
          </div>
        </div>
      </transition>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, shallowRef, watch } from 'vue';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Papa from "papaparse";

import geoDataRaw from "../data/santa_clara_tracts.geojson?raw";
import incomeCSVRaw from "../data/santa_clara_income_clean.csv?raw";
import sviCSVRaw from "../data/santa_clara_svi_clean.csv?raw";
import dcUrl from "../data/silicon_valley_data_centers.geojson?url";

import {
  normalizeGEOID,
  parseCsvToMap,
  medianThreshold,
  bucket2,
  computeRegionStats,           // STEP 2: new import
} from "../utils/dataHelpers";

import {
  isSantaClaraTractLikeFeature,
  getDataCentersInRegion,       // STEP 2: new import
} from "../utils/geoHelpers";

import { globalMapState } from '../utils/mapState';

const props = defineProps({
  activeLayers: {
    type: Array,
    required: true,
  },
  isAddingMode: {
    type: Boolean,
    default: false
  },
  mode: {
    type: String,
    default: 'default'
  }
});

const emit = defineEmits(['exit-adding-mode', 'map-data-updated', 'comparison-stats-updated', 'home-selected']);

const mapContainer = ref(null);
const map = shallowRef(null);
const showChoropleth = ref(true);
const isRecalculating = ref(false);

const geoData = JSON.parse(geoDataRaw);

const incomeMap = parseCsvToMap(incomeCSVRaw, "GEOID", "income", Papa);
const vulnerabilityMap = parseCsvToMap(sviCSVRaw, "GEOID", "vulnerability", Papa);

// ---------------------------------------------------------------------------
// STEP 2: Region selection state
// ---------------------------------------------------------------------------

// Which region the user is currently painting: 'A' or 'B'
const activeRegion = ref('A');

// One Set per region — stores raw GEOID strings (e.g. "06085501100")
const selectedTracts = ref({ A: new Set(), B: new Set() });

// Module-level ref to data-centers GeoJSON, updated whenever the data changes.
// Plain variable (not reactive) — only needed for stat calculation inside handlers.
let dataCentersGeoJSONRef = { type: 'FeatureCollection', features: [] };

// Selection highlight colours
const REGION_COLORS = { A: '#10B981', B: '#8B5CF6' };

// Lookup: GEOID string → MapLibre numeric feature id (populated on map idle)
const tractIdMap = {};

/**
 * Compute stats for both regions and emit to App.vue.
 * Called after every selection change.
 */
function emitStats() {
  const dcA = getDataCentersInRegion(selectedTracts.value.A, geoData, dataCentersGeoJSONRef);
  const dcB = getDataCentersInRegion(selectedTracts.value.B, geoData, dataCentersGeoJSONRef);

  emit('comparison-stats-updated', {
    regionA: computeRegionStats(selectedTracts.value.A, incomeMap, vulnerabilityMap, dcA),
    regionB: computeRegionStats(selectedTracts.value.B, incomeMap, vulnerabilityMap, dcB),
  });
}

/**
 * Toggle a tract in/out of the active region's Set, update the map highlight,
 * then recompute stats.
 */
function handleComparisonClick(geoid, numericId) {
  const region  = activeRegion.value;
  const current = selectedTracts.value[region];

  if (current.has(geoid)) {
    current.delete(geoid);
    map.value.setFeatureState(
      { source: 'choropleth-source', id: numericId },
      { selectedRegion: null }
    );
  } else {
    current.add(geoid);
    map.value.setFeatureState(
      { source: 'choropleth-source', id: numericId },
      { selectedRegion: region }
    );
  }

  // Trigger Vue reactivity by replacing the wrapper object
  selectedTracts.value = { ...selectedTracts.value };
  emitStats();
}

/**
 * Clear all selections from both regions and reset map feature states.
 */
function resetSelection() {
  if (!map.value) return;

  ['A', 'B'].forEach((region) => {
    selectedTracts.value[region].forEach((geoid) => {
      const numericId = tractIdMap[geoid];
      if (numericId != null) {
        map.value.setFeatureState(
          { source: 'choropleth-source', id: numericId },
          { selectedRegion: null }
        );
      }
    });
  });

  selectedTracts.value = { A: new Set(), B: new Set() };
  emitStats();
}

// END STEP 2 state
// ---------------------------------------------------------------------------

/**
 * Ray-casting point-in-polygon test.
 * @param {[number,number]} point  [lng, lat]
 * @param {number[][][]}    ring   Array of coordinate rings (ring[0] = outer)
 * @returns {boolean}
 */
function pointInPolygon(point, rings) {
  const [x, y] = point;
  const ring = rings[0]; // outer ring
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute the centroid of a polygon ring (array of [lng,lat] pairs).
 */
function ringCentroid(ring) {
  let sumX = 0, sumY = 0;
  // skip the duplicate closing coordinate
  const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]
    ? ring.length - 1
    : ring.length;
  for (let i = 0; i < n; i++) {
    sumX += ring[i][0];
    sumY += ring[i][1];
  }
  return [sumX / n, sumY / n];
}

/**
 * Given a raw geometry (Polygon or MultiPolygon) and a cursor [lng, lat],
 * return a Polygon geometry covering only the single sub-polygon under the cursor.
 * Falls back to the nearest sub-polygon by centroid distance when the cursor
 * lands exactly on an edge and the ray-casting test has no match.
 */
function isolatePolygonUnderCursor(geometry, lngLat) {
  if (geometry.type === 'Polygon') return geometry;
  if (geometry.type !== 'MultiPolygon') return geometry;

  // 1. Try exact point-in-polygon
  for (const coords of geometry.coordinates) {
    if (pointInPolygon(lngLat, coords)) {
      return { type: 'Polygon', coordinates: coords };
    }
  }

  // 2. Fallback: pick the sub-polygon whose centroid is closest to cursor
  let bestDist = Infinity;
  let bestCoords = geometry.coordinates[0];
  for (const coords of geometry.coordinates) {
    const c = ringCentroid(coords[0]); // outer ring
    const d = (c[0] - lngLat[0]) ** 2 + (c[1] - lngLat[1]) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestCoords = coords;
    }
  }
  return { type: 'Polygon', coordinates: bestCoords };
}

function prepareChoroplethData(data) {
  const cloned = structuredClone(data);
  const filteredFeatures = cloned.features.filter(isSantaClaraTractLikeFeature);
  cloned.features = filteredFeatures.length > 0 ? filteredFeatures : cloned.features;

  cloned.features.forEach((feature, index) => {
    if (!feature.properties) feature.properties = {};
    if (typeof feature.properties.name !== "string") {
      feature.properties.name = feature.properties.NAMELSAD || feature.properties.NAME || `Area ${index + 1}`;
    }

    const geoid = normalizeGEOID(feature.properties.GEOID || "");
    const incomeFromCsv = incomeMap[geoid];
    const vulnerabilityFromCsv = vulnerabilityMap[geoid];

    feature.properties.income = Number.isFinite(incomeFromCsv) ? incomeFromCsv : 60000;
    feature.properties.vulnerability = Number.isFinite(vulnerabilityFromCsv) ? vulnerabilityFromCsv : 0.5;
  });

  const incomes = cloned.features.map((f) => f.properties.income);
  const vulnerabilities = cloned.features.map((f) => f.properties.vulnerability * 100);

  const incomeThreshold = medianThreshold(incomes);
  const vulnerabilityThreshold = medianThreshold(vulnerabilities);

  cloned.features.forEach((feature) => {
    const incomeBucket = bucket2(feature.properties.income, incomeThreshold);
    const vulnerabilityBucket = bucket2(feature.properties.vulnerability * 100, vulnerabilityThreshold);

    feature.properties.incomeBucket = incomeBucket;
    feature.properties.vulnerabilityBucket = vulnerabilityBucket;
    feature.properties.bivariateKey = `${incomeBucket}_${vulnerabilityBucket}`;
  });

  return cloned;
}

function formatIncome(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${Math.round(num).toLocaleString()}`;
}

function updateLayerVisibility() {
  if (!map.value) return;

  const isHeatmapActive = props.activeLayers.includes('heatmap');
  const isChoroplethActive = props.activeLayers.includes('choropleth');

  if (map.value.getLayer('reachability-lines')) {
    map.value.setLayoutProperty('reachability-lines', 'visibility', isHeatmapActive ? 'visible' : 'none');
  }

  if (map.value.getLayer('choropleth-fill')) {
    map.value.setLayoutProperty('choropleth-fill', 'visibility', isChoroplethActive ? 'visible' : 'none');
    map.value.setLayoutProperty('choropleth-outline', 'visibility', isChoroplethActive ? 'visible' : 'none');
    
    if (isChoroplethActive) {
       map.value.setPaintProperty('choropleth-fill', 'fill-opacity', isHeatmapActive ? 0.4 : 0.8);
    }
  }
}

watch(() => props.activeLayers, () => {
  updateLayerVisibility();
}, { deep: true });

watch(() => props.isAddingMode, (newVal) => {
  if (map.value && map.value.getCanvas()) {
    map.value.getCanvas().style.cursor = newVal ? 'crosshair' : '';
  }
});

// STEP 2: when leaving comparison mode, wipe the selection cleanly
watch(() => props.mode, (newMode) => {
  if (newMode !== 'comparison') {
    resetSelection();
  }
});

onMounted(() => {
  map.value = new maplibregl.Map({
    container: mapContainer.value,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: globalMapState.center,
    zoom: globalMapState.zoom, 
    pitch: globalMapState.pitch, 
    bearing: globalMapState.bearing,
    attributionControl: false
  });

  map.value.on('moveend', () => {
    globalMapState.center = map.value.getCenter().toArray();
    globalMapState.zoom = map.value.getZoom();
    globalMapState.pitch = map.value.getPitch();
    globalMapState.bearing = map.value.getBearing();
  });
  
  map.value.addControl(new maplibregl.NavigationControl(), "top-right");
  map.value.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");

  map.value.on('load', () => {
    // 1. ADD CHOROPLETH SOURCE
    // STEP 2: generateId:true is required for setFeatureState to work.
    const choroplethData = prepareChoroplethData(geoData);
    map.value.addSource("choropleth-source", {
      type: "geojson",
      data: choroplethData,
      generateId: true,   // STEP 2 addition — do not remove
    });

    // STEP 2: Build GEOID → numeric id lookup once the source is rendered.
    // querySourceFeatures only works after the map has had an idle cycle.
    map.value.once('idle', () => {
      const features = map.value.querySourceFeatures('choropleth-source');
      features.forEach((f) => {
        const geoid = f.properties?.GEOID;
        if (geoid && f.id != null) {
          tractIdMap[geoid] = f.id;
        }
      });
    });

    // STEP 2: fill-color uses a 'case' expression that checks feature-state
    // first, then falls back to the original bivariate choropleth match.
    map.value.addLayer({
      id: "choropleth-fill",
      type: "fill",
      source: "choropleth-source",
      paint: {
        "fill-color": [
          "case",
          ["==", ["feature-state", "selectedRegion"], "A"], REGION_COLORS.A,
          ["==", ["feature-state", "selectedRegion"], "B"], REGION_COLORS.B,
          [
            "match",
            ["get", "bivariateKey"],
            "low_low",   "#fb923c",
            "low_high",  "#dc2626",
            "high_low",  "#93c5fd",
            "high_high", "#1e40af",
            "#cccccc",
          ],
        ],
        "fill-opacity": 0.8,
      },
      layout: { visibility: 'none' }
    });

    map.value.addLayer({
      id: "choropleth-outline",
      type: "line",
      source: "choropleth-source",
      paint: {
        "line-color": "#ffffff",
        "line-width": 1.2,
      },
      layout: { visibility: 'none' }
    });

    // 2. ADD REACHABILITY SOURCE (HEATMAP) — unchanged
    const base = import.meta.env.BASE_URL.endsWith('/') 
      ? import.meta.env.BASE_URL.slice(0, -1) 
      : import.meta.env.BASE_URL;

    const heatUrl = import.meta.env.PROD 
      ? `${base}/santa_clara_reachability.geojson?t=${Date.now()}` 
      : `/api/reachability?t=${Date.now()}`;
    map.value.addSource('reachability-source', {
      type: 'geojson',
      data: heatUrl
    });

    map.value.addLayer({
      id: 'reachability-lines',
      type: 'line',
      source: 'reachability-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round',
        'visibility': 'none'
      },
      paint: {
        'line-width': [
            'interpolate', ['linear'], ['zoom'],
            8, 1,
            12, 3,
            16, 6
        ],
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'temperature'],
          1.0, '#becfeeff',
          2.0, '#5d73d6ff',
          3.0, '#e46c15ff',
          4.0, '#e90000ff'
        ],
        'line-opacity': 0.85
      }
    }); 

    // 3. ADD DATA CENTERS
    let dataCentersGeoJSON = { type: 'FeatureCollection', features: [] };
    
    fetch(dcUrl).then(r => r.json()).then(data => {
      dataCentersGeoJSON = data;
      dataCentersGeoJSONRef = data;  // STEP 2: keep module-level ref in sync
      if (map.value.getSource('data-centers-source')) {
        map.value.getSource('data-centers-source').setData(dataCentersGeoJSON);
      }
    });

    map.value.addSource('data-centers-source', {
      type: 'geojson',
      data: dataCentersGeoJSON
    });

    map.value.addLayer({
      id: 'data-centers-glow',
      type: 'circle',
      source: 'data-centers-source',
      paint: {
        'circle-radius': 2,
        'circle-color': '#f97316',
        'circle-opacity': 0.1,
        'circle-blur': 0.1
      }
    });

    map.value.addLayer({
      id: 'data-centers-layer',
      type: 'circle',
      source: 'data-centers-source',
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#606775'
      }
    });

    // HOVER BUILDING SOURCE — used to highlight buildings in 'home' mode
    map.value.addSource('hovered-building-source', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] }
    });

    map.value.addLayer({
      id: 'hovered-building-fill',
      type: 'fill',
      source: 'hovered-building-source',
      paint: {
        'fill-color': 'transparent',
        'fill-opacity': 0.8
      }
    });

    map.value.addLayer({
      id: 'hovered-building-outline',
      type: 'line',
      source: 'hovered-building-source',
      paint: {
        'line-color': '#2A15B0',
        'line-width': 2
      }
    });

    // CLICK HANDLER FOR CHOROPLETH
    map.value.on("click", "choropleth-fill", (e) => {
      if (props.isAddingMode) return;
      if (!props.activeLayers.includes('choropleth')) return;

      // STEP 2: in comparison mode, run selection logic instead of popup
      if (props.mode === 'comparison') {
        const feature = e.features?.[0];
        if (!feature) return;

        const geoid     = feature.properties?.GEOID;
        const numericId = feature.id;  // MapLibre provides this via generateId:true

        if (!geoid || numericId == null) return;

        // Also store in lookup in case idle query ran before data was ready
        if (tractIdMap[geoid] == null) tractIdMap[geoid] = numericId;

        handleComparisonClick(geoid, numericId);
        return;
      }

      // Default mode — show popup (unchanged)
      const feature = e.features?.[0];
      if (!feature) return;

      const propsInfo = feature.properties || {};
      const tract = propsInfo.TRACTCE || propsInfo.NAME || "Unknown";
      const city = propsInfo.city || "Santa Clara";
      const popupHtml = `
        <strong>${city} (Tract ${tract})</strong><br/>
        Income: ${formatIncome(propsInfo.income)} <span style="opacity:0.8">(${propsInfo.incomeBucket})</span><br/>
        Vulnerability: ${Number(propsInfo.vulnerability).toFixed(2)} <span style="opacity:0.8">(${propsInfo.vulnerabilityBucket})</span><br/>
        Bivariate class: ${propsInfo.bivariateKey}
      `;
      new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(popupHtml)
        .addTo(map.value);
    });

    // HOVER FOR DATA CENTERS — unchanged
    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12
    });

    map.value.on('mouseenter', 'data-centers-layer', (e) => {
      if (deleteDcPopup && deleteDcPopup.isOpen()) return;
      map.value.getCanvas().style.cursor = 'pointer';
      const feature = e.features[0];
      const coordinates = feature.geometry.coordinates.slice();
      const p = feature.properties;
      
      const html = `
        <div style="font-family: inherit; font-size: 13px; min-width: 150px;">
          <div style="font-weight: 400; color: #111827; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb;">
            ${p.name || 'Data Center'}
          </div>
          ${p.it_load_mw ? `<div style="color: #dc2626; margin-top: 6px; font-weight: 400;">Load: ${p.it_load_mw} MW</div>` : ''}
        </div>
      `;

      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }
      hoverPopup.setLngLat(coordinates).setHTML(html).addTo(map.value);
    });

    map.value.on('mouseleave', 'data-centers-layer', () => {
      map.value.getCanvas().style.cursor = '';
      hoverPopup.remove();
    });

    let deleteDcPopup = null;

    map.value.on('click', 'data-centers-layer', async (e) => {
      if (props.isAddingMode) return;
      if (deleteDcPopup) deleteDcPopup.remove();
      hoverPopup.remove();

      const feature = e.features[0];
      const name = feature.properties.name || 'Data Center';
      const c = feature.geometry.coordinates;

      const formHtml = `
        <div style="font-family: inherit; font-size: 13px; padding: 4px; text-align: center;">
          <div style="font-weight: 300; margin-bottom: 12px; color: #111827;"><b>Delete</b> ${name}?</div>
          <div style="display: flex; gap: 8px;">
            <button id="confirm-delete-btn" style="flex: 1; background: #dc2626; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-weight: 400;">Yes</button>
            <button id="cancel-delete-btn" style="flex: 1; background: #f3f4f6; color: #374151; border: 1px solid #d1d5db; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-weight: 200;">No</button>
          </div>
        </div>
      `;

      deleteDcPopup = new maplibregl.Popup({ closeButton: false, offset: 12, className: 'delete-dc-popup' })
        .setLngLat(c)
        .setHTML(formHtml)
        .addTo(map.value);

      setTimeout(() => {
        document.getElementById('cancel-delete-btn').onclick = () => {
           deleteDcPopup.remove();
        };

        document.getElementById('confirm-delete-btn').onclick = async () => {
          deleteDcPopup.remove();

          if (import.meta.env.PROD) {
            dataCentersGeoJSON.features = dataCentersGeoJSON.features.filter(f => 
                !(Math.abs(f.geometry.coordinates[0] - c[0]) < 0.001 && 
                  Math.abs(f.geometry.coordinates[1] - c[1]) < 0.001)
            );
            dataCentersGeoJSONRef = dataCentersGeoJSON;
            if (map.value.getSource('data-centers-source')) {
              map.value.getSource('data-centers-source').setData(dataCentersGeoJSON);
            }
            alert("Static Preview: Facility deleted successfully. Heatmap recalculation is not supported safely on the static Github Pages preview.");
            emit('map-data-updated');
            return;
          }

          isRecalculating.value = true;
          try {
             const rsp = await fetch('/api/delete-datacenter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ coordinates: c })
             });
             if (!rsp.ok) {
                 const errText = await rsp.text();
                 throw new Error(`Server returned ${rsp.status}: ${errText}`);
             }
             
             dataCentersGeoJSON.features = dataCentersGeoJSON.features.filter(f => 
                 !(Math.abs(f.geometry.coordinates[0] - c[0]) < 0.001 && 
                   Math.abs(f.geometry.coordinates[1] - c[1]) < 0.001)
             );
             dataCentersGeoJSONRef = dataCentersGeoJSON;
             if (map.value.getSource('data-centers-source')) {
               map.value.getSource('data-centers-source').setData(dataCentersGeoJSON);
             }

             const newHeatUrl = import.meta.env.PROD 
               ? `${import.meta.env.BASE_URL}santa_clara_reachability.geojson?t=${Date.now()}` 
               : `/api/reachability?t=${Date.now()}`;
             const r = await fetch(newHeatUrl);
             if (!r.ok) throw new Error("Could not fetch new reachability layer.");
             const heatData = await r.json();
             if (map.value.getSource('reachability-source')) {
               map.value.getSource('reachability-source').setData(heatData);
             }
             emit('map-data-updated');
          } catch (err) {
             console.error("Failed to delete data center and recompute heatmap", err);
             alert("Error modifying map layer: " + err.message);
          } finally {
             isRecalculating.value = false;
          }
        };
      }, 10);
    });
    
    map.value.on("mouseenter", "choropleth-fill", () => {
      // STEP 2: crosshair cursor in comparison mode signals "click to select"
      if (props.mode === 'comparison') {
        map.value.getCanvas().style.cursor = 'crosshair';
        return;
      }
      if (props.activeLayers.includes('choropleth') && !props.isAddingMode) {
        map.value.getCanvas().style.cursor = "pointer";
      }
    });

    map.value.on("mouseleave", "choropleth-fill", () => {
      if (props.mode === 'comparison') {
        map.value.getCanvas().style.cursor = '';
        return;
      }
      if (props.activeLayers.includes('choropleth') && !props.isAddingMode) {
         map.value.getCanvas().style.cursor = "";
      }
    });

    // ADD NEW DATA CENTER INTERACTION — unchanged
    let addDcPopup = null;

    map.value.on('mousemove', (e) => {
      if (props.mode === 'home') {
        const features = map.value.queryRenderedFeatures(e.point, { layers: ['building', 'building-top'] });
        const src = map.value.getSource('hovered-building-source');
        if (features && features.length > 0) {
          map.value.getCanvas().style.cursor = 'crosshair';
          // Deep-clone geometry and isolate the single polygon under cursor
          const rawGeom = JSON.parse(JSON.stringify(features[0].geometry));
          const isolatedGeom = isolatePolygonUnderCursor(rawGeom, [e.lngLat.lng, e.lngLat.lat]);
          const cleanFeature = {
            type: 'Feature',
            geometry: isolatedGeom,
            properties: {}
          };
          src.setData({ type: 'FeatureCollection', features: [cleanFeature] });
        } else {
          map.value.getCanvas().style.cursor = '';
          src.setData({ type: 'FeatureCollection', features: [] });
        }
      }
    });

    map.value.on('mouseout', () => {
      if (props.mode === 'home' && map.value.getSource('hovered-building-source')) {
        map.value.getSource('hovered-building-source').setData({ type: 'FeatureCollection', features: [] });
      }
    });

    map.value.on('click', (e) => {
      if (props.mode === 'home') {
        const features = map.value.queryRenderedFeatures(e.point, { layers: ['building', 'building-top'] });
        if (features && features.length > 0) {
          // Generate mock timeseries data for the clicked home (10 years of house prices)
          let currentPrice = 800000 + Math.random() * 1000000; // 
          const mockTimeseries = Array.from({ length: 10 }, (_, i) => {
            const year = new Date().getFullYear() - 9 + i;
            // House prices generally go up, with some random fluctuation
            const variance = (Math.random() - 0.2) * 50000;
            currentPrice += 40000 + variance; 
            return { time: year, value: currentPrice };
          });
          
          emit('home-selected', {
            id: features[0].id || Math.floor(Math.random() * 10000),
            timeseries: mockTimeseries
          });
        } else {
          // Clicked empty space
          emit('home-selected', null);
        }
        return;
      }

      if (!props.isAddingMode) return;
      
      if (addDcPopup) addDcPopup.remove();

      const formHtml = `
        <div style="font-family: inherit; min-width: 220px;">
          <div style="padding: 14px 16px 10px; border-bottom: 1px solid #f0f0f0;">
            <div style="font-size: 14px; font-weight: 600; color: #111827; display: flex; align-items: center; gap: 7px;">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="flex-shrink:0;"><path d="M8 1v14M1 8h14" stroke="#2b00b0" stroke-width="2" stroke-linecap="round"/></svg>
              Add Data Center
            </div>
          </div>
          <div style="padding: 12px 16px;">
            <label style="font-size: 11px; font-weight: 500; color: #6b7280; text-transform: uppercase; display: block; margin-bottom: 4px;">Facility Name</label>
            <input type="text" id="new-dc-name" placeholder="e.g. West Campus DC" style="width: 100%; padding: 8px 10px; margin-bottom: 10px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; font-size: 13px; font-weight: 400; color: #111827; transition: border-color 0.15s;" onfocus="this.style.borderColor='#2b00b0'" onblur="this.style.borderColor='#e5e7eb'" />
            <label style="font-size: 11px; font-weight: 500; color: #6b7280; text-transform: uppercase;  display: block; margin-bottom: 4px;">IT Load (MW)</label>
            <input type="number" id="new-dc-mw" placeholder="e.g. 50" style="width: 100%; padding: 8px 10px; margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 8px; outline: none; font-size: 13px; font-weight: 400; color: #111827; transition: border-color 0.15s;" onfocus="this.style.borderColor='#2b00b0'" onblur="this.style.borderColor='#e5e7eb'" />
            <div style="display: flex; gap: 8px;">
              <button id="save-dc-btn" style="flex: 1; background: #2b00b0; color: white; border: none; border-radius: 8px; padding: 9px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.15s;" onmouseover="this.style.background='#1e0080'" onmouseout="this.style.background='#2b00b0'">Save</button>
              <button id="cancel-dc-btn" style="flex: 1; background: transparent; color: #6b7280; border: none; border-radius: 8px; padding: 9px; cursor: pointer; font-size: 13px; font-weight: 500; transition: background 0.15s, color 0.15s;" onmouseover="this.style.background='#f3f4f6';this.style.color='#374151'" onmouseout="this.style.background='transparent';this.style.color='#6b7280'">Cancel</button>
            </div>
          </div>
        </div>
      `;

      addDcPopup = new maplibregl.Popup({ closeButton: false, offset: 12, className: 'panel-popup' })
        .setLngLat(e.lngLat)
        .setHTML(formHtml)
        .addTo(map.value);
          
      setTimeout(() => {
        const nameInputEl = document.getElementById('new-dc-name');
        const mwInputEl = document.getElementById('new-dc-mw');
        if (nameInputEl) nameInputEl.focus();

        document.getElementById('save-dc-btn').onclick = async () => {
          const nameVal = nameInputEl ? nameInputEl.value.trim() : "";
          const mwVal = mwInputEl ? mwInputEl.value : null;
          if (!mwVal) return;
          
          const newFeature = {
            type: "Feature",
            geometry: { type: "Point", coordinates: [e.lngLat.lng, e.lngLat.lat] },
            properties: { 
               name: nameVal || "Custom Facility", 
               it_load_mw: parseFloat(mwVal) 
            }
          };
          
          dataCentersGeoJSON.features.push(newFeature);
          dataCentersGeoJSONRef = dataCentersGeoJSON;
          map.value.getSource('data-centers-source').setData(dataCentersGeoJSON);
          
          addDcPopup.remove();
          emit('exit-adding-mode', true);

          if (import.meta.env.PROD) {
            alert("Static Preview: Data Center established. Ambient thermal routing arrays require the live Python server infrastructure, which is disabled in this static preview.");
            emit('map-data-updated');
            return;
          }

          isRecalculating.value = true;
          try {
            const rsp = await fetch('/api/save-datacenter', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify(newFeature)
            });
            if (!rsp.ok) {
                 const errText = await rsp.text();
                 throw new Error(`Server returned ${rsp.status}: ${errText}`);
            }
            
            const base = import.meta.env.BASE_URL.endsWith('/') 
              ? import.meta.env.BASE_URL.slice(0, -1) 
              : import.meta.env.BASE_URL;

            const newHeatUrl = import.meta.env.PROD 
               ? `${base}/santa_clara_reachability.geojson?t=${Date.now()}` 
               : `/api/reachability?t=${Date.now()}`;
            const r = await fetch(newHeatUrl);
            if (!r.ok) throw new Error("Could not fetch new reachability layer.");
            const heatData = await r.json();
            map.value.getSource('reachability-source').setData(heatData);
            emit('map-data-updated');
          } catch(err) {
            console.error("Failed to recompute heatmap", err);
            alert("Error modifying map layer: " + err.message);
          } finally {
            isRecalculating.value = false;
          }
        };

        document.getElementById('cancel-dc-btn').onclick = () => {
          addDcPopup.remove();
          emit('exit-adding-mode', false);
        };
      }, 10);
    });

    updateLayerVisibility();
  });
});

watch(() => props.isAddingMode, (val) => {
  if (map.value) {
    const canvas = map.value.getCanvas();
    if (canvas) {
      canvas.style.transition = 'filter 0.3s ease'
      canvas.style.filter = val ? 'brightness(.7) saturate(.7)' : 'none';
      
    }
  }
});

watch(() => props.mode, (val) => {
  if (map.value && map.value.getCanvas()) {
    if (val === 'home') {
      map.value.getCanvas().style.cursor = '';
    } else {
      if (map.value.getSource('hovered-building-source')) {
        map.value.getSource('hovered-building-source').setData({ type: 'FeatureCollection', features: [] });
      }
      if (!props.isAddingMode) {
        map.value.getCanvas().style.cursor = '';
      }
    }
  }
});

onBeforeUnmount(() => {
  if (map.value) {
    map.value.remove();
  }
});
</script>

<style scoped>
.map-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}

.map-stage {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
}

.map-container {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
}
.map-container :deep(.maplibregl-canvas-container)::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  pointer-events: none;
  background-image: 
    linear-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.1) 1px, transparent 1px);
  background-size: 5px 5px;
  background-position: center center;
  opacity: 0;
  transition: opacity 0.3s ease;
  z-index: 1;
}

.map-container.is-adding-mode :deep(.maplibregl-canvas-container)::after {
  opacity: .5;
}

:deep(.maplibregl-popup-content) {
  padding: 10px 14px;
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  border: 1px solid #e5e7eb;
}

:deep(.panel-popup .maplibregl-popup-content) {
  padding: 0;
  border-radius: 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
  border: none;
  overflow: hidden;
}

.reachability-legend {
  position: absolute;
  bottom: 20%;
  left: 15px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 14px;
  padding: 12px 18px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  z-index: 10;
}

.bivariate-legend {
  position: absolute;
  left: 15px;
  bottom: 1%;
  z-index: 5;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  max-width: 360px;
  pointer-events: none;
}

.legend-title {
  font-weight: 700;
  margin-bottom: 8px;
  color: #111827;
}

.legend-scale {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: #374151;
}

.color-box {
  width: 16px;
  height: 16px;
  display: inline-block;
  border-radius: 4px;
  margin-right: 6px;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.1);
}

.legend-grid {
  display: grid;
  grid-template-columns: 76px repeat(2, 1fr);
  gap: 4px;
  align-items: stretch;
}

.axis-label {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #374151;
  font-size: 11px;
  text-align: center;
  padding: 2px 4px;
}
.left { justify-content: flex-end; text-align: right; padding-right: 6px; }
.corner-label.empty { width: 100%; height: 100%; }
.legend-cell { width: 100%; height: 28px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.75); }
.legend-note { margin-top: 8px; font-size: 11px; color: #6b7280; }

.low_low { background: #fb923c; }
.low_high { background: #dc2626; }
.high_low { background: #93c5fd; }
.high_high { background: #1e40af; }

.fade-enter-active, .fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}

/* ---- STEP 2: Region switcher pill ---- */
.region-switcher {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  display: flex;
  background: #ffffff;
  border-radius: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10);
  padding: 0;
  pointer-events: auto;
  overflow: visible;
}

.region-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px 18px;
  border: none;
  background: transparent;
  color: #6b7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.region-btn:first-child {
  border-radius: 12px 0 0 12px;
}

.region-btn:last-child {
  border-radius: 0 12px 12px 0;
}

.region-btn:hover:not(.active) {
  background: #f3f4f6;
  color: #2b00b0;
}

.region-btn.active {
  background: #2b00b0;
  color: #ffffff;
}

.reset-btn {
  color: #dc2626;
  font-weight: 500;
}

.reset-btn:hover {
  background: #fef2f2;
  color: #b91c1c;
}

.reset-btn.active {
  background: #dc2626;
  color: #ffffff;
}

.region-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-a { background: #10B981; }
.dot-b { background: #8B5CF6; }
/* ---- END STEP 2 styles ---- */
</style>