import * as os from 'node:os';

/** The machine's LAN IPv4 — the address physical phones can reach. */
export function getLanIp(): string | null {
  const nets = os.networkInterfaces();
  let lanIp: string | null = null;
  for (const addrs of Object.values(nets)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        if (!lanIp || a.address.startsWith('192.168.') || a.address.startsWith('10.')) {
          lanIp = a.address;
        }
      }
    }
  }
  return lanIp;
}
