export function normalizeGEOID(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.padStart(11, "0");
}

export function medianThreshold(values) {
  const nums = values
    .filter((v) => Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);

  if (nums.length === 0) return 0;

  const midIndex = Math.floor(nums.length * 0.5);
  return nums[Math.min(midIndex, nums.length - 1)];
}

export function bucket2(value, threshold) {
  return value <= threshold ? "low" : "high";
}

export function parseCsvToMap(csvText, keyCol, valueCol, Papa) {
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

// ---------------------------------------------------------------------------
// STEP 2 ADDITION
// ---------------------------------------------------------------------------

/**
 * Compute aggregate statistics for one comparison region.
 *
 * @param {Set<string>}  tractGEOIDs          - GEOIDs of selected tracts
 * @param {object}       incomeMap            - { [GEOID]: number } from parseCsvToMap
 * @param {object}       vulnerabilityMap     - { [GEOID]: number } from parseCsvToMap
 * @param {object[]}     dataCentersInRegion  - already-filtered DC features from getDataCentersInRegion
 * @returns {{ tractCount, dcCount, totalMW, avgIncome, avgSVI }}
 *
 * Returns null if no tracts are selected yet — the UI uses this to show
 * a placeholder instead of zeros.
 */
export function computeRegionStats(tractGEOIDs, incomeMap, vulnerabilityMap, dataCentersInRegion) {
  if (!tractGEOIDs || tractGEOIDs.size === 0) return null;

  const geoids = [...tractGEOIDs];

  // Collect income values for selected tracts (skip any missing data)
  const incomes = geoids
    .map((g) => incomeMap[g])
    .filter((v) => Number.isFinite(v));

  // Collect SVI values (stored as 0–1; display as-is)
  const svis = geoids
    .map((g) => vulnerabilityMap[g])
    .filter((v) => Number.isFinite(v));

  const avgIncome = incomes.length > 0
    ? incomes.reduce((sum, v) => sum + v, 0) / incomes.length
    : 0;

  const avgSVI = svis.length > 0
    ? svis.reduce((sum, v) => sum + v, 0) / svis.length
    : 0;

  // Sum MW load across all data centers in this region
  const totalMW = dataCentersInRegion.reduce((sum, dc) => {
    const mw = Number(dc.properties?.it_load_mw ?? 0);
    return sum + (Number.isFinite(mw) ? mw : 0);
  }, 0);

  return {
    tractCount: tractGEOIDs.size,
    dcCount:    dataCentersInRegion.length,
    totalMW:    Math.round(totalMW * 10) / 10,        // 1 decimal place
    avgIncome:  Math.round(avgIncome),                // whole dollars
    avgSVI:     Math.round(avgSVI * 1000) / 1000,     // 3 decimal places
  };
}