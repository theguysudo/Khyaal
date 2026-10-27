import { NextResponse } from 'next/server';
import { getLanIp } from '@/lib/server/lan';

/**
 * GET /api/v1/server-info
 * The address a physical phone should pair against: this machine's LAN IP.
 * 10.0.2.2 (the emulator's loopback alias) never works on real hardware.
 * Also exposes the VAPID public key so the dashboard can subscribe itself to
 * browser push (private key never leaves the server).
 */
export async function GET() {
  const lanIp = getLanIp();
  return NextResponse.json({
    lanIp,
    lanBaseUrl: lanIp ? `http://${lanIp}:3100/` : null,
    emulatorBaseUrl: 'http://10.0.2.2:3100/',
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  });
}
