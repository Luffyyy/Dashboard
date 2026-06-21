import * as math from 'mathjs';
import jStat from 'jstat';

export interface MANOVAResult {
  groups: string[];
  groupSizes: Record<string, number>;
  means: Record<string, number[]>;
  wilksLambda: number;
  pillaiTrace: number;
  f: number;
  dfNum: number;
  dfDen: number;
  pValue: number;
  testConclusion: string;
  effectSize: number;
}

export function computeMANOVA(
  observations: Array<{
    pc1: number;
    pc2: number;
    zone: string;
  }>,
  alpha: number = 0.05
): MANOVAResult {
  const variables = ['pc1', 'pc2'] as const;
  const zones = Array.from(new Set(observations.map((o) => o.zone)));
  const k = zones.length;
  const p = variables.length;
  const n = observations.length;

  const dfBetween = k - 1;
  const dfWithin = n - k;

  // Initialize return schema for empty or unusable inputs
  const groupSizes: Record<string, number> = {};
  zones.forEach(z => { groupSizes[z] = 0; });
  const defaultMeans: Record<string, number[]> = {};
  zones.forEach(z => { defaultMeans[z] = new Array(p).fill(0); });

  // 1. Minimum Sample Size Safeguard
  // For MANOVA, total sample size must exceed groups + variables (n > k + p)
  // Additionally, to prevent a structurally singular W matrix, dfWithin should be >= p.
  if (n <= k + p || dfWithin < p || k < 2) {
    return {
      groups: zones,
      groupSizes: Object.fromEntries(zones.map(z => [z, observations.filter(o => o.zone === z).length])),
      means: defaultMeans,
      wilksLambda: 1.0,
      pillaiTrace: 0.0,
      f: 0,
      dfNum: p * Math.max(1, dfBetween),
      dfDen: Math.max(1, n - k),
      pValue: 1.0,
      testConclusion: `Insufficient data. Requires a total of > ${k + p} observations across your groups, with each zone containing multiple data points to compute covariances.`,
      effectSize: 0,
    };
  }

  // Group data matrices
  const grouped: Record<string, number[][]> = Object.fromEntries(
    zones.map((z) => {
      const data = observations.filter((o) => o.zone === z).map((o) => [o.pc1, o.pc2]);
      groupSizes[z] = data.length;
      return [z, data];
    })
  );

  const meanVector = (rows: number[][]): number[] => {
    if (!rows.length) return new Array(p).fill(0);
    return Array.from({ length: p }, (_, columnIndex) => {
      const total = rows.reduce((sum, row) => sum + (row[columnIndex] ?? 0), 0);
      return total / rows.length;
    });
  };

  // Grand Mean and Group Means
  const grandMean = meanVector(observations.map((o) => [o.pc1, o.pc2]));
  const groupMeans: Record<string, number[]> = Object.fromEntries(
    zones.map((z) => [z, meanVector(grouped[z])])
  );

  // Initialize SSCP Matrices (p x p)
  let B = math.zeros(p, p) as math.Matrix;
  let W = math.zeros(p, p) as math.Matrix;

  // Compute Between-groups (B) and Within-groups (W) SSCP
  zones.forEach((zone) => {
    if (groupSizes[zone] === 0) return;
    
    const devB = math.subtract(groupMeans[zone], grandMean) as number[];
    B = math.add(B, math.multiply(groupSizes[zone], math.multiply(math.transpose([devB]), [devB]))) as math.Matrix;

    grouped[zone].forEach((row) => {
      const devW = math.subtract(row, groupMeans[zone]) as number[];
      W = math.add(W, math.multiply(math.transpose([devW]), [devW])) as math.Matrix;
    });
  });

  // 2. Linear Dependancy and Collinearity Protection
  const detW = math.det(W);
  const totalSSCP = math.add(B, W);
  const detBW = math.det(totalSSCP);

  // If the matrices are singular (determinant zero), inversion/division yields NaN or Infinity
  if (Math.abs(detBW) < 1e-12 || Math.abs(detW) < 1e-12) {
    return {
      groups: zones,
      groupSizes,
      means: groupMeans,
      wilksLambda: 1.0,
      pillaiTrace: 0.0,
      f: 0,
      dfNum: p * dfBetween,
      dfDen: Math.max(1, n - k),
      pValue: 1.0,
      testConclusion: "Data collection matrices are singular or variables are perfectly collinear. Try collecting more diverse sensor logs.",
      effectSize: 0,
    };
  }

  // Wilks' Lambda calculation
  const wilksLambda = Math.max(0, Math.min(1, detW / detBW));

  // 3. Accurate Pillai's Trace calculation from multivariate metrics
  // Pillai's Trace = trace(B * (B + W)^-1)
  let pillaiTrace = 0;
  try {
    const invTotal = math.inv(totalSSCP);
    const pillaiMatrix = math.multiply(B, invTotal);
    pillaiTrace = math.trace(pillaiMatrix) as number;
    pillaiTrace = Math.max(0, Math.min(p, pillaiTrace)); // bound by number of dependent variables
  } catch {
    // Fallback if matrix inversion fails
    pillaiTrace = 1 - wilksLambda;
  }

  // Approximate F-statistic using Rao's approximation for Wilks' Lambda
  const t = Math.sqrt(Math.max(0.1, (p ** 2 * dfBetween ** 2 - 4) / (p ** 2 + dfBetween ** 2 - 5 || 1)));
  const w = n - 1 - (p + dfBetween + 1) / 2;
  const df1 = p * dfBetween;
  const df2 = Math.max(1, w * t - (p * dfBetween - 2) / 2);

  let fStatistic = 0;
  let pValue = 1.0;

  if (wilksLambda >= 0 && wilksLambda < 1) {
    if (wilksLambda <= 1e-11) {
      // Perfect statistical separation across height zones
      fStatistic = Infinity;
      pValue = 0.0;
    } else {
      const lambdaPower = Math.pow(wilksLambda, 1 / t);
      if (lambdaPower > 0 && lambdaPower < 1) {
        fStatistic = ((1 - lambdaPower) / lambdaPower) * (df2 / df1);
        pValue = 1 - (jStat as unknown as { centralF: { cdf: (value: number, df1: number, df2: number) => number } }).centralF.cdf(Math.max(0, fStatistic), df1, df2);
      }
    }
  } else if (wilksLambda === 1) {
    fStatistic = 0;
    pValue = 1.0;
  }

  // Multivariate effect size: Generalized Eta Squared (η²) based on variance traces
  const traceB = math.trace(B);
  const traceBW = math.trace(totalSSCP);
  const etaSquared = traceBW > 0 ? (traceB as number) / (traceBW as number) : 0;

  const testConclusion =
    pValue < alpha
      ? `Significant: p = ${pValue.toExponential(4)} < ${alpha}. There IS a statistically significant vertical stratification effect.`
      : `Not significant: p = ${pValue.toFixed(6)} >= ${alpha}. The climate properties are homogeneous across room heights.`;

  return {
    groups: zones,
    groupSizes,
    means: groupMeans,
    wilksLambda,
    pillaiTrace,
    f: isFinite(fStatistic) ? fStatistic : 999.99, // Keep interface values safe
    dfNum: df1,
    dfDen: df2,
    pValue: Math.max(0, Math.min(1, pValue)),
    testConclusion,
    effectSize: etaSquared,
  };
}