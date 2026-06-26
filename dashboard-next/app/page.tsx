import DashboardClientWrapper from '@/components/DashboardClientWrapper';
import fs from 'fs';
import path from 'path';
import { getMessagesForClient } from '@/lib/firebaseAdmin';

export default async function DashboardPage() {
  // Read fallback connections from project root on server render
  const filePath = path.join(process.cwd(), 'All_connections_updated_reordered.json');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const connections = JSON.parse(fileContent);

  const connection = connections[0] || { clientId: 'N/A', host: 'Offline', messages: [] };

  // Try to fetch messages from Firestore for the same clientId; fall back to file-based messages
  let messages = connection.messages || [];
  try {
    const remote = await getMessagesForClient(connection.clientId);
    if (remote && remote.length) messages = remote;
  } catch (err) {
    console.warn('Server Firestore fetch failed, using local JSON:', err);
  }

  return (
    <DashboardClientWrapper 
      initialMessages={messages} 
      defaultConnectionLabel="All_connections_updated_reordered.json"
      brokerHost={connection.host}
      clientId={connection.clientId}
    />
  );
}