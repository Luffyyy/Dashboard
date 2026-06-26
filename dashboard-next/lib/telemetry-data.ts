export type NormalizedTelemetryMessage = {
  id: string;
  createAt: string;
  payload: string;
  topic: string;
  connectionId: string;
  x: number;
  y: number;
  z: number;
};

export type NormalizedTelemetryDataset = {
  messages: NormalizedTelemetryMessage[];
  brokerHost: string;
  clientId: string;
  label: string;
};

type MaybeRecord = Record<string, unknown>;

const HEIGHT_ZONE_TO_METERS: Record<string, number> = {
  low: 0.15,
  intermediate: 0.45,
  high: 0.75,
};

function isRecord(value: unknown): value is MaybeRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toCoordinateMeters(value: unknown): number | null {
  const coordinate = toNumber(value);
  if (coordinate === null) return null;
  return coordinate;
}

function toHeightMeters(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (lowered in HEIGHT_ZONE_TO_METERS) {
      return HEIGHT_ZONE_TO_METERS[lowered];
    }

    const parsed = Number(lowered);
    if (Number.isFinite(parsed)) return parsed;
  }

  return HEIGHT_ZONE_TO_METERS.intermediate;
}

function normalizeMessage(entry: unknown): NormalizedTelemetryMessage | null {
  if (!isRecord(entry)) return null;

  const x = toCoordinateMeters(entry.x);
  const y = toCoordinateMeters(entry.y);
  if (x === null || y === null) return null;

  return {
    id: typeof entry.id === 'string' ? entry.id : `${entry.connectionId ?? 'message'}-${entry.createAt ?? ''}-${x}-${y}`,
    createAt: typeof entry.createAt === 'string' ? entry.createAt : '',
    payload: typeof entry.payload === 'string' ? entry.payload : String(entry.payload ?? ''),
    topic: typeof entry.topic === 'string' ? entry.topic : '',
    connectionId: typeof entry.connectionId === 'string' ? entry.connectionId : '',
    x: x,
    y: y,
    z: toHeightMeters(entry.z),
  };
}

function extractMessagesFromEntry(entry: unknown): NormalizedTelemetryMessage[] {
  if (!isRecord(entry)) return [];
  if (Array.isArray(entry.messages)) {
    return entry.messages.map(normalizeMessage).filter((message): message is NormalizedTelemetryMessage => message !== null);
  }

  const message = normalizeMessage(entry);
  return message ? [message] : [];
}

export function normalizeTelemetryDataset(json: unknown, fallbackHost: string, fallbackClientId: string): NormalizedTelemetryDataset {
  const entries = Array.isArray(json) ? json : [json];

  for (const entry of entries) {
    if (!isRecord(entry) || !Array.isArray(entry.messages)) continue;

    const messages = entry.messages.map(normalizeMessage).filter((message): message is NormalizedTelemetryMessage => message !== null);
    if (!messages.length) continue;

    return {
      messages,
      brokerHost: typeof entry.host === 'string' && entry.host ? entry.host : fallbackHost,
      clientId: typeof entry.clientId === 'string' && entry.clientId ? entry.clientId : fallbackClientId,
      label: typeof entry.name === 'string' && entry.name ? entry.name : typeof entry.id === 'string' && entry.id ? entry.id : 'Uploaded JSON',
    };
  }

  const messages = entries.flatMap(extractMessagesFromEntry);
  return {
    messages,
    brokerHost: fallbackHost,
    clientId: fallbackClientId,
    label: 'Uploaded JSON',
  };
}