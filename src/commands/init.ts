/**
 * `cheesy init` — orchestrates the full first-run flow.
 *
 *   1. Preflight (Node, OS, ~/.claude/, Claude CLI).
 *   2. Telegram setup wizard (delegates to setup.ts as a child process).
 *   3. License activation:
 *        --dev               → write a dev marker, skip activation.
 *        LICENSE_KEY env set → headless activation.
 *        otherwise           → prompt for the key on stdin.
 *
 * License activation runs *after* the wizard so customers can fully set up
 * Telegram before being asked for the key. If activation fails, the wizard's
 * Telegram config remains intact — they can retry with `cheesy license activate`.
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';
import pc from 'picocolors';
import { runPreflight, formatPreflight } from '../lib/preflight';
import {
  activateAndStore,
  readLicenseRecord,
  writeDevMarker,
  isDevMode,
  defaultInstanceName,
  type LicenseResult,
} from '../lib/license-validator';

export interface InitOptions {
  /** Skip license activation (dev/test installs). */
  dev?: boolean;
}

function resolveSetupScript(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'setup.js'),       // dist/src/commands → dist/setup.js
    path.join(__dirname, '..', '..', '..', 'setup.js'), // alternate depth
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(__dirname, '..', '..', '..', 'setup.ts');
}

/** One-shot prompt for a single line on stdin. Resolves to the trimmed input. */
function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/** Run the Telegram setup wizard as a child process. */
function runWizard(env: NodeJS.ProcessEnv): Promise<number> {
  const setupScript = resolveSetupScript();
  if (!fs.existsSync(setupScript)) {
    console.error(pc.red(`Could not find setup script at ${setupScript}.`));
    console.error(pc.dim('Did you run `npm run build`? Or reinstall: npm i -g @selucas12/cheesy'));
    return Promise.resolve(1);
  }
  return new Promise<number>((resolve) => {
    const child = spawn(process.execPath, [setupScript], { stdio: 'inherit', env });
    child.on('exit', (code) => resolve(code ?? 0));
    child.on('error', (err) => {
      console.error(pc.red(`Failed to launch setup: ${err.message}`));
      resolve(1);
    });
  });
}

/** Render an activation result. Returns the exit code. */
function renderActivation(r: LicenseResult): number {
  switch (r.kind) {
    case 'ok':
      console.log(pc.green('✓ License activated.'));
      console.log(pc.dim(`  Product: ${r.record.productName ?? '—'}`));
      console.log(pc.dim(`  Customer: ${r.record.customerEmail ?? '—'}`));
      return 0;
    case 'invalid':
      console.error(pc.red(`✗ ${r.reason}`));
      console.error(pc.dim('  Check the key in your email receipt from LemonSqueezy.'));
      console.error(pc.dim('  Retry later with: cheesy license activate <YOUR-KEY>'));
      return 1;
    case 'limit':
      console.error(pc.red(`✗ ${r.reason}`));
      console.error(pc.dim('  Deactivate on another machine, then retry.'));
      return 1;
    case 'network':
      console.error(pc.yellow(`⚠ Network issue: ${r.reason}`));
      console.error(pc.dim('  Activate later with: cheesy license activate <YOUR-KEY>'));
      return 2;
    case 'bad-request':
      console.error(pc.red(`✗ Request rejected: ${r.reason}`));
      return 1;
  }
}

/** Drive license activation. Returns exit code, but failure does NOT roll back
 *  the Telegram setup — customers can retry standalone with `cheesy license activate`. */
async function activateLicenseFlow(opts: InitOptions): Promise<number> {
  console.log();
  console.log(pc.bold(pc.cyan('License')));

  if (opts.dev) {
    writeDevMarker();
    console.log(pc.yellow('⚠ Dev mode marker written to ~/.ccgram/.license-dev'));
    console.log(pc.dim('  `cheesy start` will run without license validation.'));
    console.log(pc.dim('  To switch to a real license: cheesy license activate <KEY>'));
    return 0;
  }

  // If already activated, don't prompt again.
  if (readLicenseRecord()) {
    console.log(pc.green('✓ License already activated on this machine.'));
    console.log(pc.dim('  Run `cheesy license status` to verify.'));
    return 0;
  }

  // Headless: LICENSE_KEY env var.
  const envKey = process.env.LICENSE_KEY || process.env.CHEESY_LICENSE_KEY;
  if (envKey) {
    console.log(pc.dim(`Activating with LICENSE_KEY from env on ${defaultInstanceName()}…`));
    const r = await activateAndStore(envKey);
    return renderActivation(r);
  }

  // Interactive.
  console.log(pc.dim('Paste the license key from your LemonSqueezy email receipt.'));
  console.log(pc.dim('Press Enter without a key to skip (you can run `cheesy license activate <KEY>` later).'));
  console.log();
  const key = await promptLine(pc.cyan('License key: '));
  if (!key) {
    console.log(pc.yellow('Skipped. The bot will not start until a license is activated.'));
    console.log(pc.dim('  Activate later with: cheesy license activate <YOUR-KEY>'));
    return 0;
  }
  console.log(pc.dim(`Activating on ${defaultInstanceName()}…`));
  const r = await activateAndStore(key);
  return renderActivation(r);
}

export async function runInit(opts: InitOptions = {}): Promise<number> {
  console.log(pc.bold(pc.cyan('Cheesyboy init')));
  console.log();

  // 1. Preflight
  const report = runPreflight();
  console.log(pc.dim('Preflight:'));
  console.log(formatPreflight(report));
  console.log();
  if (!report.ok) {
    console.error(pc.red('Preflight failed. Fix the hard (✗) checks above before running init.'));
    return 1;
  }

  if (opts.dev) {
    console.log(pc.yellow('⚠ --dev mode: license activation will be skipped (dev marker will be written).'));
    console.log();
  }

  // 2. Telegram wizard
  const env = { ...process.env };
  if (opts.dev) env.CHEESY_DEV_MODE = '1';
  const wizardCode = await runWizard(env);
  if (wizardCode !== 0) {
    console.error(pc.red(`Setup wizard exited with code ${wizardCode}. Skipping license activation.`));
    return wizardCode;
  }

  // 3. License — only if not in dev mode and no dev marker already exists.
  // Note: if a previous --dev run wrote the marker, a re-run *without* --dev
  // still respects the marker; the customer can explicitly activate.
  if (isDevMode() && !opts.dev) {
    console.log();
    console.log(pc.yellow('Dev marker exists — skipping license activation.'));
    console.log(pc.dim('  To activate: cheesy license activate <YOUR-KEY> (will clear the marker).'));
    return 0;
  }

  const licenseCode = await activateLicenseFlow(opts);
  // Activation failure doesn't fail init — Telegram setup is still good.
  if (licenseCode !== 0) {
    console.log();
    console.log(pc.dim('Telegram setup completed successfully. Re-try license activation any time.'));
  }
  return 0;
}
