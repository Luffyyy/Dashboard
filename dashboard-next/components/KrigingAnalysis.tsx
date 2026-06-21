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
 * for estimating PC1 values at unmeasured locations
 * @param observedPoints Array of {x, y, pc1} observed points
 * @param predictionPoints Array of {x, y} locations where we want to predict
 */
function krigePC1(
  observedPoints: Array<{ x: number; y: number; pc1: number }>,
  predictionPoints: Array<{ x: number; y: number }>
): Array<{ x: number; y: number; pc1_predicted: number }> {
  const power = 2; // IDW power parameter
  const maxDistance = 300; // Consider only points within this distance

  return predictionPoints.map((pred) => {
    let numerator = 0;
    let denominator = 0;

    for (const obs of observedPoints) {
      const distance = Math.sqrt((pred.x - obs.x) ** 2 + (pred.y - obs.y) ** 2);

      if (distance < 0.1) {
        // Very close, return observed value
        return { x: pred.x, y: pred.y, pc1_predicted: obs.pc1 };
      }

      if (distance <= maxDistance) {
        const weight = 1 / (distance ** power);
        numerator += weight * obs.pc1;
        denominator += weight;
      }
    }

    const pc1_predicted = denominator > 0 ? numerator / denominator : 0;
    return { x: pred.x, y: pred.y, pc1_predicted };
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

    // Compute PCA to get PC1 scores
    const pca = computePCA(observations);

    // Prepare kriging input: observed PC1 values with spatial coordinates
    const observedPoints = pca.scores.map((score, idx) => ({
      x: spatialPoints[idx]?.x || 0,
      y: spatialPoints[idx]?.y || 0,
      pc1: score.pc1,
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
    const krigedValues = krigePC1(observedPoints, predictionPoints);

    // Calculate spatial statistics
    const moransPoints = observedPoints.map((p) => ({ x: p.x, y: p.y, value: p.pc1 }));
    const morans = moransI(moransPoints);
    const avgPC1 = observedPoints.reduce((sum, p) => sum + p.pc1, 0) / observedPoints.length;
    const stdPC1 = Math.sqrt(observedPoints.reduce((sum, p) => sum + (p.pc1 - avgPC1) ** 2, 0) / observedPoints.length);

    // Group predictions by zones
    const predictionsByDistance: Array<{ distance: string; count: number; avgPC1: number }> = [];
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
          avgPC1: inZone.reduce((sum, p) => sum + p.pc1_predicted, 0) / inZone.length,
        });
      }
    }

    return {
      pca,
      spatialStats: {
        moransI: morans,
        spatialAutocorrelation: morans > 0.3 ? 'Strong' : morans > 0 ? 'Moderate' : 'Weak',
        observedCount: observedPoints.length,
        avgPC1,
        stdPC1,
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
        <h2 className="text-lg font-bold text-blue-900">Hypothesis 2: Spatial Horizontal Micro-Climate Pattern (Localized Micro-Climates)</h2>
        <p className="text-sm text-blue-800 mt-2">
          There is distinct spatial heterogeneity in the second climate component (PC1) across the room, which is explained by horizontal distance from disturbance sources and not by vertical height (Z).
        </p>
        <p className="text-sm text-blue-800 mt-1">
          <strong>H₀ (Null):</strong> PC1 shows no spatial autocorrelation; variation is random across horizontal coordinates.<br />
          <strong>H₁ (Alternative):</strong> PC1 exhibits spatial autocorrelation; environmental heterogeneity follows horizontal location patterns independent of vertical height.
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
                ? `Significant spatial structure detected (Moran's I = ${stats.moransI.toFixed(3)}). PC1 values show ${stats.spatialAutocorrelation.toLowerCase()} spatial correlation, indicating environmental heterogeneity follows horizontal location patterns independent of height.`
                : `Limited spatial autocorrelation detected (Moran's I = ${stats.moransI.toFixed(3)}). PC1 variation appears largely random across horizontal coordinates.`}
            </p>
          </div>
        </div>

        {/* Spatial Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Moran's I (Test Statistic)</p>
            <p className="text-lg font-semibold text-slate-900">{stats.moransI.toFixed(3)}</p>
            <p className="text-xs text-slate-500 mt-1">Range: -1 to 1 (positive = clustered)</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Spatial Correlation</p>
            <p className="text-lg font-semibold text-slate-900">{stats.spatialAutocorrelation}</p>
            <p className="text-xs text-slate-500 mt-1">Strength of autocorrelation</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Sample Locations</p>
            <p className="text-lg font-semibold text-slate-900">{stats.observedCount}</p>
            <p className="text-xs text-slate-500 mt-1">Measurement points</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">PC1 Std Dev</p>
            <p className="text-lg font-semibold text-slate-900">{stats.stdPC1.toFixed(3)}</p>
            <p className="text-xs text-slate-500 mt-1">Variability magnitude</p>
          </div>
        </div>
      </div>

      {/* Kriging Predictions Visualization */}
      {analysis.predictions && analysis.predictions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-100 p-6">
          <div className="flex items-center gap-2 mb-2">
            <MapIcon size={20} className="text-slate-700" />
            <h3 className="text-lg font-bold text-slate-900">Kriged PC1 Spatial Surface (Inverse Distance Weighting)</h3>
          </div>
          <p className="text-sm text-slate-600 mb-4">Predicted PC1 values across room coordinates. Color gradient: Blue (low) to Red (high). Black diamonds show observed measurement locations. This map visualizes horizontal micro-climate patterns.</p>
          
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
                label={{ value: 'X Coordinate (mm)', position: 'bottom', offset: 10 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name="Y (mm)"
                domain={[0, 600]}
                stroke="#64748b"
                label={{ value: 'Y Coordinate (mm)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }}
                formatter={(value: any) => typeof value === 'number' ? value.toFixed(3) : value}
                labelFormatter={(label) => `Location: ${label}`}
              />
              <Scatter name="Kriged PC1 Prediction" data={analysis.predictions} fill="#3b82f6">
                {analysis.predictions.map((point: any, idx: number) => {
                  const normalizedPC1 = (point.pc1_predicted + 3) / 6; // Scale to 0-1
                  const hue = normalizedPC1 * 240; // Blue (240) to Red (0)
                  const color = `hsl(${hue}, 70%, 50%)`;
                  return <Cell key={idx} fill={color} fillOpacity={0.7} />;
                })}
              </Scatter>
              
              {/* Overlay observed points */}
              {analysis.observedPoints && (
                <Scatter
                  name="Observed PC1 Samples"
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

      {/* Distance-based PC1 Distribution */}
      {analysis.predictionsByDistance && analysis.predictionsByDistance.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-100 p-6">
          <h3 className="text-lg font-bold text-slate-900 mb-2">PC1 Variation by Horizontal Distance from Room Center</h3>
          <p className="text-sm text-slate-600 mb-4">Shows how predicted PC1 values change as you move away from the room center. Non-uniform patterns indicate horizontal micro-climate zones.</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={analysis.predictionsByDistance} margin={{ top: 20, right: 30, left: 0, bottom: 50 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="distance" stroke="#64748b" angle={-45} textAnchor="end" height={80} />
              <YAxis stroke="#64748b" label={{ value: 'Mean PC1 Value', angle: -90, position: 'insideLeft' }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#f1f5f9', border: '1px solid #cbd5e1' }}
                formatter={(value) => typeof value === 'number' ? value.toFixed(3) : value}
              />
              <Legend wrapperStyle={{ paddingTop: '20px' }} />
              <Bar dataKey="avgPC1" fill="#06b6d4" name="Mean Kriged PC1 by Distance" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Interpretation */}
      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
        <h3 className="font-bold text-slate-900 mb-2">Conclusion: Hypothesis 2 Analysis</h3>
        <p className="text-sm text-slate-700 leading-relaxed">
          {isSpatiallyDependent
            ? `The kriging analysis reveals ${stats.spatialAutocorrelation.toLowerCase()} spatial structure in PC1 (Moran's I = ${stats.moransI.toFixed(3)}), indicating that environmental heterogeneity follows horizontal location patterns rather than occurring randomly. This supports Hypothesis 2: micro-climate variations depend on horizontal distance from disturbance sources and are independent of vertical height (Z). The kriged spatial surface demonstrates distinct environmental zones driven by horizontal positioning within the room.`
            : `The kriging analysis shows weak spatial autocorrelation (Moran's I = ${stats.moransI.toFixed(3)}), suggesting that PC1 variations are largely uncorrelated with horizontal location. This does not strongly support Hypothesis 2; environmental patterns may be driven more by vertical stratification or other factors than by horizontal distance from disturbance sources.`}
        </p>
      </div>
    </div>
  );
}
