import jStat from 'jstat';

export interface ANOVAResult {
  groups: string[];
  groupStats: Record<string, { count: number; mean: number; variance: number }>;
  fValue: number;
  dfBetween: number;
  dfWithin: number;
  pValue: number;
  testConclusion: string;
  effectSize: number; // Eta-squared (η²)
}

/**
 * Computes the upper-tail p-value for an F-distribution directly via the
 * regularized incomplete beta function, avoiding the catastrophic cancellation
 * in `1 - CDF(F)` that collapses to 0 for large F values.
 *
 *   P(F_{d1,d2} > f) = I(d2 / (d2 + d1·f),  d2/2,  d1/2)
 */
function fPValue(f: number, d1: number, d2: number): number {
  if (!isFinite(f) || f <= 0) return f <= 0 ? 1.0 : 0.0;
  const x = d2 / (d2 + d1 * f);
  return (jStat as any).ibeta(x, d2 / 2, d1 / 2);
}

export function computeANOVA(
  observations: Array<{
    value: number;
    zone: string;
  }>,
  alpha: number = 0.05
): ANOVAResult {
  const zones = Array.from(new Set(observations.map((o) => o.zone)));
  const k = zones.length;
  const n = observations.length;

  const dfBetween = k - 1;
  const dfWithin = n - k;

  const defaultGroupStats: Record<string, { count: number; mean: number; variance: number }> = {};
  zones.forEach(z => { defaultGroupStats[z] = { count: 0, mean: 0, variance: 0 }; });

  // 1. Minimum Sample Size Safeguard
  if (n <= k || k < 2) {
    return {
      groups: zones,
      groupStats: defaultGroupStats,
      fValue: 0,
      dfBetween: Math.max(1, dfBetween),
      dfWithin: Math.max(1, dfWithin),
      pValue: 1.0,
      testConclusion: `Insufficient data. Requires a total of > ${k} observations across your groups to compute variance.`,
      effectSize: 0,
    };
  }

  // 2. Welford's online algorithm — numerically stable mean + M2 per group
  const groupStats: Record<string, { count: number; mean: number; variance: number; M2: number }> = {};

  zones.forEach(zone => {
    const zoneData = observations
      .filter(o => o.zone === zone)
      .map(o => o.value);
    const count = zoneData.length;

    if (count === 0) {
      groupStats[zone] = { count: 0, mean: 0, variance: 0, M2: 0 };
      return;
    }

    let mean = 0;
    let M2 = 0;
    for (let i = 0; i < zoneData.length; i++) {
      const val = zoneData[i];
      const delta = val - mean;
      mean += delta / (i + 1);
      M2 += delta * (val - mean);
    }

    const variance = count > 1 ? M2 / (count - 1) : 0;
    groupStats[zone] = { count, mean, variance, M2 };
  });

  // Grand mean weighted by group count
  const grandMean =
    zones.reduce((acc, zone) => acc + groupStats[zone].mean * groupStats[zone].count, 0) / n;

  // 3. Sum of Squares
  let ssb = 0;
  let ssw = 0;

  zones.forEach(zone => {
    const stats = groupStats[zone];
    if (stats.count === 0) return;
    ssb += stats.count * Math.pow(stats.mean - grandMean, 2);
    ssw += stats.M2;
  });

  const sst = ssb + ssw;

  // 4. Mean Squares & F-Statistic
  const msb = ssb / dfBetween;
  const msw = ssw / dfWithin;

  let fValue: number;
  let pValue: number;

  if (msw === 0 && msb === 0) {
    fValue = 0;
    pValue = 1.0;
  } else if (msw === 0 && msb > 0) {
    fValue = Infinity;
    pValue = 0.0;
  } else {
    fValue = msb / msw;
    // Use ibeta-based upper tail — never collapses to 0 for large F
    pValue = fPValue(fValue, dfBetween, dfWithin);
  }

  // 5. Effect Size (η²)
  const effectSize = sst > 0 ? ssb / sst : 0;

  const finalGroupStats: Record<string, { count: number; mean: number; variance: number }> = {};
  zones.forEach(z => {
    finalGroupStats[z] = {
      count: groupStats[z].count,
      mean: groupStats[z].mean,
      variance: groupStats[z].variance,
    };
  });

  const pDisplay = pValue < 1e-10
    ? pValue.toExponential(10)
    : pValue.toFixed(10);

  const testConclusion = pValue < alpha
    ? `Significant: p = ${pDisplay} < ${alpha}. There IS a statistically significant difference across height zones.`
    : `Not significant: p = ${pDisplay} >= ${alpha}. The mean values are statistically indistinguishable across room heights.`;

  return {
    groups: zones,
    groupStats: finalGroupStats,
    fValue: isFinite(fValue) ? fValue : Infinity,
    dfBetween,
    dfWithin,
    pValue: Math.max(0, Math.min(1, pValue)),
    testConclusion,
    effectSize,
  };
}