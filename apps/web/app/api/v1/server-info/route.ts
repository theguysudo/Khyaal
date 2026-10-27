import { NextResponse } from 'next/server';
import { getLanIp } from '@/lib/server/lan';

/**
 * GET /api/v1/server-info
 * The address a physical phone should pair against: this machine's LAN IP.
 * 10.0.2.2 (the emulator's loopback alias) never works on real hardware.
 */
export async function GET() {
  const lanIp = getLanIp();
  return NextResponse.json({
    lanIp,
    lanBaseUrl: lanIp ? `http://${lanIp}:3100/` : null,
    emulatorBaseUrl: 'http://10.0.2.2:3100/',
  });
}
