import { sampleExtractedRows } from './demo-data'
import { useClientsStore } from '@/stores/clients'
import { useQueueStore } from '@/stores/queue'

/** One-tap demo: clients + queue ready to send. */
export function seedDemoWorkflow(): { clients: number; queued: number } {
  const rows = sampleExtractedRows()
  // NÃO força demoMode — se o usuário está em live, mantém live
  const clients = useClientsStore.getState().upsertFromRows(rows)
  const queued = useQueueStore.getState().enqueueClients(clients)
  return { clients: clients.length, queued }
}
