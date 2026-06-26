"use client";
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Upload, RotateCcw, Loader2, FileJson } from 'lucide-react';
import SpatialMap from './SpatialMap';
import MetricChart from './MetricChart';
import TimePlaybackController from './TimePlaybackController';
import PCABiplot from './PCABiplot';
import MANOVAResults from './MANOVAResults';
import KrigingAnalysis from './KrigingAnalysis';
import { formatTimestampDay, formatTimestampTime, getTimestampMinutes } from '../lib/time';

export interface MQTTMessage {
  id: string;
  createAt: string;
  payload: string;
  X: number;
  Y: number;
  Z: number;
  topic: string;
}

interface WrapperProps {
  initialMessages: MQTTMessage[];
  defaultConnectionLabel?: string;
  brokerHost: string;
  clientId: string;
}

export enum HeightZone {
  LOW = 'Low',
  INTERMEDIATE = 'Intermediate',
  HIGH = 'High'
}

function getHeightZone(z: number | string): HeightZone {
  if (typeof z === 'string') {
    const s = z.toLowerCase();
    if (s.includes('low')) return HeightZone.LOW;
    if (s.includes('inter')) return HeightZone.INTERMEDIATE;
    if (s.includes('high')) return HeightZone.HIGH;
    return HeightZone.INTERMEDIATE;
  }

  // If a numeric value is provided, treat it as meters and fall back to sensible thresholds
  if (typeof z === 'number') {
    if (z <= 0.3) return HeightZone.LOW;
    if (z <= 0.6) return HeightZone.INTERMEDIATE;
    return HeightZone.HIGH;
  }

  return HeightZone.INTERMEDIATE;
}

function getDatasetDefaults(messages: MQTTMessage[]) {
  if (!messages.length) {
    return {
      latestValidMessage: null as MQTTMessage | null,
      defaultDay: '',
      defaultEndMinutesValue: 1440,
      activeHeightFilter: HeightZone.INTERMEDIATE,
    };
  }

  let latestValidMessage: MQTTMessage | null = null;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].X !== undefined && messages[i].Y !== undefined) {
      latestValidMessage = messages[i];
      break;
    }
  }

  const days = new Set<string>();
  messages.forEach((message) => days.add(formatTimestampDay(message.createAt)));
  const defaultDay = Array.from(days).sort().at(-1) || '';
  const defaultEndMinutesValue = latestValidMessage ? getTimestampMinutes(latestValidMessage.createAt) ?? 1440 : 1440;

  return {
    latestValidMessage,
    defaultDay,
    defaultEndMinutesValue,
    activeHeightFilter: latestValidMessage ? getHeightZone(latestValidMessage.Z) : HeightZone.INTERMEDIATE,
  };
}

type DashboardDataset = {
  messages: MQTTMessage[];
  brokerHost: string;
  clientId: string;
  label: string;
};

function extractDatasetFromJson(json: unknown, fallbackHost: string, fallbackClientId: string): DashboardDataset {
  const candidateArray = Array.isArray(json) ? json : [json];

  for (const entry of candidateArray) {
    if (!entry || typeof entry !== 'object') continue;

    const record = entry as Partial<{
      messages: MQTTMessage[];
      host: string;
      clientId: string;
      name: string;
      id: string;
    }>;

    if (Array.isArray(record.messages)) {
      return {
        messages: record.messages,
        brokerHost: record.host || fallbackHost,
        clientId: record.clientId || fallbackClientId,
        label: record.name || record.id || 'Uploaded JSON',
      };
    }
  }

  return {
    messages: [],
    brokerHost: fallbackHost,
    clientId: fallbackClientId,
    label: 'Uploaded JSON',
  };
}

function checkWarning(topic: string, val: number): boolean {
  if (topic.includes('temp') && val > 25.00) return true;
  if (topic.includes('humidity') && (val < 40.0 || val > 70.0)) return true;
  if (topic.includes('pressure') && (val < 950.0 || val > 1050.0)) return true;
  return false;
}

function getSectorCenter(message: MQTTMessage | null) {
  if (!message) return null;
  // X/Y are now in meters; use 1m grid cells with centers at .5, 1.5, ...
  return {
    x: Math.floor(message.X) + 0.5,
    y: Math.floor(message.Y) + 0.5,
  };
}

export default function DashboardClientWrapper({ initialMessages, brokerHost, clientId, defaultConnectionLabel = 'Default JSON' }: WrapperProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const defaultDataset = useMemo(() => ({
    messages: initialMessages,
    brokerHost,
    clientId,
    label: defaultConnectionLabel,
  }), [defaultConnectionLabel, initialMessages, brokerHost, clientId]);

  const [dataset, setDataset] = useState(defaultDataset);
  const [isLoadingDataset, setIsLoadingDataset] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const defaultViewState = useMemo(() => getDatasetDefaults(defaultDataset.messages), [defaultDataset.messages]);
  
  // Isolate latest message containing valid coordinates
  const latestValidMessage = useMemo(() => {
    return getDatasetDefaults(dataset.messages).latestValidMessage;
  }, [dataset.messages]);

  const availableDays = useMemo(() => {
    const days = new Set<string>();
    dataset.messages.forEach((m) => days.add(formatTimestampDay(m.createAt)));
    return Array.from(days).sort();
  }, [dataset.messages]);

  const defaultDay = defaultViewState.defaultDay;

  const defaultEndMinutesValue = defaultViewState.defaultEndMinutesValue;

  // View States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'pca' | 'manova' | 'kriging'>('dashboard');
  const [selectedDay, setSelectedDay] = useState<string>(defaultDay);
  const [startTimeMinutes, setStartTimeMinutes] = useState<number>(0);
  const [endTimeMinutes, setEndTimeMinutes] = useState<number>(defaultEndMinutesValue);
  const [selectedMessage, setSelectedMessage] = useState<MQTTMessage | null>(latestValidMessage);
  const [activeHeightFilter, setActiveHeightFilter] = useState<HeightZone>(defaultViewState.activeHeightFilter);

  const isLive = selectedDay === defaultDay && endTimeMinutes >= defaultEndMinutesValue && startTimeMinutes === 0;
  const latestSector = useMemo(() => getSectorCenter(latestValidMessage), [latestValidMessage]);

  const latestRobotPosition = useMemo(() => {
    if (!latestValidMessage) return null;
    return {
      x: latestValidMessage.X,
      y: latestValidMessage.Y,
      zLabel: getHeightZone(latestValidMessage.Z),
      zValue: latestValidMessage.Z,
    };
  }, [latestValidMessage]);

  // Filter messages based on playback timeline parameters
  const historicalTimeScopeMessages = useMemo(() => {
    return dataset.messages.filter((m) => {
      if (formatTimestampDay(m.createAt) !== selectedDay) return false;

      const msgMinutes = getTimestampMinutes(m.createAt);
      if (msgMinutes === null) return false;

      return msgMinutes >= startTimeMinutes && msgMinutes <= endTimeMinutes;
    });
  }, [dataset.messages, selectedDay, startTimeMinutes, endTimeMinutes]);

  const selectedMessageForViews = useMemo(() => {
    if (selectedMessage && historicalTimeScopeMessages.some((message) => message.id === selectedMessage.id)) {
      return selectedMessage;
    }

    for (let i = historicalTimeScopeMessages.length - 1; i >= 0; i--) {
      if (historicalTimeScopeMessages[i].X !== undefined && historicalTimeScopeMessages[i].Y !== undefined) {
        return historicalTimeScopeMessages[i];
      }
    }

    return historicalTimeScopeMessages[historicalTimeScopeMessages.length - 1] ?? latestValidMessage;
  }, [historicalTimeScopeMessages, latestValidMessage, selectedMessage]);

  // Refactored unified timeline processing extraction mapping helper loop
  const timelines = useMemo(() => {
    const mapTopic = (kw: string) => historicalTimeScopeMessages
      .filter((m) => m.topic.includes(kw))
      .map((m) => ({ time: formatTimestampTime(m.createAt), value: parseFloat(m.payload), id: m.id, x: m.X, y: m.Y }));

    return {
      temperature: mapTopic('temp'),
      humidity: mapTopic('humidity'),
      pressure: mapTopic('pressure')
    };
  }, [historicalTimeScopeMessages]);

  // Dynamic Cache Mapping layout for multi-layer map quadrant boxes
  const preBinnedGridData = useMemo(() => {
    const zones = {
      [HeightZone.LOW]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
      [HeightZone.INTERMEDIATE]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
      [HeightZone.HIGH]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
    };

    historicalTimeScopeMessages.forEach((m) => {
      const zone = getHeightZone(m.Z);
      // X/Y are in meters; bin into 1m cells and use the center (e.g. 0.5, 1.5)
      const xGrid = Math.floor(m.X) + 0.5;
      const yGrid = Math.floor(m.Y) + 0.5;
      const key = `${xGrid}_${yGrid}`;

      const targetMap = zones[zone];
      if (!targetMap.has(key)) {
        targetMap.set(key, { xGrid, yGrid, sourceLogs: [], hasWarning: false });
      }
      
      const entry = targetMap.get(key)!;
      entry.sourceLogs.push(m);
      if (checkWarning(m.topic, parseFloat(m.payload))) {
        entry.hasWarning = true;
      }
    });

    const transform = (zoneKey: HeightZone) => 
      Array.from(zones[zoneKey].values()).map(cell => ({
        x: cell.xGrid,
        y: cell.yGrid,
        count: cell.sourceLogs.length,
        hasWarning: cell.hasWarning,
        rawMessage: cell.sourceLogs[cell.sourceLogs.length - 1]
      }));

    return {
      [HeightZone.LOW]: transform(HeightZone.LOW),
      [HeightZone.INTERMEDIATE]: transform(HeightZone.INTERMEDIATE),
      [HeightZone.HIGH]: transform(HeightZone.HIGH),
    };
  }, [historicalTimeScopeMessages]);

  // Real-time metrics lookup processing loop helper
  const realtimeMetrics = useMemo(() => {
    if (!latestValidMessage) return { temp: 'N/A', hum: 'N/A', pres: 'N/A', tempAlert: false, humAlert: false, presAlert: false };
    
    const getVal = (kw: string) => parseFloat(initialMessages.filter(m => m.topic.includes(kw)).pop()?.payload || '0');
    
    const temp = getVal('temp');
    const hum = getVal('humidity');
    const pres = getVal('pressure');

    return {
      temp: temp.toFixed(2),
      hum: hum.toFixed(2),
      pres: pres.toFixed(1),
      tempAlert: checkWarning('temp', temp),
      humAlert: checkWarning('humidity', hum),
      presAlert: checkWarning('pressure', pres)
    };
  }, [latestValidMessage, initialMessages]);

  const resetDataset = () => {
    setLoadError(null);
    setDataset(defaultDataset);
    setSelectedDay(defaultViewState.defaultDay);
    setStartTimeMinutes(0);
    setEndTimeMinutes(defaultEndMinutesValue);
    setSelectedMessage(latestValidMessage);
    setActiveHeightFilter(defaultViewState.activeHeightFilter);
  };

  const loadJsonFile = async (file: File) => {
    setLoadError(null);
    setIsLoadingDataset(true);

    try {
      const fileText = await file.text();
      const parsed = JSON.parse(fileText);
      const extracted = extractDatasetFromJson(parsed, brokerHost, clientId);

      if (!extracted.messages.length) {
        throw new Error('No messages array was found in the uploaded JSON file.');
      }

      const loadedDefaults = getDatasetDefaults(extracted.messages);

      setDataset(extracted);
      setSelectedDay(loadedDefaults.defaultDay);
      setStartTimeMinutes(0);
      setEndTimeMinutes(loadedDefaults.defaultEndMinutesValue);
      setSelectedMessage(loadedDefaults.latestValidMessage);
      setActiveHeightFilter(loadedDefaults.activeHeightFilter);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Failed to load JSON file.');
    } finally {
      setIsLoadingDataset(false);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void loadJsonFile(file);
    event.target.value = '';
  };

  const handleTimeRangeChange = (start: number, end: number) => {
    setStartTimeMinutes(start);
    setEndTimeMinutes(end);
  };

  const handleResetToLive = () => {
    setSelectedDay(defaultDay);
    setStartTimeMinutes(0);
    setEndTimeMinutes(defaultEndMinutesValue);
  };

  const statusCards = [
    { label: 'Latest Realtime Temp', value: `${realtimeMetrics.temp} °C`, alert: realtimeMetrics.tempAlert },
    { label: 'Latest Realtime Humidity', value: `${realtimeMetrics.hum} %`, alert: realtimeMetrics.humAlert },
    { label: 'Latest Realtime Barometer', value: `${realtimeMetrics.pres} hPa`, alert: realtimeMetrics.presAlert },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans relative">
      {isLoadingDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 backdrop-blur-sm">
          <div className="w-[min(92vw,32rem)] rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Loading dashboard data</p>
                <p className="text-xs text-slate-500">Parsing the JSON file and rebuilding all views.</p>
              </div>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-linear-to-r from-blue-500 via-cyan-400 to-emerald-400" />
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-100 sticky top-0 z-10 px-8 py-3.5 flex justify-between items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">MiR-Eco Telemetry Dashboard</h1>
          <p className="text-xs text-slate-500">
            Node ID: <span className="font-mono text-blue-600 font-semibold">{dataset.clientId}</span>
            <span className="mx-2 text-slate-300">•</span>
            Source: <span className="font-medium text-slate-700">{dataset.label}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFileInputChange} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
          >
            <Upload size={14} />
            Load JSON
          </button>
          <button
            type="button"
            onClick={resetDataset}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            <RotateCcw size={14} />
            Default JSON
          </button>
          <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-xs font-medium rounded-full inline-flex items-center gap-2">
            <FileJson size={14} />
            {dataset.brokerHost}
          </div>
        </div>
      </header>

      {loadError && (
        <div className="mx-8 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      {/* Tab Navigation */}
      <nav className="bg-white border-b border-slate-100 px-8">
        <div className="flex gap-1 max-w-7xl mx-auto">
          {([
            { id: 'dashboard', label: 'Live Dashboard' },
            { id: 'pca', label: 'PCA Biplot' },
            { id: 'manova', label: 'Hypothesis 1 Analysis' },
            { id: 'kriging', label: 'Hypothesis 2 Analysis' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative text-sm font-semibold px-4 py-3 transition-colors ${
                activeTab === tab.id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-blue-600 rounded-full" />}
            </button>
          ))}
        </div>
      </nav>

      {/* Made gaps tighter using space-y-4 instead of space-y-6 */}
      <main className="p-6 mx-auto space-y-4 max-w-7xl">
        {activeTab === 'pca' ? (
          <PCABiplot messages={dataset.messages} />
        ) : activeTab === 'manova' ? (
          <MANOVAResults messages={dataset.messages} />
        ) : activeTab === 'kriging' ? (
          <KrigingAnalysis messages={dataset.messages} />
        ) : (
        <>
        {/* Real-time Metric Banners (Made padding smaller using p-3.5) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {statusCards.map((card) => (
            <div
              key={card.label}
              className={`bg-white p-3.5 rounded-xl border shadow-sm transition-all ${card.alert ? 'border-red-200 bg-red-50/40' : 'border-slate-100'}`}
            >
              <div className="flex justify-between items-center">
                <p className="text-[10px] text-slate-400 font-semibold uppercase">{card.label}</p>
                {card.alert && <AlertTriangle size={13} className="text-red-500 animate-pulse" />}
              </div>
              <h2 className={`text-base font-bold mt-0.5 ${card.alert ? 'text-red-600' : 'text-slate-900'}`}>{card.value}</h2>
            </div>
          ))}

          <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Latest Sector</p>
            <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
              X:{latestSector?.x ?? 0} Y:{latestSector?.y ?? 0}
            </h2>
          </div>

          <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm flex flex-col justify-center">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Latest Robot Position</p>
            <h2 className="text-base font-bold text-slate-900 font-mono mt-0.5">
              ({latestRobotPosition?.x ?? 0}, {latestRobotPosition?.y ?? 0}, {latestRobotPosition?.zValue ?? 0})
            </h2>
            <p className="text-[11px] font-medium text-slate-500 leading-none mt-0.5">
              {latestRobotPosition?.zLabel ?? 'Low (0 mm)'}
            </p>
          </div>
        </div>

        <TimePlaybackController 
          availableDays={availableDays}
          selectedDay={selectedDay}
          onDayChange={setSelectedDay}
          startTime={startTimeMinutes}
          endTime={endTimeMinutes}
          onTimeRangeChange={handleTimeRangeChange}
          onResetToLive={handleResetToLive}
          isLive={isLive}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricChart 
            temperatureData={timelines.temperature} 
            humidityData={timelines.humidity} 
            pressureData={timelines.pressure}
            selectedMessage={selectedMessageForViews}
          />
          <SpatialMap 
            binnedData={preBinnedGridData[activeHeightFilter]}
            selectedMessage={selectedMessageForViews}
            latestMessage={latestValidMessage}
            activeFilter={activeHeightFilter}
            onFilterChange={setActiveHeightFilter}
            onSelectMessage={setSelectedMessage}
          />
        </div>
        </>
        )}
      </main>
    </div>
  );
}
