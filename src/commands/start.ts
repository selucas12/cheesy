/**
 * `cheesy start` — bring the bot online.
 *
 * Default: bring up the OS-managed service (launchd on macOS, systemd on Linux).
 * Falls back to a foreground spawn if no service is installed.
 *
 * Flags:
 *   --foreground   Always run in the foreground (good for debugging).
 *   --background   (default) prefer the OS service.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import pc from 'picocolors';
import { CCGRAM_HOME } from '../utils/paths';

export interface StartOptions {
  foreground?: boolean;
}

function resolveBotScript(): string | null {
  const candidates = [
    path.join(CCGRAM_HOME, 'dist', 'workspace-telegram-bot.js'),
    path.join(__dirname, '..', '..', 'workspace-telegram-bot.js'),       // dist/src/commands → dist/workspace-telegram-bot.js
    path.join(__dirname, '..', '..', '..', 'workspace-telegram-bot.js'), // alternate depth
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function startLaunchd(): number {
  const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.ccgram.plist');
  if (!fs.existsSync(plistPath)) return -1; // not installed — fall through
  try {
    // Bootstrap is idempotent; ignore the "already loaded" error.
    execSync(`launchctl bootstrap gui/$(id -u) ${plistPath} 2>/dev/null || launchctl kickstart -k gui/$(id -u)/com.ccgram`, { stdio: 'inherit' });
    console.log(pc.green('✓ launchd service started (com.ccgram)'));
    console.log(pc.dim('  Logs: tail -f ~/.ccgram/logs/bot-stdout.log'));
    return 0;
  } catch (err) {
    console.error(pc.red(`launchctl failed: ${(err as Error).message}`));
    return 1;
  }
}

function startSystemd(): number {
  try {
    // Check the unit exists first
    execSync('systemctl status ccgram 2>&1 | head -1', { stdio: 'pipe' });
  } catch {
    return -1; // not installed
  }
  try {
    execSync('sudo systemctl start ccgram', { stdio: 'inherit' });
    console.log(pc.green('✓ systemd service started (ccgram)'));
    console.log(pc.dim('  Logs: journalctl -u ccgram -f'));
    return 0;
  } catch (err) {
    console.error(pc.red(`systemctl failed: ${(err as Error).message}`));
    return 1;
  }
}

export async function runStart(opts: StartOptions = {}): Promise<number> {
  if (opts.foreground) {
    return startForegroundAwaitable();
  }

  // Try the OS service first.
  if (process.platform === 'darwin') {
    const r = startLaunchd();
    if (r >= 0) return r;
    console.log(pc.yellow('No launchd plist found — falling back to foreground.'));
  } else if (process.platform === 'linux') {
    const r = startSystemd();
    if (r >= 0) return r;
    console.log(pc.yellow('No systemd unit found — falling back to foreground.'));
  }

  return startForegroundAwaitable();
}

async function startForegroundAwaitable(): Promise<number> {
  const botScript = resolveBotScript();
  if (!botScript) {
    console.error(pc.red('Could not find workspace-telegram-bot.js.'));
    console.error(pc.dim('Try `cheesy init` first, or rebuild with `npm run build`.'));
    return 1;
  }
  console.log(pc.cyan(`Running bot in foreground: ${botScript}`));
  console.log(pc.dim('Press Ctrl+C to stop.'));
  console.log();
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [botScript], { stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(pc.red(`Failed to start bot: ${err.message}`));
      resolve(1);
    });
  });
}
