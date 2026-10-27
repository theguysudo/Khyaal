import { NextResponse } from 'next/server';
import * as os from 'node:os';

/**
 * GET /api/v1/server-info
 * The address a physical phone should pair against: this machine's LAN IP.
 * 10.0.2.2 (the emulator's loopback alias) never works on real hardware.
 */
export async function GET() {
  const nets = os.networkInterfaces();
  let lanIp: string | null = null;
  for (const addrs of Object.values(nets)) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) {
        // Prefer 192.168./10. addresses (home Wi-Fi) over anything exotic.
        if (!lanIp || a.address.startsWith('192.168.') || a.address.startsWith('10.')) {
          lanIp = a.address;
        }
      }
    }
  }
  return NextResponse.json({
    lanIp,
    lanBaseUrl: lanIp ? `http://${lanIp}:3100/` : null,
    emulatorBaseUrl: 'http://10.0.2.2:3100/',
  });
}
