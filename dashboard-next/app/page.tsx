import DashboardClientWrapper from '@/components/DashboardClientWrapper';
import fs from 'fs';
import path from 'path';

export default async function DashboardPage() {
  // Read and parse directly from project root on server render
  const filePath = path.join(process.cwd(), 'All_connections_updated_reordered.json');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const connections = JSON.parse(fileContent);

  const connection = connections[0] || { clientId: 'N/A', host: 'Offline', messages: [] };
  
  return (
    <DashboardClientWrapper 
      initialMessages={connection.messages || []} 
      brokerHost={connection.host}
      clientId={connection.clientId}
    />
  );
}