/**
 * `cheesy hooks` — print the Claude Code settings.json hooks snippet.
 *
 * Useful for users who want to install hooks manually instead of letting the
 * setup wizard merge them into ~/.claude/settings.json automatically.
 *
 * Ported from the legacy root-level cli.ts.
 */

import path from 'path';
import fs from 'fs';
import pc from 'picocolors';
import { CCGRAM_HOME } from '../utils/paths';
import { HOOK_DEFINITIONS } from '../utils/hook-definitions';

function resolveDistDir(): string {
  const homeDistDir = path.join(CCGRAM_HOME, 'dist');
  if (fs.existsSync(path.join(homeDistDir, 'workspace-telegram-bot.js'))) {
    return homeDistDir;
  }
  // dist/src/commands → dist/  (the bundled CLI's own dist)
  const bundledDist = path.join(__dirname, '..', '..');
  return bundledDist;
}

export async function runHooks(): Promise<number> {
  const distDir = resolveDistDir();
  const hooks: Record<string, Array<Record<string, unknown>>> = {};
  for (const def of HOOK_DEFINITIONS) {
    const scriptPath = path.join(distDir, def.script);
    const command = `node ${scriptPath}${def.args ? ' ' + def.args : ''}`;
    const hook = { type: 'command', command, timeout: def.timeout };
    const entry: Record<string, unknown> = { hooks: [hook] };
    if (def.matcher) entry.matcher = def.matcher;
    if (def.if) entry.if = def.if;
    hooks[def.event] = hooks[def.event] || [];
    hooks[def.event].push(entry);
  }
  console.log();
  console.log(pc.bold('Add this to ~/.claude/settings.json under "hooks":'));
  console.log();
  console.log(JSON.stringify(hooks, null, 2));
  return 0;
}
