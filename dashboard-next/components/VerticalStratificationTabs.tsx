// components/VerticalStratificationTabs.tsx
'use client';

import React, { useState } from 'react';
import { Thermometer, Droplets } from 'lucide-react';
import type { MQTTMessage } from './DashboardClientWrapper';
import BaseANOVAResults from './BaseANOVAResults';

interface VerticalStratificationTabsProps {
  messages: MQTTMessage[];
}

export default function VerticalStratificationTabs({ messages }: VerticalStratificationTabsProps) {
  const [subTab, setSubTab] = useState<'temperature' | 'humidity'>('temperature');

const temperatureConfig = {
    key: 'temperature' as const,
    label: 'Temperature',
    unit: '°C',
    barColor: '#d97706',
    chartMinMaxPadding: 1,
    hypothesisTitle: 'Hypothesis 1: Vertical Thermal Stratification',
    description: 'Measures whether thermal buoyancy (hot air rising, cool air settling) creates statistically distinct ambient environments across room heights.',
    nullHypothesis: {
      formula: 'μ₁ = μ₂ = μ₃',
      meaning: 'The true mean temperatures are uniform across all vertical zones. Elevation has no effect.'
    },
    altHypothesis: {
      formula: 'μᵢ ≠ μⱼ for some i, j',
      meaning: 'At least one vertical zone has a significantly different mean temperature, confirming room stratification.'
    },
    bannerBg: 'bg-amber-50/60',
    bannerText: 'text-amber-900',
    bannerBorder: 'border-amber-200',
    getConclusion: (pValue: number, isSignificant: boolean) => isSignificant
      ? `At the α = 0.05 significance level, we REJECT the null hypothesis (p = ${pValue.toExponential(4)}). There is statistically significant evidence that temperature profiles differ across height zones, confirming vertical thermal stratification.`
      : `At the α = 0.05 significance level, we FAIL TO REJECT the null hypothesis (p = ${pValue.toFixed(6)}). There is insufficient empirical evidence to conclude that mean temperatures differ across height zones.`
  };

  const humidityConfig = {
    key: 'humidity' as const,
    label: 'Humidity',
    unit: '%',
    barColor: '#0284c7',
    chartMinMaxPadding: 2,
    hypothesisTitle: 'Hypothesis 2: Low-Level Moisture Accumulation',
    description: 'Measures whether structural boundaries or microclimate conditions cause humidity to collect disproportionately in lower vertical layers (0–300 mm).',
    nullHypothesis: {
      formula: 'μ₁ = μ₂ = μ₃',
      meaning: 'The true mean humidity levels are equal across all room elevation zones.'
    },
    altHypothesis: {
      formula: 'μᵢ ≠ μⱼ for some i, j',
      meaning: 'At least one vertical zone exhibits a shifted baseline humidity level, indicating moisture stratification.'
    },
    bannerBg: 'bg-sky-50',
    bannerText: 'text-sky-900',
    bannerBorder: 'border-sky-150',
    getConclusion: (pValue: number, isSignificant: boolean) => isSignificant
      ? `At the α = 0.05 significance level, we REJECT the null hypothesis (p = ${pValue.toExponential(4)}). There is statistically significant evidence that humidity differs across height zones, confirming vertical moisture accumulation.`
      : `At the α = 0.05 significance level, we FAIL TO REJECT the null hypothesis (p = ${pValue.toFixed(6)}). There is insufficient statistical evidence to state that mean humidity levels vary systematically by height zone.`
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="bg-white border border-slate-200 rounded-xl p-2 flex gap-2 max-w-md shadow-sm">
        <button
          type="button"
          onClick={() => setSubTab('temperature')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
            subTab === 'temperature'
              ? 'bg-amber-500 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Thermometer className="w-4 h-4" />
          Thermal Stratification
        </button>
        <button
          type="button"
          onClick={() => setSubTab('humidity')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all ${
            subTab === 'humidity'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Droplets className="w-4 h-4" />
          Moisture Accumulation
        </button>
      </div>

      <div className="transition-all duration-200">
        <BaseANOVAResults 
          messages={messages} 
          config={subTab === 'temperature' ? temperatureConfig : humidityConfig} 
        />
      </div>
    </div>
  );
}