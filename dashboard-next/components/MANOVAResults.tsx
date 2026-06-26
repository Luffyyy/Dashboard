'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import { computePCA, type PCAObservation } from '../lib/pca';
import { computeMANOVA, type MANOVAResult } from '../lib/manova';

interface MANOVAResultsProps {
  messages: MQTTMessage[];
}

type ZoneSummary = {
  zone: string;
  count: number;
  pc1: number;
  pc2: number;
  temperature: number;
  humidity: number;
  pressure: number;
};

type MANOVAViewModel = {
  pca: (Awaited<ReturnType<typeof computePCA>> & { zoneStats: ZoneSummary[] }) | null;
  manovaResult: MANOVAResult | null;
};

const chartLegendItems = [
  { label: 'PC1', color: '#0ea5e9', description: 'Principal component 1' },
  { label: 'PC2', color: '#6366f1', description: 'Principal component 2' },
];

export default function MANOVAResults({ messages }: MANOVAResultsProps) {
  // Recompute PCA data to get observations
  const { pca, manovaResult } = useMemo(() => {
    const defaultReturn: MANOVAViewModel = { pca: null, manovaResult: null };
    
    if (!messages.length) {
      return defaultReturn;
    }

    // Group data by location and minute (same as PCABiplot)
    const groups = new Map<string, { t: number[]; h: number[]; p: number[]; z: number }>();
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
      const xg = Math.round(msg.x * 2) / 2;
      const yg = Math.round(msg.y * 2) / 2;
      const key = `${xg}_${yg}_${minute(msg.createAt)}`;
      if (!groups.has(key)) {
        groups.set(key, { t: [], h: [], p: [], z: msg.z });
      }
      const g = groups.get(key)!;
      g[k].push(parseFloat(msg.payload));
      g.z = msg.z;
    });

    const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

    // Helper to map Z to zone
    const zoneFromZ = (z: number): string => {
      if (z <= 0.3) return 'Low (0-0.3 m)';
      if (z <= 0.6) return 'Intermediate (0.3-0.6 m)';
      return 'High (0.6 m+)';
    };

    const observations: PCAObservation[] = [];

    for (const g of groups.values()) {
      if (g.t.length && g.h.length && g.p.length) {
        observations.push({
          temperature: avg(g.t),
          humidity: avg(g.h),
          pressure: avg(g.p),
          zone: zoneFromZ(g.z),
        });
      }
    }

    if (observations.length < 3) {
      return defaultReturn;
    }

    const pcaResult = computePCA(observations);
    if (!pcaResult) return defaultReturn;

    const zoneSummaries = new Map<
      string,
      {
        count: number;
        sums: [number, number, number, number, number];
      }
    >();

    for (const score of pcaResult.scores) {
      if (!zoneSummaries.has(score.zone)) {
        zoneSummaries.set(score.zone, { count: 0, sums: [0, 0, 0, 0, 0] });
      }
      const summary = zoneSummaries.get(score.zone)!;
      summary.count += 1;
      summary.sums[0] += score.pc1;
      summary.sums[1] += score.pc2;
      summary.sums[2] += score.temperature;
      summary.sums[3] += score.humidity;
      summary.sums[4] += score.pressure;
    }

    const zoneStats: ZoneSummary[] = Array.from(zoneSummaries.entries()).map(([zone, summary]) => ({
      zone,
      count: summary.count,
      pc1: summary.sums[0] / summary.count,
      pc2: summary.sums[1] / summary.count,
      temperature: summary.sums[2] / summary.count,
      humidity: summary.sums[3] / summary.count,
      pressure: summary.sums[4] / summary.count,
    }));

    // Prepare data for MANOVA
    const manovaData = pcaResult.scores.map((s) => ({
      pc1: s.pc1,
      pc2: s.pc2,
      zone: s.zone,
    }));

    const manovaResult = computeMANOVA(manovaData);

    return { pca: { ...pcaResult, zoneStats }, manovaResult };
  }, [messages]);

  if (!manovaResult || !pca) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-slate-500">
        Insufficient data for MANOVA analysis
      </div>
    );
  }

  const zoneStats = pca.zoneStats;

  // Prepare data for group means visualization
  const meansData = zoneStats.map((summary) => {
    return {
      zone: summary.zone,
      'PC1': parseFloat(summary.pc1.toFixed(3)),
      'PC2': parseFloat(summary.pc2.toFixed(3)),
    };
  });

  const isSignificant = manovaResult!.pValue < 0.05;

  return (
    <div className="space-y-6">
      {/* Hypothesis Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Hypothesis 1: Thermal-Vertical Stratification Pattern (Stratification)</h3>
        <p className="text-sm text-blue-800 mb-2">
          There is a significant difference in the PCA climate components between different height zones (Z) in the room.
        </p>
        <p className="text-sm text-blue-800">
          <strong>H₀ (Null):</strong> The mean vector of PC1 and PC2 is equal across height zones.<br />
          <strong>H₁ (Alternative):</strong> At least one height zone has a different mean vector in the PCA space.
        </p>
      </div>

      {/* Test Results Card */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-start gap-3 mb-4">
          {isSignificant ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="font-semibold text-slate-900">MANOVA Test Results</h3>
            <p className={`text-sm ${isSignificant ? 'text-emerald-700' : 'text-amber-700'} mt-1`}>
              {manovaResult.testConclusion}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Wilks&apos; Lambda (Multivariate Test)</p>
            <p className="text-lg font-semibold text-slate-900">{(manovaResult!.wilksLambda).toFixed(4)}</p>
            <p className="text-xs text-slate-500 mt-1">Smaller values indicate stronger group differences</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Pillai&apos;s Trace</p>
            <p className="text-lg font-semibold text-slate-900">{(manovaResult!.pillaiTrace).toFixed(4)}</p>
            <p className="text-xs text-slate-500 mt-1">Larger values indicate stronger effects</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">p-value (Significance)</p>
            <p className={`text-lg font-semibold ${isSignificant ? 'text-green-700' : 'text-red-700'}`}>
              {(manovaResult!.pValue).toFixed(6)}
            </p>
            <p className="text-xs text-slate-500 mt-1">{isSignificant ? 'p < 0.05: Significant' : 'p ≥ 0.05: Not Significant'}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">F-Statistic</p>
            <p className="text-lg font-semibold text-slate-900">{manovaResult!.f.toFixed(3)}</p>
            <p className="text-xs text-slate-500 mt-1">Test statistic for hypothesis</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Degrees of Freedom</p>
            <p className="text-lg font-semibold text-slate-900">{manovaResult!.dfNum.toFixed(0)}/{manovaResult!.dfDen.toFixed(0)}</p>
            <p className="text-xs text-slate-500 mt-1">Numerator/Denominator</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Effect Size (η²)</p>
            <p className="text-lg font-semibold text-slate-900">{manovaResult!.effectSize.toFixed(4)}</p>
            <p className="text-xs text-slate-500 mt-1">Proportion of variance</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Sample Size</p>
            <p className="text-lg font-semibold text-slate-900">{String(Object.values(manovaResult.groupSizes).reduce((a, b) => (a as number) + (b as number), 0))}</p>
          </div>
          <div className="bg-slate-50 p-3 rounded">
            <p className="text-xs text-slate-600 font-medium">Groups (k)</p>
            <p className="text-lg font-semibold text-slate-900">{manovaResult.groups.length}</p>
          </div>
        </div>
      </div>

      {/* Group Means Comparison */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-900 mb-2">Mean Values by Height Zone</h3>
        <p className="text-sm text-slate-600 mb-4">PC1 and PC2 are the PCA outputs used in the hypothesis test. Temperature is omitted from this graph because it is already represented inside the PCA step.</p>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={meansData} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="zone" />
            <YAxis yAxisId="left" label={{ value: 'PC Values', angle: -90, position: 'insideLeft' }} />
            <Tooltip formatter={(value) => typeof value === 'number' ? value.toFixed(2) : value} />
            <Legend
              verticalAlign="top"
              align="right"
              wrapperStyle={{ paddingBottom: '12px' }}
              content={() => (
                <div className="flex flex-wrap justify-end gap-3 text-xs text-slate-600">
                  {chartLegendItems.map((item) => (
                    <div key={item.label} className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="font-semibold text-slate-700">{item.label}</span>
                      <span className="text-slate-500">{item.description}</span>
                    </div>
                  ))}
                </div>
              )}
            />
            <Bar yAxisId="left" dataKey="PC2" fill="#6366f1" name="PC2 (Stratification)" />
            <Bar yAxisId="left" dataKey="PC1" fill="#0ea5e9" name="PC1" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Group Statistics Table */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="font-semibold text-slate-900 mb-4">Descriptive Statistics by Zone</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="px-4 py-2 text-left text-slate-700 font-semibold">Zone</th>
                <th className="px-4 py-2 text-right text-slate-700 font-semibold">N</th>
                <th className="px-4 py-2 text-right text-slate-700 font-semibold">PC1 Mean</th>
                <th className="px-4 py-2 text-right text-slate-700 font-semibold">PC2 Mean</th>
                <th className="px-4 py-2 text-right text-slate-700 font-semibold">Temp (°C)</th>
                <th className="px-4 py-2 text-right text-slate-700 font-semibold">Humidity (%)</th>
                <th className="px-4 py-2 text-right text-slate-700 font-semibold">Pressure (hPa)</th>
              </tr>
            </thead>
            <tbody>
              {manovaResult.groups.map((zone: string, idx: number) => {
                const summary = zoneStats.find((entry) => entry.zone === zone);
                const means = manovaResult!.means[zone];
                const size = summary?.count ?? manovaResult!.groupSizes[zone];
                return (
                  <tr key={zone} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-2 text-slate-900">{zone}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{size}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{means[0].toFixed(3)}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{means[1].toFixed(3)}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{summary ? summary.temperature.toFixed(2) : '0.00'}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{summary ? summary.humidity.toFixed(2) : '0.00'}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{summary ? summary.pressure.toFixed(1) : '0.0'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statistical Interpretation */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <h3 className="font-semibold text-amber-900 mb-2">Interpretation</h3>
        <ul className="text-sm text-amber-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Wilks&apos; Lambda (Λ):</strong> Ranges from 0 to 1. Lower values indicate greater differences between groups. Λ = {manovaResult.wilksLambda.toFixed(4)}.
          </li>
          <li>
            <strong>Pillai&apos;s Trace:</strong> Complement of Wilks&apos; Lambda, ranging 0–1. Higher values indicate stronger group differences. Value = {manovaResult.pillaiTrace.toFixed(4)}.
          </li>
          <li>
            <strong>F-Statistic:</strong> Approximate F-distribution test ({manovaResult.dfNum.toFixed(0)}, {manovaResult.dfDen.toFixed(0)} df). F = {manovaResult.f.toFixed(3)}.
          </li>
          <li>
            <strong>p-Value:</strong> Probability of observing this data under H₀. p = {manovaResult.pValue.toFixed(6)} {isSignificant ? '< 0.05 ✓' : '≥ 0.05'}.
          </li>
          <li>
            <strong>Effect Size (η²):</strong> Proportion of multivariate variance explained by zone membership. η² = {manovaResult.effectSize.toFixed(4)}.
          </li>
        </ul>
      </div>

      {/* Conclusion */}
      <div className={`${isSignificant ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'} border rounded-lg p-4`}>
        <h3 className={`font-semibold ${isSignificant ? 'text-emerald-900' : 'text-slate-900'} mb-2`}>
          Conclusion
        </h3>
        <p className={`text-sm ${isSignificant ? 'text-emerald-800' : 'text-slate-700'}`}>
          {isSignificant
            ? `At the α = 0.05 significance level, we REJECT the null hypothesis (p = ${manovaResult.pValue.toFixed(6)}). There is statistically significant evidence that the PCA climate pattern differs meaningfully across height zones. PC1 and PC2 show systematic stratification within the room.`
            : `At the α = 0.05 significance level, we FAIL TO REJECT the null hypothesis (p = ${manovaResult.pValue.toFixed(6)}). There is insufficient evidence to conclude that the PCA mean vectors differ significantly across height zones.`}
        </p>
      </div>
    </div>
  );
}
