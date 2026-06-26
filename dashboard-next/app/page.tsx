import DashboardClientWrapper from '@/components/DashboardClientWrapper';
import { normalizeTelemetryDataset } from '@/lib/telemetry-data';
import fs from 'fs';
import path from 'path';

export default async function DashboardPage() {
  const filePath = path.join(process.cwd(), 'All_connections_updated_reordered.json');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const dataset = normalizeTelemetryDataset(JSON.parse(fileContent), 'Offline', 'N/A');

  return (
    <DashboardClientWrapper
      initialMessages={dataset.messages}
      defaultConnectionLabel={dataset.label}
      brokerHost={dataset.brokerHost}
      clientId={dataset.clientId}
    />
  );
}