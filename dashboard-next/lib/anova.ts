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

export function computeANOVA(
  observations: Array<{
    temperature: number;
    zone: string;
  }>,
  alpha: number = 0.05
): ANOVAResult {
  const zones = Array.from(new Set(observations.map((o) => o.zone)));
  const k = zones.length;
  const n = observations.length;

  const dfBetween = k - 1;
  const dfWithin = n - k;

  // Initialize return schema for empty or unusable inputs
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

  // 2. Calculate Group Statistics (Count, Mean, Variance)
  let grandSum = 0;
  const groupStats: Record<string, { count: number; mean: number; variance: number; sumSquares: number }> = {};
  
  zones.forEach(zone => {
    const zoneData = observations.filter(o => o.zone === zone).map(o => o.temperature);
    const count = zoneData.length;
    
    if (count === 0) {
      groupStats[zone] = { count: 0, mean: 0, variance: 0, sumSquares: 0 };
      return;
    }

    const sum = zoneData.reduce((acc, val) => acc + val, 0);
    grandSum += sum;
    const mean = sum / count;
    
    const sumSquares = zoneData.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0);
    const variance = count > 1 ? sumSquares / (count - 1) : 0;

    groupStats[zone] = { count, mean, variance, sumSquares };
  });

  const grandMean = grandSum / n;

  // 3. Compute Sum of Squares
  let ssb = 0; // Sum of Squares Between groups
  let ssw = 0; // Sum of Squares Within groups

  zones.forEach(zone => {
    const stats = groupStats[zone];
    if (stats.count === 0) return;
    
    // Between-group variation: n * (groupMean - grandMean)^2
    ssb += stats.count * Math.pow(stats.mean - grandMean, 2);
    
    // Within-group variation: sum of squared deviations from group mean
    ssw += stats.sumSquares;
  });

  const sst = ssb + ssw; // Total Sum of Squares

  // 4. Mean Squares & F-Statistic
  const msb = ssb / dfBetween;
  const msw = ssw / dfWithin;
  
  let fValue = 0;
  let pValue = 1.0;

  if (msw <= 1e-12) {
    // If within-group variance is practically zero, the groups are perfectly separated or identical
    if (msb > 1e-12) {
      fValue = Infinity;
      pValue = 0.0;
    } else {
      fValue = 0;
      pValue = 1.0;
    }
  } else {
    fValue = msb / msw;
    // Calculate p-value using jStat's F-distribution CDF
    // p-value is the probability of observing an F-value at least this extreme
    pValue = 1 - (jStat as any).centralF.cdf(fValue, dfBetween, dfWithin);
  }

  // 5. Effect Size (Eta-Squared)
  const effectSize = sst > 0 ? ssb / sst : 0;

  // Format final stats for output (removing the internal sumSquares tracker)
  const finalGroupStats: Record<string, { count: number; mean: number; variance: number }> = {};
  zones.forEach(z => {
    finalGroupStats[z] = {
      count: groupStats[z].count,
      mean: groupStats[z].mean,
      variance: groupStats[z].variance
    };
  });

  const testConclusion = pValue < alpha
    ? `Significant: p = ${pValue.toExponential(4)} < ${alpha}. There IS a statistically significant difference in temperature across height zones.`
    : `Not significant: p = ${pValue.toFixed(6)} >= ${alpha}. The mean temperatures are statistically indistinguishable across room heights.`;

  return {
    groups: zones,
    groupStats: finalGroupStats,
    fValue: isFinite(fValue) ? fValue : 999.99, // Fallback for safe rendering
    dfBetween,
    dfWithin,
    pValue: Math.max(0, Math.min(1, pValue)), // Clamp between 0 and 1
    testConclusion,
    effectSize,
  };
}