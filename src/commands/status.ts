/**
 * `cheesy status` — show bot + session status.
 *
 * Ported from the legacy root-level cli.ts. Reads the session map from the
 * persistent install (~/.ccgram/) when present, else from the source root.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import pc from 'picocolors';
import { CCGRAM_HOME } from '../utils/paths';

function isBotRunning(): boolean {
  try {
    execSync('pgrep -f workspace-telegram-bot.js', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function isServiceLoaded(): { kind: 'launchd' | 'systemd' | 'none'; running: boolean } {
  // macOS launchd
  if (process.platform === 'darwin') {
    try {
      execSync('launchctl print gui/$(id -u)/com.ccgram', { stdio: 'pipe' });
      return { kind: 'launchd', running: true };
    } catch {
      return { kind: 'launchd', running: false };
    }
  }
  // Linux systemd (user or system)
  if (process.platform === 'linux') {
    try {
      const out = execSync('systemctl is-active ccgram 2>/dev/null || true', { encoding: 'utf8' }).trim();
      return { kind: 'systemd', running: out === 'active' };
    } catch {
      return { kind: 'systemd', running: false };
    }
  }
  return { kind: 'none', running: false };
}

function readSessionCount(): number {
  const dataRoot = fs.existsSync(path.join(CCGRAM_HOME, 'package.json')) ? CCGRAM_HOME : process.cwd();
  const sessionMapPath = path.join(dataRoot, 'src', 'data', 'session-map.json');
  try {
    const raw = fs.readFileSync(sessionMapPath, 'utf8');
    return Object.keys(JSON.parse(raw)).length;
  } catch {
    return 0;
  }
}

function readLicenseSummary(): { exists: boolean; productName?: string; instanceName?: string } {
  const licensePath = path.join(CCGRAM_HOME, '.license.json');
  try {
    const raw = fs.readFileSync(licensePath, 'utf8');
    const j = JSON.parse(raw);
    return { exists: true, productName: j.productName, instanceName: j.instanceName };
  } catch {
    return { exists: false };
  }
}

export async function runStatus(): Promise<number> {
  console.log(pc.bold(pc.cyan('Cheesyboy status')));
  console.log();

  const botRunning = isBotRunning();
  const service = isServiceLoaded();
  const sessions = readSessionCount();
  const license = readLicenseSummary();

  const mark = (b: boolean) => b ? pc.green('●') : pc.red('○');

  console.log(`  ${mark(botRunning)} Bot process:    ${botRunning ? pc.green('running') : pc.red('stopped')}`);
  if (service.kind !== 'none') {
    console.log(`  ${mark(service.running)} ${service.kind === 'launchd' ? 'launchd' : 'systemd'} service: ${service.running ? pc.green('loaded') : pc.dim('not loaded')}`);
  }
  console.log(`  ${pc.dim('•')} Sessions:        ${sessions}`);
  console.log(`  ${pc.dim('•')} Install dir:     ${CCGRAM_HOME}${fs.existsSync(CCGRAM_HOME) ? '' : pc.dim(' (missing — run `cheesy init`)')}`);
  console.log(`  ${license.exists ? pc.green('●') : pc.dim('○')} License:         ${license.exists ? pc.green(license.productName || 'activated') : pc.dim('not activated')}`);
  if (license.exists && license.instanceName) {
    console.log(`    ${pc.dim('instance:')}      ${license.instanceName}`);
  }
  if (process.env.HEALTH_PORT) {
    console.log(`  ${pc.dim('•')} Health:          http://127.0.0.1:${process.env.HEALTH_PORT}/health`);
  }

  return 0;
}
