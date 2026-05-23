#!/usr/bin/env node

/**
 * Cheesyboy CLI — entry point.
 *
 * Dispatches to subcommands in src/commands/. Each subcommand returns an exit
 * code which we forward to the OS so shell scripts can branch on success.
 */

import { Command } from 'commander';
import pc from 'picocolors';
import path from 'path';
import fs from 'fs';

import { runInit } from './commands/init';
import { runStart } from './commands/start';
import { runStop } from './commands/stop';
import { runStatus } from './commands/status';
import { runHooks } from './commands/hooks';
import {
  runLicenseActivate,
  runLicenseStatus,
  runLicenseDeactivate,
} from './commands/license';

/** Read the bundled package.json so --version is always accurate. */
function readVersion(): string {
  const candidates = [
    path.join(__dirname, '..', 'package.json'),       // dist/src → dist/package.json
    path.join(__dirname, '..', '..', 'package.json'), // dist/src/.. → ../package.json
  ];
  for (const c of candidates) {
    try {
      const j = JSON.parse(fs.readFileSync(c, 'utf8'));
      if (j.version) return j.version as string;
    } catch {}
  }
  return '0.0.0';
}

/** Wrap a Promise<number> so commander hands the exit code back to the OS. */
function exitWith(p: Promise<number>): void {
  p.then(
    (code) => process.exit(code),
    (err) => {
      console.error(pc.red(`Fatal: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  );
}

const program = new Command();

program
  .name('cheesy')
  .description('Control Claude Code from Telegram — Cheesyboy CLI')
  .version(readVersion(), '-v, --version', 'print version and exit')
  .showHelpAfterError('(run `cheesy --help` for usage)');

program
  .command('init')
  .description('Run the interactive setup wizard (configure Telegram + Claude hooks).')
  .option('--dev', 'Skip license validation (test/dev installs).')
  .action((opts) => exitWith(runInit({ dev: !!opts.dev })));

program
  .command('start')
  .description('Start the Cheesyboy bot. Uses launchd/systemd if installed, else foreground.')
  .option('-f, --foreground', 'Always run in the foreground (no background service).')
  .action((opts) => exitWith(runStart({ foreground: !!opts.foreground })));

program
  .command('stop')
  .description('Stop the Cheesyboy bot (service or foreground process).')
  .action(() => exitWith(runStop()));

program
  .command('status')
  .description('Show bot, service, sessions, and license status.')
  .action(() => exitWith(runStatus()));

program
  .command('hooks')
  .description('Print the Claude Code settings.json hooks snippet for manual install.')
  .action(() => exitWith(runHooks()));

const license = program
  .command('license')
  .description('Manage LemonSqueezy license activation.');

license
  .command('activate <key>')
  .description('Activate a license key on this machine.')
  .action((key: string) => exitWith(runLicenseActivate(key)));

license
  .command('status')
  .description('Show the activated license (validates remotely when possible).')
  .action(() => exitWith(runLicenseStatus()));

license
  .command('deactivate')
  .description('Release this machine\'s activation slot.')
  .action(() => exitWith(runLicenseDeactivate()));

// `cheesy` with no args → show help. This is friendlier than commander's
// default (which exits 1 silently when nothing matches).
if (process.argv.length <= 2) {
  program.help();
}

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(pc.red(`Fatal: ${err instanceof Error ? err.message : String(err)}`));
  process.exit(1);
});
