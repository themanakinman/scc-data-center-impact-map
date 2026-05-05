export function getFeatureBounds(feature) {
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

export function isSantaClaraTractLikeFeature(feature) {
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

export function getBoundsFromGeoJSON(data, mapboxgl) {
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

// ---------------------------------------------------------------------------
// STEP 2 ADDITIONS
// ---------------------------------------------------------------------------

/**
 * Ray-casting point-in-polygon test.
 * Works for simple (non-self-intersecting) polygons — fine for census tracts.
 *
 * @param {number} lng  - longitude of the point
 * @param {number} lat  - latitude of the point
 * @param {number[][]} ring - array of [lng, lat] pairs forming a closed ring
 * @returns {boolean}
 */
export function isPointInPolygon(lng, lat, ring) {
  let inside = false;
  const n = ring.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    // Does the ray from (lng, lat) going right cross this edge?
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Given a Set of selected tract GEOIDs and the full data-centers GeoJSON,
 * return only the data-center features that fall inside any of the selected tracts.
 *
 * How it works:
 *   1. Filter allTracts to only the selected polygons.
 *   2. For each data center point, test it against every selected polygon.
 *   3. Return data centers where at least one polygon contains the point.
 *
 * Supports both Polygon and MultiPolygon tract geometries.
 *
 * @param {Set<string>}      tractGEOIDs      - selected GEOID strings
 * @param {object}           allTractsGeoJSON - the full tracts FeatureCollection
 * @param {object}           dataCentersGeoJSON - the full data centers FeatureCollection
 * @returns {object[]}       array of matching data-center Feature objects
 */
export function getDataCentersInRegion(tractGEOIDs, allTractsGeoJSON, dataCentersGeoJSON) {
  // Step 1: collect the polygon rings for every selected tract
  const selectedRings = [];

  for (const tractFeature of allTractsGeoJSON.features) {
    const geoid = tractFeature.properties?.GEOID;
    if (!tractGEOIDs.has(geoid)) continue;

    const geom = tractFeature.geometry;
    if (!geom) continue;

    if (geom.type === 'Polygon') {
      // coordinates is [ outerRing, ...holeRings ] — we only need outer ring
      selectedRings.push(geom.coordinates[0]);
    } else if (geom.type === 'MultiPolygon') {
      // coordinates is [ [ [outerRing, ...holes] ], ... ]
      for (const polygon of geom.coordinates) {
        selectedRings.push(polygon[0]);
      }
    }
  }

  if (selectedRings.length === 0) return [];

  // Step 2: test each data center point against every collected ring
  return dataCentersGeoJSON.features.filter((dc) => {
    if (dc.geometry?.type !== 'Point') return false;
    const [lng, lat] = dc.geometry.coordinates;

    // Belongs to region if it's inside ANY of the selected rings
    return selectedRings.some((ring) => isPointInPolygon(lng, lat, ring));
  });
}