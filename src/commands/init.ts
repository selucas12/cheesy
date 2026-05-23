/**
 * `cheesy init` — runs the interactive setup wizard.
 *
 * Delegates to the compiled setup.js (which is a self-running script) by
 * spawning a child Node process. This matches the existing CLI behavior.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import pc from 'picocolors';
import { runPreflight, formatPreflight } from '../lib/preflight';

export interface InitOptions {
  /** Skip license activation prompt — for dev/test installs. */
  dev?: boolean;
}

/**
 * Resolve the path to setup.js inside the *current* package. We always run the
 * version bundled with the cheesy CLI we were invoked from — not whatever's at
 * ~/.ccgram/dist/ — so that re-running `cheesy init` after a `npm i -g` update
 * uses the new wizard immediately.
 */
function resolveSetupScript(): string {
  // src/commands/init.ts → dist/src/commands/init.js → dist/setup.js
  const candidates = [
    path.join(__dirname, '..', '..', 'setup.js'),       // dist/src/commands/.. → dist/src/.. → dist/setup.js
    path.join(__dirname, '..', '..', '..', 'setup.js'), // if structure differs
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Fallback — pre-built TypeScript source (development).
  return path.join(__dirname, '..', '..', '..', 'setup.ts');
}

export async function runInit(opts: InitOptions = {}): Promise<number> {
  console.log(pc.bold(pc.cyan('Cheesyboy init')));
  console.log();

  // Preflight first — refuse to run if hard checks fail.
  const report = runPreflight();
  console.log(pc.dim('Preflight:'));
  console.log(formatPreflight(report));
  console.log();
  if (!report.ok) {
    console.error(pc.red('Preflight failed. Fix the hard (✗) checks above before running init.'));
    return 1;
  }

  if (opts.dev) {
    console.log(pc.yellow('⚠ --dev mode: license validation will be skipped during setup.'));
    console.log();
  }

  const setupScript = resolveSetupScript();
  if (!fs.existsSync(setupScript)) {
    console.error(pc.red(`Could not find setup script at ${setupScript}.`));
    console.error(pc.dim('Did you run `npm run build` after cloning? Or reinstall: npm i -g @selucas12/cheesy'));
    return 1;
  }

  // Pass --dev through to setup via env so the wizard can branch.
  const env = { ...process.env };
  if (opts.dev) env.CHEESY_DEV_MODE = '1';

  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [setupScript], {
      stdio: 'inherit',
      env,
    });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(pc.red(`Failed to launch setup: ${err.message}`));
      resolve(1);
    });
  });
}
