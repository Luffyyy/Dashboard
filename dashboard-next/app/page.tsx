import DashboardClientWrapper from '@/components/DashboardClientWrapper';
import fs from 'fs';
import path from 'path';

export default async function DashboardPage() {
  const filePath = path.join(process.cwd(), 'All_connections_updated_reordered.json');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const dataset = JSON.parse(fileContent)?.[0];

  return (
    <DashboardClientWrapper
      initialMessages={dataset.messages}
      defaultConnectionLabel={dataset.label}
      brokerHost={dataset.host}
      clientId={dataset.clientId}
    />
  );
}