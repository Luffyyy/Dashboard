"use client";
import React, { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
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
  x: number;
  y: number;
  z: number;
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
  HIGH = 'High',
}

function getHeightZone(z: number | string): HeightZone {
  if (typeof z === 'string') {
    const lowered = z.toLowerCase();
    if (lowered.includes('low')) return HeightZone.LOW;
    if (lowered.includes('inter')) return HeightZone.INTERMEDIATE;
    if (lowered.includes('high')) return HeightZone.HIGH;
    return HeightZone.INTERMEDIATE;
  }

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
    if (messages[i].x !== undefined && messages[i].y !== undefined) {
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
    activeHeightFilter: latestValidMessage ? getHeightZone(latestValidMessage.z) : HeightZone.INTERMEDIATE,
  };
}

function checkWarning(topic: string, val: number): boolean {
  if (topic.includes('temp') && val > 25.0) return true;
  if (topic.includes('humidity') && (val < 40.0 || val > 75.0)) return true;
  if (topic.includes('pressure') && (val < 950.0 || val > 1050.0)) return true;
  return false;
}

function getSectorCenter(message: MQTTMessage | null) {
  if (!message) return null;
  return {
    x: Math.round(message.x * 2) / 2,
    y: Math.round(message.y * 2) / 2,
  };
}

export default function DashboardClientWrapper({ initialMessages, brokerHost, clientId, defaultConnectionLabel = 'Local JSON' }: WrapperProps) {
  const defaultDataset = useMemo(
    () => ({
      messages: initialMessages,
      brokerHost,
      clientId,
      label: defaultConnectionLabel,
    }),
    [defaultConnectionLabel, initialMessages, brokerHost, clientId],
  );

  const [dataset, setDataset] = useState(defaultDataset);

  const defaultViewState = useMemo(() => getDatasetDefaults(defaultDataset.messages), [defaultDataset.messages]);
  const latestValidMessage = useMemo(() => getDatasetDefaults(dataset.messages).latestValidMessage, [dataset.messages]);
  const availableDays = useMemo(() => {
    const days = new Set<string>();
    dataset.messages.forEach((message) => days.add(formatTimestampDay(message.createAt)));
    return Array.from(days).sort();
  }, [dataset.messages]);

  const defaultDay = defaultViewState.defaultDay;
  const defaultEndMinutesValue = defaultViewState.defaultEndMinutesValue;

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
      x: latestValidMessage.x,
      y: latestValidMessage.y,
      zLabel: getHeightZone(latestValidMessage.z),
      zValue: latestValidMessage.z,
    };
  }, [latestValidMessage]);

  const historicalTimeScopeMessages = useMemo(() => {
    return dataset.messages.filter((message) => {
      if (formatTimestampDay(message.createAt) !== selectedDay) return false;

      const msgMinutes = getTimestampMinutes(message.createAt);
      if (msgMinutes === null) return false;

      return msgMinutes >= startTimeMinutes && msgMinutes <= endTimeMinutes;
    });
  }, [dataset.messages, selectedDay, startTimeMinutes, endTimeMinutes]);

  const selectedMessageForViews = useMemo(() => {
    if (selectedMessage && historicalTimeScopeMessages.some((message) => message.id === selectedMessage.id)) {
      return selectedMessage;
    }

    for (let i = historicalTimeScopeMessages.length - 1; i >= 0; i--) {
      if (historicalTimeScopeMessages[i].x !== undefined && historicalTimeScopeMessages[i].y !== undefined) {
        return historicalTimeScopeMessages[i];
      }
    }

    return historicalTimeScopeMessages[historicalTimeScopeMessages.length - 1] ?? latestValidMessage;
  }, [historicalTimeScopeMessages, latestValidMessage, selectedMessage]);

  const timelines = useMemo(() => {
    const mapTopic = (keyword: string) =>
      historicalTimeScopeMessages
        .filter((message) => message.topic.includes(keyword))
        .map((message) => ({ time: formatTimestampTime(message.createAt), value: parseFloat(message.payload), id: message.id, x: message.x, y: message.y }));

    return {
      temperature: mapTopic('temp'),
      humidity: mapTopic('humidity'),
      pressure: mapTopic('pressure'),
    };
  }, [historicalTimeScopeMessages]);

  const preBinnedGridData = useMemo(() => {
    const zones = {
      [HeightZone.LOW]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
      [HeightZone.INTERMEDIATE]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
      [HeightZone.HIGH]: new Map<string, { xGrid: number; yGrid: number; sourceLogs: MQTTMessage[]; hasWarning: boolean }>(),
    };

    historicalTimeScopeMessages.forEach((message) => {
      const zone = getHeightZone(message.z);
      const xGrid = Math.round(message.x * 2) / 2;
      const yGrid = Math.round(message.y * 2) / 2;
      const key = `${xGrid}_${yGrid}`;

      const targetMap = zones[zone];
      if (!targetMap.has(key)) {
        targetMap.set(key, { xGrid, yGrid, sourceLogs: [], hasWarning: false });
      }

      const entry = targetMap.get(key)!;
      entry.sourceLogs.push(message);
      if (checkWarning(message.topic, parseFloat(message.payload))) {
        entry.hasWarning = true;
      }
    });

    const transform = (zoneKey: HeightZone) =>
      Array.from(zones[zoneKey].values()).map((cell) => ({
        x: cell.xGrid,
        y: cell.yGrid,
        count: cell.sourceLogs.length,
        hasWarning: cell.hasWarning,
        rawMessage: cell.sourceLogs[cell.sourceLogs.length - 1],
      }));

    return {
      [HeightZone.LOW]: transform(HeightZone.LOW),
      [HeightZone.INTERMEDIATE]: transform(HeightZone.INTERMEDIATE),
      [HeightZone.HIGH]: transform(HeightZone.HIGH),
    };
  }, [historicalTimeScopeMessages]);

  const realtimeMetrics = useMemo(() => {
    if (!latestValidMessage) return { temp: 'N/A', hum: 'N/A', pres: 'N/A', tempAlert: false, humAlert: false, presAlert: false };

    const getVal = (keyword: string) => parseFloat(dataset.messages.filter((message) => message.topic.includes(keyword)).pop()?.payload || '0');
    const temp = getVal('temp');
    const hum = getVal('humidity');
    const pres = getVal('pressure');

    return {
      temp: temp.toFixed(2),
      hum: hum.toFixed(2),
      pres: pres.toFixed(1),
      tempAlert: checkWarning('temp', temp),
      humAlert: checkWarning('humidity', hum),
      presAlert: checkWarning('pressure', pres),
    };
  }, [dataset.messages, latestValidMessage]);

  const resetDataset = () => {
    setDataset(defaultDataset);
    setSelectedDay(defaultViewState.defaultDay);
    setStartTimeMinutes(0);
    setEndTimeMinutes(defaultEndMinutesValue);
    setSelectedMessage(defaultViewState.latestValidMessage);
    setActiveHeightFilter(defaultViewState.activeHeightFilter);
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
          <button
            type="button"
            onClick={resetDataset}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
          >
            Reset Snapshot
          </button>
          <div className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 text-xs font-medium rounded-full inline-flex items-center gap-2">
            {dataset.brokerHost}
          </div>
        </div>
      </header>

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

      <main className="p-6 mx-auto space-y-4 max-w-7xl">
        {activeTab === 'pca' ? (
          <PCABiplot messages={dataset.messages} />
        ) : activeTab === 'manova' ? (
          <MANOVAResults messages={dataset.messages} />
        ) : activeTab === 'kriging' ? (
          <KrigingAnalysis messages={dataset.messages} />
        ) : (
          <>
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
                  {latestRobotPosition ? `${latestRobotPosition.zLabel} height` : 'No position available'}
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
