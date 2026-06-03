"use client";
import React, { useMemo } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { HeightZone, type MQTTMessage } from './DashboardClientWrapper';

interface BinnedNode {
  x: number;
  y: number;
  count: number;
  hasWarning: boolean;
  rawMessage: MQTTMessage;
}

interface SpatialMapProps {
  binnedData: BinnedNode[];
  selectedMessage: MQTTMessage | null;
  latestMessage: MQTTMessage | null;
  activeFilter: HeightZone;
  onFilterChange: (zone: HeightZone) => void;
  onSelectMessage: (msg: MQTTMessage) => void;
}

// Reusable Sub-component for Legend Items
const LegendItem = ({ colorClass, text }: { colorClass: string; text: string }) => (
  <div className="flex items-center gap-1.5">
    <span className={`w-2 h-2 rounded-full ${colorClass}`} />
    <span>{text}</span>
  </div>
);

// Centralized helper to map any point to its 100mm grid sector center
const getGridCenter = (val: number | undefined): number => {
  if (val === undefined) return 0;
  return Math.floor(val / 100) * 100 + 50;
};

type ScatterPoint = Partial<BinnedNode> & {
  payload?: BinnedNode;
  rawMessage?: MQTTMessage;
};

export default function SpatialMap({ binnedData, selectedMessage, latestMessage, activeFilter, onFilterChange, onSelectMessage }: SpatialMapProps) {
  
  // Memoize targets to avoid running division loops for every single cell mapping execution frame
  const boundaryTargets = useMemo(() => ({
    selected: {
      x: getGridCenter(selectedMessage?.X),
      y: getGridCenter(selectedMessage?.Y),
    },
    live: {
      x: getGridCenter(latestMessage?.X),
      y: getGridCenter(latestMessage?.Y),
    }
  }), [selectedMessage, latestMessage]);

  const handlePointSelection = (point: ScatterPoint) => {
    if (point?.rawMessage) onSelectMessage(point.rawMessage);
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-between h-full min-h-120 lg:col-span-1">
      <div>
        {/* Header toolbar component splits */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4 mb-3">
          <div>
            <h3 className="font-semibold text-slate-700">Room Spatial Grid</h3>
            <p className="text-[11px] text-slate-400">Select map nodes to inspect grid snapshots.</p>
          </div>
          
          <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200/60 self-start sm:self-auto shrink-0">
            {Object.values(HeightZone).map((zone) => (
              <button
                key={zone}
                onClick={() => onFilterChange(zone)}
                className={`text-[10px] font-bold px-2.5 py-1 rounded-md transition-all uppercase tracking-wide ${
                  activeFilter === zone ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {zone.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Height Threshold Legend Guide */}
        <div className="bg-slate-50/60 border border-slate-100 p-2 rounded-lg mb-4 space-y-1.5">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-slate-400 block">Z-Height Layer Guide</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 font-medium">
            <LegendItem colorClass="bg-blue-500 opacity-60" text="Low (0-300mm)" />
            <LegendItem colorClass="bg-blue-500" text="Inter. (301-600mm)" />
            <LegendItem colorClass="bg-rose-500" text="High (600mm+)" />
          </div>
          <p className="text-[10px] text-slate-400 mt-2">Sector radius: 50 mm (±50 mm in X/Y — 100×100 mm area)</p>
        </div>
      </div>

      {/* Grid Scatter Canvas Space */}
      <div className="bg-slate-50 rounded-xl border border-slate-100 p-3 flex-1 relative h-77.5">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 15, right: 15, bottom: 5, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            
            <XAxis type="number" dataKey="x" name="X Coord" domain={[0, 1200]} tickCount={7} fontSize={10} stroke="#94a3b8" label={{ value: 'X Axis (mm)', position: 'insideBottom', offset: -5, fontSize: 9, fill: '#94a3b8', fontWeight: 600 }} />
            <YAxis type="number" dataKey="y" name="Y Coord" domain={[0, 1200]} tickCount={7} fontSize={10} stroke="#94a3b8" label={{ value: 'Y Axis (mm)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: '#94a3b8', fontWeight: 600 }} />
            <ZAxis type="number" dataKey="count" range={[100, 260]} />
            
            <Tooltip 
              cursor={{ strokeDasharray: '3 3' }} 
              content={({ active, payload }) => {
                if (active && payload?.length) {
                  const data = payload[0].payload;
                  return (
                    <div className="bg-slate-900 text-white font-mono text-[10px] p-2 rounded-md shadow-md">
                      <p className={`${data.hasWarning ? 'text-red-400 font-bold' : 'text-blue-400'} mb-1`}>
                        {data.hasWarning ? '⚠️ Warning Threshold Crossed' : 'Grid Sector'}
                      </p>
                      <p>Center Matrix: ({data.x}, {data.y})</p>
                      <p>Captured Events: {data.count}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            
            <Scatter name="Telemetry Nodes" data={binnedData} onClick={handlePointSelection} className="cursor-pointer">
              {binnedData.map((entry, index) => {
                // Check state intersections via pre-calculated center points
                const isSelected = selectedMessage && entry.x === boundaryTargets.selected.x && entry.y === boundaryTargets.selected.y;
                const isRealtimeLive = latestMessage && entry.x === boundaryTargets.live.x && entry.y === boundaryTargets.live.y;

                // Determine styling payload parameters dynamically
                let nodeColor = '#3b82f6';
                if (entry.hasWarning) nodeColor = '#ef4444';
                if (isSelected) nodeColor = '#2563eb';

                return (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={nodeColor} 
                    fillOpacity={isSelected || isRealtimeLive ? 1 : 0.45}
                    stroke={isRealtimeLive ? '#10b981' : isSelected ? '#ffffff' : nodeColor}
                    strokeWidth={isRealtimeLive ? 3 : isSelected ? 2 : 1}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}