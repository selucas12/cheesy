/**
 * Preflight checks for Cheesyboy CLI.
 *
 * Verifies the host environment is ready to run / configure Cheesyboy before
 * a destructive command (init, start) runs. Returns structured results so the
 * caller can decide how to present failures.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';

export interface PreflightCheck {
  name: string;
  ok: boolean;
  detail: string;
  /** When true, the command should refuse to proceed. */
  hard: boolean;
}

export interface PreflightReport {
  ok: boolean;
  checks: PreflightCheck[];
}

const MIN_NODE_MAJOR = 18;

/** Parse "v20.10.0" → 20. */
function nodeMajor(): number {
  const v = process.version.replace(/^v/, '').split('.')[0];
  return parseInt(v, 10) || 0;
}

/** True if `claude` is on PATH. */
function claudeOnPath(): boolean {
  try {
    execSync('command -v claude', { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Run all preflight checks. Pass options to skip individual checks (e.g. in
 * `cheesy status` we don't want to fail on missing claude binary).
 */
export function runPreflight(opts: { requireClaude?: boolean } = {}): PreflightReport {
  const { requireClaude = true } = opts;
  const checks: PreflightCheck[] = [];

  // Node version
  const major = nodeMajor();
  checks.push({
    name: 'Node.js >= 18',
    ok: major >= MIN_NODE_MAJOR,
    detail: major >= MIN_NODE_MAJOR
      ? `${process.version}`
      : `${process.version} (need >= v${MIN_NODE_MAJOR}.0.0)`,
    hard: true,
  });

  // Platform — macOS is the primary target; Linux works; Windows untested.
  const plat = process.platform;
  const platformOk = plat === 'darwin' || plat === 'linux';
  checks.push({
    name: 'Supported OS',
    ok: platformOk,
    detail: plat === 'darwin' ? 'macOS' : plat === 'linux' ? 'Linux' : `${plat} (untested — proceed at your own risk)`,
    hard: false,
  });

  // ~/.claude/ exists
  const claudeDir = path.join(os.homedir(), '.claude');
  const claudeDirOk = fs.existsSync(claudeDir);
  checks.push({
    name: '~/.claude/ directory',
    ok: claudeDirOk,
    detail: claudeDirOk ? claudeDir : `${claudeDir} not found — install Claude Code first`,
    hard: true,
  });

  // Claude CLI on PATH (soft check — Claude Code IDE/desktop also valid)
  const claudeOk = claudeOnPath();
  checks.push({
    name: 'Claude Code CLI',
    ok: claudeOk,
    detail: claudeOk ? 'found on PATH' : 'not on PATH (OK if you use the desktop/IDE app)',
    hard: requireClaude ? false : false, // never hard — Claude Code IDE doesn't expose CLI
  });

  const ok = checks.every(c => c.ok || !c.hard);
  return { ok, checks };
}

/** Render a preflight report as plain text. Caller wraps in colors if desired. */
export function formatPreflight(report: PreflightReport): string {
  return report.checks
    .map(c => {
      const mark = c.ok ? '✓' : c.hard ? '✗' : '⚠';
      return `  ${mark} ${c.name}: ${c.detail}`;
    })
    .join('\n');
}
