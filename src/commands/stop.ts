/**
 * `cheesy stop` — take the bot offline.
 *
 * Tries the OS-managed service first, then falls back to killing any
 * workspace-telegram-bot.js process started in the foreground.
 */

import { execSync } from 'child_process';
import pc from 'picocolors';

function stopLaunchd(): number {
  try {
    execSync('launchctl bootout gui/$(id -u)/com.ccgram', { stdio: 'pipe' });
    console.log(pc.green('✓ launchd service stopped (com.ccgram)'));
    return 0;
  } catch {
    return -1;
  }
}

function stopSystemd(): number {
  try {
    execSync('sudo systemctl stop ccgram', { stdio: 'inherit' });
    console.log(pc.green('✓ systemd service stopped (ccgram)'));
    return 0;
  } catch {
    return -1;
  }
}

function killForeground(): number {
  try {
    // pkill returns 0 if it killed something, 1 if no match.
    execSync('pkill -f workspace-telegram-bot.js', { stdio: 'pipe' });
    console.log(pc.green('✓ Bot process killed'));
    return 0;
  } catch {
    return -1;
  }
}

export async function runStop(): Promise<number> {
  let stoppedAny = false;

  if (process.platform === 'darwin') {
    if (stopLaunchd() === 0) stoppedAny = true;
  } else if (process.platform === 'linux') {
    if (stopSystemd() === 0) stoppedAny = true;
  }

  if (killForeground() === 0) stoppedAny = true;

  if (!stoppedAny) {
    console.log(pc.dim('No running bot process or service found — nothing to stop.'));
    return 0; // Idempotent: stopping a stopped thing is success.
  }
  return 0;
}
