export interface HardwareStatus {
  status: 'ONLINE' | 'OFFLINE';
  ip: string;
  line: number;
  simState: string;
  carrier: string;
  simNumber: string;
  signalBars: number;
  signalDbm: number;
  mode: string;
  error?: string;
}

export interface MessagingConnection {
  backend: 'checking' | 'online' | 'offline';
  hardware: HardwareStatus | null;
  detail: string;
}

type ReadStatus = (path: string, timeout: number) => Promise<unknown>;

// Only GET requests are retried. Never replay SMS sends after a connection failure.
export async function probeMessagingConnection(read: ReadStatus): Promise<MessagingConnection> {
  try {
    const health = await read('/health', 5000) as { status?: string } | null;
    if (health?.status !== 'ok' && health?.status !== 'online') throw new Error('Unexpected health response');
  } catch {
    return { backend: 'offline', hardware: null, detail: 'Backend unavailable. Retrying automatically; keep the host computer signed in and connected.' };
  }

  try {
    const hardware = await read('/gsm/hardware/status', 12000) as HardwareStatus | null;
    if (!hardware || !['ONLINE', 'OFFLINE'].includes(hardware.status)) throw new Error('Unexpected gateway response');
    return {
      backend: 'online', hardware,
      detail: hardware.mode === 'MOCK_SIMULATOR'
        ? 'Simulator enabled. This is not a live hardware connection.'
        : hardware.status === 'ONLINE'
          ? 'Backend connected. Gateway status refreshes automatically.'
          : 'Backend connected, but the GSM gateway is unreachable. Retrying automatically.',
    };
  } catch {
    return { backend: 'online', hardware: null, detail: 'Backend health check passed, but gateway status could not be read. Retrying automatically.' };
  }
}

export function messagingStatusLabel(connection: MessagingConnection): string {
  if (connection.backend === 'checking') return 'Checking backend';
  if (connection.backend === 'offline') return 'Backend offline';
  if (!connection.hardware) return 'Gateway status unavailable';
  if (connection.hardware.mode === 'MOCK_SIMULATOR') return 'Simulator mode';
  return connection.hardware.status === 'ONLINE' ? 'Gateway Ready' : 'Gateway offline';
}
