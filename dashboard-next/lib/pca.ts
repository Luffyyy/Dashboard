// Principal Component Analysis utilities for the environmental telemetry data.
// We run PCA on the three continuous environmental variables: Temperature, Humidity, Pressure.
// Data is standardized (z-score) before analysis since the variables use different units/scales,
// which means the covariance matrix below is effectively the correlation matrix.

export interface PCAObservation {
  temperature: number;
  humidity: number;
  pressure: number;
  zone: string;
}

export interface PCAScore {
  pc1: number;
  pc2: number;
  zone: string;
  temperature: number;
  humidity: number;
  pressure: number;
}

export interface PCALoading {
  variable: string;
  pc1: number;
  pc2: number;
}

export interface PCAResult {
  scores: PCAScore[];
  loadings: PCALoading[];
  explained: number[]; // fraction of variance per component (3 entries)
  sampleCount: number;
}

const VARIABLES = ['Temperature', 'Humidity', 'Pressure'] as const;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function std(values: number[], m: number): number {
  const variance = values.reduce((acc, v) => acc + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance) || 1;
}

// Jacobi eigenvalue algorithm for a symmetric 3x3 matrix.
// Returns eigenvalues and eigenvectors (columns) sorted in descending eigenvalue order.
function jacobiEigen(matrix: number[][]): { values: number[]; vectors: number[][] } {
  const n = 3;
  const a = matrix.map((row) => [...row]);
  // Identity matrix for accumulating eigenvectors
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let iter = 0; iter < 100; iter++) {
    // Find the largest off-diagonal element
    let p = 0;
    let q = 1;
    let max = Math.abs(a[0][1]);
    const candidates: Array<[number, number]> = [
      [0, 1],
      [0, 2],
      [1, 2],
    ];
    for (const [i, j] of candidates) {
      if (Math.abs(a[i][j]) >= max) {
        max = Math.abs(a[i][j]);
        p = i;
        q = j;
      }
    }

    if (max < 1e-10) break;

    const app = a[p][p];
    const aqq = a[q][q];
    const apq = a[p][q];
    const phi = 0.5 * Math.atan2(2 * apq, aqq - app);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    // Rotate matrix a
    for (let k = 0; k < n; k++) {
      const akp = a[k][p];
      const akq = a[k][q];
      a[k][p] = c * akp - s * akq;
      a[k][q] = s * akp + c * akq;
    }
    for (let k = 0; k < n; k++) {
      const apk = a[p][k];
      const aqk = a[q][k];
      a[p][k] = c * apk - s * aqk;
      a[q][k] = s * apk + c * aqk;
    }

    // Accumulate eigenvectors
    for (let k = 0; k < n; k++) {
      const vkp = v[k][p];
      const vkq = v[k][q];
      v[k][p] = c * vkp - s * vkq;
      v[k][q] = s * vkp + c * vkq;
    }
  }

  const values = [a[0][0], a[1][1], a[2][2]];
  const vectors = [
    [v[0][0], v[1][0], v[2][0]],
    [v[0][1], v[1][1], v[2][1]],
    [v[0][2], v[1][2], v[2][2]],
  ];

  // Sort descending by eigenvalue
  const order = [0, 1, 2].sort((i, j) => values[j] - values[i]);
  return {
    values: order.map((i) => values[i]),
    vectors: order.map((i) => vectors[i]),
  };
}

export function computePCA(observations: PCAObservation[]): PCAResult | null {
  if (observations.length < 3) return null;

  const cols = [
    observations.map((o) => o.temperature),
    observations.map((o) => o.humidity),
    observations.map((o) => o.pressure),
  ];

  const means = cols.map((c) => mean(c));
  const stds = cols.map((c, i) => std(c, means[i]));

  // Standardized data matrix (N x 3)
  const standardized = observations.map((o, idx) => {
    void idx;
    return [
      (o.temperature - means[0]) / stds[0],
      (o.humidity - means[1]) / stds[1],
      (o.pressure - means[2]) / stds[2],
    ];
  });

  const n = standardized.length;

  // Covariance (correlation) matrix 3x3
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += standardized[k][i] * standardized[k][j];
      }
      cov[i][j] = sum / (n - 1);
    }
  }

  const { values, vectors } = jacobiEigen(cov);
  const totalVar = values.reduce((a, b) => a + Math.max(b, 0), 0) || 1;
  const explained = values.map((v) => Math.max(v, 0) / totalVar);

  const pc1Vec = vectors[0];
  const pc2Vec = vectors[1];

  const scores: PCAScore[] = standardized.map((row, idx) => ({
    pc1: row[0] * pc1Vec[0] + row[1] * pc1Vec[1] + row[2] * pc1Vec[2],
    pc2: row[0] * pc2Vec[0] + row[1] * pc2Vec[1] + row[2] * pc2Vec[2],
    zone: observations[idx].zone,
    temperature: observations[idx].temperature,
    humidity: observations[idx].humidity,
    pressure: observations[idx].pressure,
  }));

  // Loadings scaled by sqrt(eigenvalue) so vector length reflects explained variance
  const loadings: PCALoading[] = VARIABLES.map((variable, i) => ({
    variable,
    pc1: pc1Vec[i] * Math.sqrt(Math.max(values[0], 0)),
    pc2: pc2Vec[i] * Math.sqrt(Math.max(values[1], 0)),
  }));

  return { scores, loadings, explained, sampleCount: n };
}
