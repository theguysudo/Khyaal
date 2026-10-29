import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Starting the USB relay without asking the family to open a terminal.
 *
 * The relay lives on the same laptop as the server (it is plugged into this
 * Mac's USB port), so the server can start it. That is the difference
 * between "press one button" and "paste a command, copy a code, run it".
 *
 * Two guards keep this from going wrong:
 *  - a pidfile, so two Connect presses cannot spawn two relays fighting over
 *    the one serial port (the second would just fail to open it);
 *  - the bridge is detached and writes to a log file, so it survives the
 *    request that started it.
 *
 * If the repo is not on this machine (a deployed server), there is nothing
 * to launch and the caller falls back to telling the family what to run.
 */

export interface RelayLaunchResult {
  started: boolean;
  reason: 'already-running' | 'no-repo' | 'no-python' | 'spawned' | 'spawn-failed';
  pid?: number;
  logPath?: string;
}

function repoTunnelDir(): string | null {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'firmware', 'tunnel');
    if (fs.existsSync(path.join(candidate, 'khayaal_serial_bridge.py'))) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Is a relay already running on this machine? */
function relayPid(tunnelDir: string): number | null {
  try {
    const raw = fs.readFileSync(path.join(tunnelDir, 'relay.pid'), 'utf8').trim();
    const pid = Number.parseInt(raw, 10);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    // Signal 0 checks for existence without touching the process.
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
}

/**
 * Start the relay if it is not already running.
 *
 * Never throws: a failed launch is reported, not fatal — the dashboard can
 * then fall back to showing the command to run by hand.
 */
export function launchRelay(): RelayLaunchResult {
  const tunnelDir = repoTunnelDir();
  if (!tunnelDir) return { started: false, reason: 'no-repo' };

  const existing = relayPid(tunnelDir);
  if (existing) return { started: false, reason: 'already-running', pid: existing };

  const script = path.join(tunnelDir, 'khayaal_serial_bridge.py');
  const logPath = path.join(tunnelDir, 'relay.log');
  const pidPath = path.join(tunnelDir, 'relay.pid');

  let logFd: number;
  try {
    logFd = fs.openSync(logPath, 'a');
  } catch {
    return { started: false, reason: 'spawn-failed' };
  }

  let child;
  try {
    child = spawn('python3', [script], {
      cwd: path.join(tunnelDir, '..', '..'),
      detached: true,
      stdio: ['ignore', logFd, logFd],
    });
  } catch {
    fs.closeSync(logFd);
    return { started: false, reason: 'no-python' };
  }

  child.unref();
  fs.closeSync(logFd);

  if (typeof child.pid !== 'number') {
    return { started: false, reason: 'spawn-failed' };
  }

  try {
    fs.writeFileSync(pidPath, `${child.pid}\n`);
  } catch {
    /* the pidfile is an optimisation, not a requirement */
  }

  return { started: true, reason: 'spawned', pid: child.pid, logPath };
}
