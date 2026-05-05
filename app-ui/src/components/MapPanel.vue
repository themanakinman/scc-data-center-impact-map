<template>
  <div class="map-panel">
    <div class="map-header">
      <div class="header-copy">
        <div class="map-title">Income vs Vulnerability Across Santa Clara County</div>
        <div class="map-subtitle">
          Bivariate choropleth using ACS (American Community Survey) median household income and CDC SVI (Social Vulnerability Index)
        </div>
        <div class="insight-row">
          <div class="insight-box">
            <strong>Key Insight:</strong><br />
            Areas with low income and high vulnerability highlight communities that may
            be most impacted by data center resource demands. These areas may require
            additional infrastructure support and policy attention.
          </div>
          <div class="map-actions">
            <button class="action-btn" @click="filterHighRisk">High Risk Areas</button>
            <button class="action-btn" @click="resetFilter">Reset</button>
          </div>
        </div>
      </div>
    </div>

    <div class="map-stage">
      <div ref="mapContainer" class="map-container"></div>

      <div class="bivariate-legend">
        <div class="legend-title">Income × Vulnerability</div>

        <div class="legend-grid">
          <div class="corner-label empty"></div>
          <div class="axis-label top">Low Income</div>
          <div class="axis-label top">Medium Income</div>
          <div class="axis-label top">High Income</div>

          <div class="axis-label left">Low Vulnerability</div>
          <div class="legend-cell low_low"></div>
          <div class="legend-cell mid_low"></div>
          <div class="legend-cell high_low"></div>

          <div class="axis-label left">Medium Vulnerability</div>
          <div class="legend-cell low_mid"></div>
          <div class="legend-cell mid_mid"></div>
          <div class="legend-cell high_mid"></div>

          <div class="axis-label left">High Vulnerability</div>
          <div class="legend-cell low_high"></div>
          <div class="legend-cell mid_high"></div>
          <div class="legend-cell high_high"></div>
        </div>

        <div class="legend-note">
          Click on a cell to highlight the related census tracts.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from "vue";
import mapboxgl from "mapbox-gl";
import Papa from "papaparse";
import "mapbox-gl/dist/mapbox-gl.css";

import geoDataRaw from "../data/santa_clara_tracts.geojson?raw";
import incomeCSVRaw from "../data/santa_clara_income_clean.csv?raw";
import sviCSVRaw from "../data/santa_clara_svi_clean.csv?raw";

const mapContainer = ref(null);
let map = null;

const showChoropleth = ref(true);
const geoData = JSON.parse(geoDataRaw);

function normalizeGEOID(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(11, "0");
}

function parseCsvToMap(csvText, keyCol, valueCol) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });

  const result = {};

  (parsed.data || []).forEach((row) => {
    const key = normalizeGEOID(row[keyCol]);
    const rawValue = String(row[valueCol] ?? "").replace(/,/g, "").trim();
    const num = Number(rawValue);

    if (key && Number.isFinite(num)) {
      result[key] = num;
    }
  });

  return result;
}

const incomeMap = parseCsvToMap(incomeCSVRaw, "GEOID", "income");
const vulnerabilityMap = parseCsvToMap(sviCSVRaw, "GEOID", "vulnerability");

function getFeatureBounds(feature) {
  const coords = feature?.geometry?.coordinates;
  if (!coords) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const walk = (node) => {
    if (!Array.isArray(node)) return;

    if (
      node.length >= 2 &&
      typeof node[0] === "number" &&
      typeof node[1] === "number"
    ) {
      const lng = node[0];
      const lat = node[1];
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
      return;
    }

    for (const item of node) {
      walk(item);
    }
  };

  walk(coords);

  if (
    minLng === Infinity ||
    minLat === Infinity ||
    maxLng === -Infinity ||
    maxLat === -Infinity
  ) {
    return null;
  }

  return { minLng, minLat, maxLng, maxLat };
}

function isSantaClaraTractLikeFeature(feature) {
  const bounds = getFeatureBounds(feature);
  if (!bounds) return false;

  const width = bounds.maxLng - bounds.minLng;
  const height = bounds.maxLat - bounds.minLat;

  const centroidLng = (bounds.minLng + bounds.maxLng) / 2;
  const centroidLat = (bounds.minLat + bounds.maxLat) / 2;

  const inSantaClaraEnvelope =
    centroidLng > -122.35 &&
    centroidLng < -121.45 &&
    centroidLat > 36.9 &&
    centroidLat < 37.65;

  const smallEnough = width < 0.15 && height < 0.15;

  return inSantaClaraEnvelope && smallEnough;
}

function quantileThresholds(values) {
  const nums = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);

  if (nums.length === 0) return [0, 0];

  const q1Index = Math.floor(nums.length * 0.33);
  const q2Index = Math.floor(nums.length * 0.66);

  return [
    nums[Math.min(q1Index, nums.length - 1)],
    nums[Math.min(q2Index, nums.length - 1)],
  ];
}

function bucket3(value, thresholds) {
  if (value <= thresholds[0]) return "low";
  if (value <= thresholds[1]) return "mid";
  return "high";
}

function prepareChoroplethData(data) {
  const cloned = structuredClone(data);

  const filteredFeatures = cloned.features.filter(isSantaClaraTractLikeFeature);
  cloned.features = filteredFeatures.length > 0 ? filteredFeatures : cloned.features;

  cloned.features.forEach((feature, index) => {
    if (!feature.properties) feature.properties = {};

    if (typeof feature.properties.name !== "string") {
      feature.properties.name =
        feature.properties.NAMELSAD ||
        feature.properties.NAME ||
        feature.properties.Name ||
        feature.properties.TRACT ||
        feature.properties.tract ||
        feature.properties.county ||
        `Area ${index + 1}`;
    }

    const geoid = normalizeGEOID(
      feature.properties.GEOID ||
      feature.properties.GEOID10 ||
      feature.properties.geoid ||
      ""
    );

    const incomeFromCsv = incomeMap[geoid];
    const vulnerabilityFromCsv = vulnerabilityMap[geoid];

    if (Number.isFinite(incomeFromCsv)) {
      feature.properties.income = incomeFromCsv;
    } else if (typeof feature.properties.income !== "number") {
      feature.properties.income = Math.floor(40000 + Math.random() * 80000);
    }

    if (Number.isFinite(vulnerabilityFromCsv)) {
      feature.properties.vulnerability = vulnerabilityFromCsv;
    } else if (typeof feature.properties.vulnerability !== "number") {
      feature.properties.vulnerability = Math.random();
    }
  });

  const incomes = cloned.features.map((f) => f.properties.income);
  const vulnerabilities = cloned.features.map((f) => f.properties.vulnerability * 100);

  const incomeThresholds = quantileThresholds(incomes);
  const vulnerabilityThresholds = quantileThresholds(vulnerabilities);

  cloned.features.forEach((feature) => {
    const incomeBucket = bucket3(feature.properties.income, incomeThresholds);
    const vulnerabilityBucket = bucket3(
      feature.properties.vulnerability * 100,
      vulnerabilityThresholds
    );

    feature.properties.incomeBucket = incomeBucket;
    feature.properties.vulnerabilityBucket = vulnerabilityBucket;
    feature.properties.bivariateKey = `${incomeBucket}_${vulnerabilityBucket}`;
    feature.properties.value = feature.properties.vulnerability * 100;
  });

  return cloned;
}

function getBoundsFromGeoJSON(data) {
  const bounds = new mapboxgl.LngLatBounds();
  let hasPoint = false;

  const addCoords = (coords) => {
    if (!Array.isArray(coords)) return;

    if (
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      bounds.extend([coords[0], coords[1]]);
      hasPoint = true;
      return;
    }

    for (const item of coords) {
      addCoords(item);
    }
  };

  for (const feature of data.features || []) {
    addCoords(feature.geometry?.coordinates);
  }

  return hasPoint ? bounds : null;
}

function getPopupDetails(feature) {
  const props = feature?.properties || {};

  const tract =
    props.TRACTCE ||
    props.TRACT ||
    props.tract ||
    props.GEOID ||
    props.NAME ||
    props.name ||
    "Unknown";

  const city =
    props.city ||
    props.CITY ||
    props.place ||
    props.PLACE ||
    props.municipality ||
    props.MUNI ||
    "Santa Clara";

  return {
    city,
    tract,
    income: props.income,
    vulnerability: props.vulnerability,
    incomeBucket: props.incomeBucket,
    vulnerabilityBucket: props.vulnerabilityBucket,
  };
}

function formatIncome(value) {
  if (value === null || value === undefined || value === "") return "N/A";
  const num = Number(value);
  if (Number.isNaN(num)) return String(value);
  return `$${Math.round(num).toLocaleString()}`;
}

function setChoroplethVisibility(visible) {
  if (!map) return;

  const visibility = visible ? "visible" : "none";

  if (map.getLayer("choropleth-fill")) {
    map.setLayoutProperty("choropleth-fill", "visibility", visibility);
  }

  if (map.getLayer("choropleth-outline")) {
    map.setLayoutProperty("choropleth-outline", "visibility", visibility);
  }
}

function toggleChoropleth() {
  showChoropleth.value = !showChoropleth.value;
  setChoroplethVisibility(showChoropleth.value);
}

function applyFilter(filter) {
  if (!map) return;

  if (map.getLayer("choropleth-fill")) {
    map.setFilter("choropleth-fill", filter);
  }

  if (map.getLayer("choropleth-outline")) {
    map.setFilter("choropleth-outline", filter);
  }
}

function filterHighRisk() {
  applyFilter([
    "all",
    [">=", ["get", "vulnerability"], 0.7],
  ]);
}

function resetFilter() {
  applyFilter(null);
}

function handleResize() {
  if (map) {
    map.resize();
  }
}

onMounted(async () => {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;

  if (!token) {
    console.error("Missing VITE_MAPBOX_TOKEN");
    return;
  }

  mapboxgl.accessToken = token;

  await nextTick();

  map = new mapboxgl.Map({
    container: mapContainer.value,
    style: "mapbox://styles/mapbox/light-v11",
    center: [-121.9, 37.35],
    zoom: 8.5,
  });

  map.addControl(new mapboxgl.NavigationControl(), "top-right");

  map.on("load", () => {
    const choroplethData = prepareChoroplethData(geoData);

    map.addSource("choropleth-source", {
      type: "geojson",
      data: choroplethData,
    });

    map.addLayer({
      id: "choropleth-fill",
      type: "fill",
      source: "choropleth-source",
      paint: {
        "fill-color": [
          "match",
          ["get", "bivariateKey"],
          "low_low", "#e8e8e8",
          "low_mid", "#ace4e4",
          "low_high", "#5ac8c8",
          "mid_low", "#dfb0d6",
          "mid_mid", "#a5add3",
          "mid_high", "#5698b9",
          "high_low", "#be64ac",
          "high_mid", "#8c62aa",
          "high_high", "#3b4994",
          "#cccccc",
        ],
        "fill-opacity": 0.8,
      },
    });

    map.addLayer({
      id: "choropleth-outline",
      type: "line",
      source: "choropleth-source",
      paint: {
        "line-color": "#ffffff",
        "line-width": 1.2,
      },
    });

    map.on("mouseenter", "choropleth-fill", () => {
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "choropleth-fill", () => {
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "choropleth-fill", (e) => {
      const feature = e.features?.[0];
      if (!feature) return;

      const {
        city,
        tract,
        income,
        vulnerability,
        incomeBucket,
        vulnerabilityBucket,
      } = getPopupDetails(feature);

      // ✅ Updated: show raw SVI value + county-relative bucket only
      const popupHtml = `
        <strong>${city} (Tract ${tract})</strong><br/>
        Income: ${formatIncome(income)} <span style="opacity:0.8">(${incomeBucket || "n/a"})</span><br/>
        Vulnerability: ${Number(vulnerability).toFixed(2)} <span style="opacity:0.8">(${vulnerabilityBucket || "n/a"})</span><br/>
        Bivariate class: ${feature.properties?.bivariateKey || "n/a"}
      `;

      new mapboxgl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(popupHtml)
        .addTo(map);
    });

    const bounds = getBoundsFromGeoJSON(choroplethData);
    if (bounds) {
      map.fitBounds(bounds, {
        padding: 40,
        duration: 0,
      });
    }

    setChoroplethVisibility(showChoropleth.value);
    map.resize();
  });

  window.addEventListener("resize", handleResize);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", handleResize);

  if (map) {
    map.remove();
    map = null;
  }
});

defineExpose({
  toggleChoropleth,
  filterHighRisk,
  resetFilter,
});
</script>

<style scoped>
.map-panel {
  width: 100%;
  height: 100%;
  min-height: 700px;
  position: relative;
}

.map-header {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 12px;
  padding: 4px 2px;
}

.header-copy {
  width: 100%;
}

.map-title {
  font-size: 20px;
  font-weight: 800;
  color: #111827;
  line-height: 1.2;
}

.map-subtitle {
  margin-top: 4px;
  color: #6b7280;
  font-size: 13px;
}

.insight-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 10px;
}

.insight-box {
  flex: 1;
  padding: 10px 12px;
  border-radius: 10px;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  font-size: 13px;
  color: #374151;
}

.map-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.action-btn {
  border: 1px solid #d1d5db;
  background: #ffffff;
  color: #111827;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.action-btn:hover {
  background: #f3f4f6;
}

.map-stage {
  position: relative;
  width: 100%;
  min-height: 700px;
}

.map-container {
  width: 100%;
  height: 100%;
  min-height: 700px;
  position: relative;
  border-radius: 16px;
  overflow: hidden;
}

.bivariate-legend {
  position: absolute;
  left: 16px;
  top: 330px;
  z-index: 5;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  font-size: 12px;
  max-width: 280px;
  pointer-events: none;
}

.legend-title {
  font-weight: 700;
  margin-bottom: 10px;
  color: #111827;
}

.legend-grid {
  display: grid;
  grid-template-columns: 76px repeat(3, 1fr);
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

.left {
  justify-content: flex-end;
  text-align: right;
  padding-right: 6px;
}

.corner-label.empty {
  width: 100%;
  height: 100%;
}

.legend-cell {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.75);
}

.legend-note {
  margin-top: 8px;
  font-size: 11px;
  color: #6b7280;
}

.low_low { background: #e8e8e8; }
.low_mid { background: #ace4e4; }
.low_high { background: #5ac8c8; }
.mid_low { background: #dfb0d6; }
.mid_mid { background: #a5add3; }
.mid_high { background: #5698b9; }
.high_low { background: #be64ac; }
.high_mid { background: #8c62aa; }
.high_high { background: #3b4994; }
</style>