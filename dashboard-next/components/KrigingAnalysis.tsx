'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, Cell } from 'recharts';
import { CheckCircle, AlertCircle, Map as MapIcon } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import { computePCA, type PCAObservation } from '../lib/pca';

interface KrigingAnalysisProps {
  messages: MQTTMessage[];
}

/**
 * Simple kriging implementation using inverse distance weighting (IDW)
 * for estimating PC2 values at unmeasured locations
 * @param observedPoints Array of {x, y, pc2} observed points
 * @param predictionPoints Array of {x, y} locations where we want to predict
 */
function krigePC2(
  observedPoints: Array<{ x: number; y: number; pc2: number }>,
  predictionPoints: Array<{ x: number; y: number }>
): Array<{ x: number; y: number; pc2_predicted: number }> {
  const power = 2; // IDW power parameter
  const maxDistance = 300; // Consider only points within this distance

  return predictionPoints.map((pred) => {
    let numerator = 0;
    let denominator = 0;

    for (const obs of observedPoints) {
      const distance = Math.sqrt((pred.x - obs.x) ** 2 + (pred.y - obs.y) ** 2);

      if (distance < 0.1) {
        // Very close, return observed value
        return { x: pred.x, y: pred.y, pc2_predicted: obs.pc2 };
      }

      if (distance <= maxDistance) {
        const weight = 1 / (distance ** power);
        numerator += weight * obs.pc2;
        denominator += weight;
      }
    }

    const pc2_predicted = denominator > 0 ? numerator / denominator : 0;
    return { x: pred.x, y: pred.y, pc2_predicted };
  });
}

/**
 * Spatial autocorrelation analysis (Moran's I)
 */
function moransI(points: Array<{ x: number; y: number; value: number }>): number {
  if (points.length < 2) return 0;

  const n = points.length;
  const meanValue = points.reduce((sum, p) => sum + p.value, 0) / n;

  // Calculate spatial weights (inverse distance)
  let sumWeights = 0;
  let numerator = 0;

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = points[i].x - points[j].x;
      const dy = points[i].y - points[j].y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 0 && distance < 500) {
        const weight = 1 / distance;
        const devI = points[i].value - meanValue;
        const devJ = points[j].value - meanValue;

        numerator += weight * devI * devJ;
        sumWeights += weight;
      }
    }
  }

  const variance = points.reduce((sum, p) => sum + (p.value - meanValue) ** 2, 0) / n;
  const I = (n / sumWeights) * (numerator / (variance * n));

  return Math.min(1, Math.max(-1, I)); // Constrain to [-1, 1]
}

export default function KrigingAnalysis({ messages }: KrigingAnalysisProps) {
  const analysis = useMemo(() => {
    if (!messages.length) {
      return { error: 'No data available', spatialStats: null, predictions: [] };
    }

    // Group observations by location-time grid
    const groups: Map<string, any> = new Map([]);
    const minute = (t: string) => t.slice(0, 16);
    const kind = (t: string) => {
      if (t.includes('humidity')) return 'h';
      if (t.includes('pressure')) return 'p';
      if (t.includes('temp')) return 't';
      return null;
    };

    messages.forEach((msg) => {
      const k = kind(msg.topic);
      if (!k) return;
      const xg = Math.floor(msg.X / 100) * 100 + 50;
      const yg = Math.floor(msg.Y / 100) * 100 + 50;
      const key = `${xg}_${yg}_${minute(msg.createAt)}`;
      if (!groups.has(key)) {
        groups.set(key, { t: [], h: [], p: [], x: xg, y: yg, z: msg.Z });
      }
      const g = groups.get(key)!;
      g[k].push(parseFloat(msg.payload));
      g.z = msg.Z;
    });

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const zoneFromZ = (z: number): string => {
      if (z <= 300) return 'Low (0-300mm)';
      if (z <= 600) return 'Intermediate (301-600mm)';
      return 'High (600mm+)';
    };

    const observations: PCAObservation[] = [];
    const spatialPoints: Array<{ x: number; y: number; z: number }> = [];

    for (const g of groups.values()) {
      if (g.t.length && g.h.length && g.p.length) {
        observations.push({
          temperature: avg(g.t),
          humidity: avg(g.h),
          pressure: avg(g.p),
          zone: zoneFromZ(g.z),
        });
        spatialPoints.push({ x: g.x, y: g.y, z: g.z });
      }
    }

    if (observations.length < 3) {
      return { error: 'Insufficient data for kriging analysis', spatialStats: null, predictions: [] };
    }

    // Compute PCA to get PC2 scores
    const pca = computePCA(observations);

    // Prepare kriging input: observed PC2 values with spatial coordinates
    const observedPoints = pca.scores.map((score, idx) => ({
      x: spatialPoints[idx]?.x || 0,
      y: spatialPoints[idx]?.y || 0,
      pc2: score.pc2,
    }));

    // Generate prediction grid
    const gridSpacing = 100;
    const predictionPoints: Array<{ x: number; y: number }> = [];
    for (let x = 50; x <= 550; x += gridSpacing) {
      for (let y = 50; y <= 550; y += gridSpacing) {
        predictionPoints.push({ x, y });
      }
    }

    // Perform kriging predictions
    const krigedValues = krigePC2(observedPoints, predictionPoints);

    // Calculate spatial statistics
    const moransPoints = observedPoints.map((p) => ({ x: p.x, y: p.y, value: p.pc2 }));
    const morans = moransI(moransPoints);
    const avgPC2 = observedPoints.reduce((sum, p) => sum + p.pc2, 0) / observedPoints.length;
    const stdPC2 = Math.sqrt(observedPoints.reduce((sum, p) => sum + (p.pc2 - avgPC2) ** 2, 0) / observedPoints.length);

    // Group predictions by zones
    const predictionsByDistance: Array<{ distance: string; count: number; avgPC2: number }> = [];
    for (let i = 0; i <= 300; i += 50) {
      const zoneCenter = { x: 300, y: 300 };
      const inZone = krigedValues.filter((p) => {
        const d = Math.sqrt((p.x - zoneCenter.x) ** 2 + (p.y - zoneCenter.y) ** 2);
        return d >= i && d < i + 50;
      });
      if (inZone.length > 0) {
        predictionsByDistance.push({
          distance: `${i}-${i + 50}mm`,
          count: inZone.length,
          avgPC2: inZone.reduce((sum, p) => sum + p.pc2_predicted, 0) / inZone.length,
        });
      }
    }

    return {
      pca,
      spatialStats: {
        moransI: morans,
        spatialAutocorrelation: morans > 0.3 ? 'Strong' : morans > 0 ? 'Moderate' : 'Weak',
        observedCount: observedPoints.length,
        avgPC2,
        stdPC2,
      },
      predictions: krigedValues,
      predictionsByDistance,
      observedPoints,
    };
  }, [messages]);

  if (analysis.error) {
    return (
      <div className="bg-white rounded-lg border border-slate-100 p-6">
        <p className="text-slate-600">{analysis.error}</p>
      </div>
    );
  }

  const stats = analysis.spatialStats!;
  const isSpatiallyDependent = stats.moransI > 0.1;

  return (
    <div className="space-y-6">
      {/* Hypothesis Statement */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h2 className="text-lg font-bold text-blue-900">Hypothesis 2: Localized Micro-Climates</h2>
        <p className="text-sm text-blue-800 mt-2">
          H₀: PC2 shows no spatial autocorrelation; variation is random and not dependent on horizontal location.
        </p>
        <p className="text-sm text-blue-800 mt-1">
          H₁: PC2 exhibits spatial autocorrelation (positive or negative); environmental heterogeneity follows horizontal distance from disturbance sources, independent of Z (height).
        </p>
      </div>

      {/* Test Result Summary */}
      <div className="bg-white rounded-lg border border-slate-100 p-6">
        <div className="flex items-start gap-3">
          {isSpatiallyDependent ? (
            <CheckCircle className="text-green-600 flex-shrink-0 mt-1" size={24} />
          ) : (
            <AlertCircle className="text-orange-600 flex-shrink-0 mt-1" size={24} />
          )}
          <div className="flex-1">
            <h3 className="text-lg font-bold text-slate-900">
              Spatial Autocorrelation Analysis (Moran's I)
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {isSpatiallyDependent
                ? `Significant spatial structure detected (Moran's I = ${stats.moransI.toFixed(3)}). PC2 values show ${stats.spatialAutocorrelation.toLowerCase()} spatial correlation, suggesting environmental heterogeneity follows horizontal patterns.`
                : `Limited spatial autocorrelation detected (Moran's I = ${stats.moransI.toFixed(3)}). PC2 variation appears largely random across horizontal coordinates.`}
            </p>
          </div>
        </div>

        {/* Spatial Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Moran's I</p>
            <p className="text-lg font-semibold text-slate-900">{stats.moransI.toFixed(3)}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Autocorr Type</p>
            <p className="text-lg font-semibold text-slate-900">{stats.spatialAutocorrelation}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Observed Points</p>
            <p className="text-lg font-semibold text-slate-900">{stats.observedCount}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">PC2 Std Dev</p>
            <p className="text-lg font-semibold text-slate-900">{stats.stdPC2.toFixed(3)}</p>
          </div>
        </div>
      </div>

      {/* Kriging Predictions Visualization */}
      {analysis.predictions && analysis.predictions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MapIcon size={20} className="text-slate-700" />
            <h3 className="text-lg font-bold text-slate-900">Kriged PC2 Surface (Inverse Distance Weighting)</h3>
          </div>
          
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
              data={analysis.predictions}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                type="number"
                dataKey="x"
                name="X (mm)"
                domain={[0, 600]}
                stroke="#64748b"
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Y (mm)"
                domain={[0, 600]}
                stroke="#64748b"
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }}
                formatter={(value: any) => value.toFixed(3)}
              />
              <Scatter name="Kriged PC2" data={analysis.predictions} fill="#3b82f6">
                {analysis.predictions.map((point: any, idx: number) => {
                  const normalizedPC2 = (point.pc2_predicted + 3) / 6; // Scale to 0-1
                  const hue = normalizedPC2 * 240; // Blue (240) to Red (0)
                  const color = `hsl(${hue}, 70%, 50%)`;
                  return <Cell key={idx} fill={color} fillOpacity={0.7} />;
                })}
              </Scatter>
              
              {/* Overlay observed points */}
              {analysis.observedPoints && (
                <Scatter
                  name="Observed PC2"
                  data={analysis.observedPoints}
                  fill="#000"
                  shape="diamond"
                >
                  {analysis.observedPoints.map((point: any, idx: number) => (
                    <Cell key={idx} fill="#1f2937" />
                  ))}
                </Scatter>
              )}
            </ScatterChart>
          </ResponsiveContainer>

          <p className="text-xs text-slate-500 mt-3">
            Blue = Low PC2 values | Red = High PC2 values | Black diamonds = Observed measurement points
          </p>
        </div>
      )}

      {/* Distance-based PC2 Distribution */}
      {analysis.predictionsByDistance && analysis.predictionsByDistance.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-100 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-4">
            PC2 Variation by Horizontal Distance from Room Center
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analysis.predictionsByDistance}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="distance" stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip contentStyle={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }} />
              <Legend />
              <Bar dataKey="avgPC2" fill="#06b6d4" name="Mean Kriged PC2" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Interpretation */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <h3 className="font-bold text-slate-900 mb-2">Interpretation</h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          {isSpatiallyDependent
            ? `The kriging analysis reveals ${stats.spatialAutocorrelation.toLowerCase()} spatial structure in PC2 (Moran's I = ${stats.moransI.toFixed(3)}), indicating that environmental heterogeneity is not random but follows horizontal location patterns. This supports Hypothesis 2: micro-climate variations depend on distance from disturbance sources and are independent of height (Z). The kriged surface shows how PC2 varies smoothly across the room, suggesting localized environmental zones driven by horizontal positioning.`
            : `The kriging analysis shows weak spatial autocorrelation (Moran's I = ${stats.moransI.toFixed(3)}), suggesting that PC2 variations are largely uncorrelated with horizontal location. This does not strongly support Hypothesis 2; environmental patterns may be driven more by vertical stratification or random factors than by horizontal distance from disturbance sources.`}
        </p>
      </div>
    </div>
  );
}
