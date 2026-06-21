// F-distribution CDF approximation using regularized incomplete beta function

/**
 * Regularized incomplete beta function (Ix(a, b))
 * Approximation using continued fractions (Lentz's algorithm)
 */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - logBeta(a, b));

  if (x < (a + 1) / (a + b + 2)) {
    return front * betaContinuedFraction(x, a, b) / a;
  } else {
    return 1 - front * betaContinuedFraction(1 - x, b, a) / b;
  }
}

/**
 * Log of Beta function: ln(B(a, b)) = ln(Gamma(a)) + ln(Gamma(b)) - ln(Gamma(a+b))
 */
function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

/**
 * Stirling's approximation for log gamma
 */
function logGamma(z: number): number {
  const g = 7;
  const coeff = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = coeff[0];
  for (let i = 1; i < coeff.length; i++) {
    x += coeff[i] / (z + i);
  }

  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/**
 * Continued fraction for incomplete beta
 */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const maxIter = 100;
  const eps = 3e-7;

  let am = 1,
    bm = 1;
  let az = 1,
    qab = a + b,
    qap = a + 1,
    qam = a - 1;
  let bz = 1 - (qab * x) / qap;

  for (let m = 1; m <= maxIter; m++) {
    const d = (m * (b - m) * x) / ((qam + 2 * m) * (a + 2 * m));
    am = 1 + d * am;
    bm = 1 + d / bm;
    az *= am / bm;
    bz += 1 - qap / (qab + 2 * m);

    qap += 2;
    qam += 2;

    if (Math.abs(az - az * (1 - eps)) < eps) break;
  }

  return az;
}

/**
 * F-distribution CDF: P(F ≤ x)
 */
function fCDF(x: number, df1: number, df2: number): number {
  if (x <= 0) return 0;
  const numerator = (df1 * x) / (df1 * x + df2);
  return incompleteBeta(numerator, df1 / 2, df2 / 2);
}

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

/**
 * Compute MANOVA (Multivariate Analysis of Variance) for PC1, PC2, Temperature, Humidity, Pressure across height zones.
 * Tests the null hypothesis that the mean vectors are equal across groups.
 */
export function computeMANOVA(
  observations: Array<{
    pc1: number;
    pc2: number;
    temperature: number;
    humidity: number;
    pressure: number;
    zone: string;
  }>,
  alpha: number = 0.05
): MANOVAResult {
  const variables = ['pc1', 'pc2', 'temperature', 'humidity', 'pressure'] as const;
  const zones = Array.from(new Set(observations.map((o) => o.zone)));

  // Group data by zone
  const grouped: Record<string, number[][]> = {};
  const groupSizes: Record<string, number> = {};
  
  zones.forEach((zone) => {
    grouped[zone] = [];
    groupSizes[zone] = 0;
  });

  observations.forEach((obs) => {
    const zone = obs.zone;
    grouped[zone].push([obs.pc1, obs.pc2, obs.temperature, obs.humidity, obs.pressure]);
    groupSizes[zone]++;
  });

  const k = zones.length; // number of groups
  const p = variables.length; // number of variables
  const n = observations.length; // total observations
  const dfBetween = k - 1;
  const dfWithin = n - k;

  // Grand mean
  const grandMean: number[] = [0, 0, 0, 0, 0];
  observations.forEach((obs) => {
    grandMean[0] += obs.pc1;
    grandMean[1] += obs.pc2;
    grandMean[2] += obs.temperature;
    grandMean[3] += obs.humidity;
    grandMean[4] += obs.pressure;
  });
  grandMean.forEach((_, i) => (grandMean[i] /= n));

  // Group means
  const groupMeans: Record<string, number[]> = {};
  zones.forEach((zone) => {
    const data = grouped[zone];
    const means = [0, 0, 0, 0, 0];
    data.forEach((row) => {
      row.forEach((val, i) => (means[i] += val));
    });
    means.forEach((_, i) => (means[i] /= data.length));
    groupMeans[zone] = means;
  });

  // Between-groups SSCP matrix (Sums of Squares and Cross-Products)
  const B: number[][] = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];

  zones.forEach((zone) => {
    const n_j = groupSizes[zone];
    const devs = groupMeans[zone].map((mean, i) => mean - grandMean[i]);
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        B[i][j] += n_j * devs[i] * devs[j];
      }
    }
  });

  // Within-groups SSCP matrix
  const W: number[][] = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ];

  zones.forEach((zone) => {
    const data = grouped[zone];
    const means = groupMeans[zone];
    data.forEach((row) => {
      const devs = row.map((val, i) => val - means[i]);
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          W[i][j] += devs[i] * devs[j];
        }
      }
    });
  });

  // Compute determinants and Wilks' Lambda
  const detW = determinant(W);
  const detBW = determinant(addMatrices(B, W));
  const wilksLambda = Math.max(0, Math.min(1, detW / (detBW + 1e-10)));

  // Approximate F-statistic from Wilks' Lambda
  const t = Math.sqrt(Math.max(0.1, (p ** 2 * dfBetween ** 2 - 4) / (p ** 2 + dfBetween ** 2 - 5)));
  const w = Math.max(1, n - 1 - (p + dfBetween) / 2);
  const df1 = p * dfBetween;
  const df2 = Math.max(1, w * t - (p * dfBetween - 2) / 2);

  let fStatistic = 0;
  let pValue = 1;

  // Guard against invalid lambda values
  if (wilksLambda > 0 && wilksLambda < 1) {
    const lambdaPower = Math.pow(wilksLambda, 1 / t);
    if (lambdaPower > 1e-10 && lambdaPower < 1) {
      fStatistic = ((1 - lambdaPower) / lambdaPower) * (df2 / df1);
      pValue = Math.max(0, Math.min(1, 1 - fCDF(Math.max(0, fStatistic), df1, df2)));
    }
  }

  // Pillai's trace
  const pillaiTrace = 1 - wilksLambda;

  // Effect size (eta-squared from multivariate context)
  const traceB = trace(B);
  const traceBW = trace(addMatrices(B, W));
  const etaSquared = traceBW > 0 ? traceB / traceBW : 0;

  const testConclusion =
    pValue < alpha
      ? `Significant: p = ${pValue.toFixed(6)} < ${alpha}. There IS a statistically significant difference in the multivariate means across height zones.`
      : `Not significant: p = ${pValue.toFixed(6)} >= ${alpha}. No statistically significant difference detected in the multivariate means across height zones.`;

  return {
    groups: zones,
    groupSizes,
    means: groupMeans,
    wilksLambda,
    pillaiTrace,
    f: fStatistic,
    dfNum: df1,
    dfDen: df2,
    pValue,
    testConclusion,
    effectSize: etaSquared,
  };
}

// Helper: Determinant of 5x5 matrix using LU decomposition
function determinant(matrix: number[][]): number {
  const n = matrix.length;
  const M = matrix.map((row) => [...row]);

  let det = 1;
  for (let i = 0; i < n; i++) {
    // Find pivot
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }

    if (Math.abs(M[maxRow][i]) < 1e-10) {
      return 0; // Singular matrix
    }

    if (maxRow !== i) {
      [M[i], M[maxRow]] = [M[maxRow], M[i]];
      det *= -1;
    }

    det *= M[i][i];

    for (let k = i + 1; k < n; k++) {
      const factor = M[k][i] / M[i][i];
      for (let j = i; j < n; j++) {
        M[k][j] -= factor * M[i][j];
      }
    }
  }

  return det;
}

// Helper: Matrix trace (sum of diagonal)
function trace(matrix: number[][]): number {
  return matrix.reduce((sum, row, i) => sum + row[i], 0);
}

// Helper: Add two matrices
function addMatrices(a: number[][], b: number[][]): number[][] {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}
