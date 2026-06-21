// Principal Component Analysis using ml-matrix library
// We run PCA on the three continuous environmental variables: Temperature, Humidity, Pressure.
// Data is standardized (z-score) before analysis since the variables use different units/scales.

import { Matrix, EigenvalueDecomposition } from 'ml-matrix';

export interface PCAObservation {
  temperature: number;
  humidity: number;
  pressure: number;
  zone: string;
}

interface PCAScore {
  pc1: number;
  pc2: number;
  zone: string;
  temperature: number;
  humidity: number;
  pressure: number;
}

interface PCALoading {
  variable: string;
  pc1: number;
  pc2: number;
}

export interface PCAResult {
  scores: PCAScore[];
  loadings: PCALoading[];
  explained: number[];
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

/**
 * Perform PCA on observation data using ml-matrix library with EVD
 */
export function computePCA(observations: PCAObservation[]): PCAResult {
  if (observations.length < 3) {
    return { scores: [], loadings: [], explained: [], sampleCount: 0 };
  }

  // Extract raw data: each row is a sample, each column is a variable
  const rawData: number[][] = observations.map((obs) => [
    obs.temperature,
    obs.humidity,
    obs.pressure,
  ]);

  // Standardize the data
  const means = [
    mean(rawData.map((row) => row[0])),
    mean(rawData.map((row) => row[1])),
    mean(rawData.map((row) => row[2])),
  ];

  const stds = [
    std(rawData.map((row) => row[0]), means[0]),
    std(rawData.map((row) => row[1]), means[1]),
    std(rawData.map((row) => row[2]), means[2]),
  ];

  const standardizedData = rawData.map((row) => [
    (row[0] - means[0]) / stds[0],
    (row[1] - means[1]) / stds[1],
    (row[2] - means[2]) / stds[2],
  ]);

  // Convert to matrix
  const dataMatrix = new Matrix(standardizedData);

  // Compute covariance matrix: (X^T @ X) / (n-1)
  const n = dataMatrix.rows;
  const p = dataMatrix.columns;
  
  // Create covariance matrix manually: (X^T @ X) / (n-1)
  // This is a p x p symmetric matrix
  const centered = new Matrix(p, p);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) {
      let sum = 0;
      for (let k = 0; k < n; k++) {
        sum += dataMatrix.get(k, i) * dataMatrix.get(k, j);
      }
      centered.set(i, j, sum / (n - 1));
    }
  }

  // Eigenvalue decomposition of covariance matrix
  const evd = new EigenvalueDecomposition(centered);
  const eigenvalues = evd.realEigenvalues;
  const eigenvectors = evd.eigenvectorMatrix;

  // Sort by eigenvalue magnitude (descending)
  const indices = eigenvalues
    .map((v, i) => ({ value: Math.abs(v), index: i }))
    .sort((a, b) => b.value - a.value)
    .map((item) => item.index);

  // Calculate explained variance
  const totalVariance = eigenvalues.reduce((sum, v) => sum + Math.abs(v), 0);
  const explained = indices.map((i) => Math.abs(eigenvalues[i]) / totalVariance);

  // PC scores: data * eigenvectors (first two components)
  const scores: PCAScore[] = [];
  for (let i = 0; i < dataMatrix.rows; i++) {
    const pc1 = dataMatrix.getRow(i).reduce((sum, val, j) => sum + val * eigenvectors.get(j, indices[0]), 0);
    const pc2 = dataMatrix.getRow(i).reduce((sum, val, j) => sum + val * eigenvectors.get(j, indices[1]), 0);

    scores.push({
      pc1,
      pc2,
      zone: observations[i].zone,
      temperature: observations[i].temperature,
      humidity: observations[i].humidity,
      pressure: observations[i].pressure,
    });
  }

  // Loadings: eigenvectors (correlations between original variables and principal components)
  const loadings: PCALoading[] = [];
  for (let i = 0; i < VARIABLES.length; i++) {
    loadings.push({
      variable: VARIABLES[i],
      pc1: eigenvectors.get(i, indices[0]),
      pc2: eigenvectors.get(i, indices[1]),
    });
  }

  return {
    scores,
    loadings,
    explained: explained.slice(0, 3),
    sampleCount: observations.length,
  };
}
