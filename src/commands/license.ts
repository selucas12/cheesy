/**
 * `cheesy license <subcommand>` — manage LemonSqueezy license activation.
 *
 * Subcommands:
 *   activate <key>   — Activate a license key on this machine.
 *   status           — Validate the cached license remotely and print details.
 *   deactivate       — Release this machine's activation slot (frees a seat).
 */

import pc from 'picocolors';
import {
  activateAndStore,
  validateStored,
  deactivateStored,
  readLicenseRecord,
  isDevMode,
  defaultInstanceName,
  type LicenseResult,
  type LicenseRecord,
} from '../lib/license-validator';

// Re-export for any caller still importing from the old location.
export { readLicenseRecord as readLicense };
export type { LicenseRecord };

function renderResult(action: string, r: LicenseResult): number {
  switch (r.kind) {
    case 'ok':
      console.log(pc.green(`✓ License ${action} succeeded.`));
      printRecord(r.record);
      return 0;
    case 'invalid':
      console.error(pc.red(`✗ ${r.reason}`));
      console.error(pc.dim('Check your license key — it should be in the email receipt from LemonSqueezy.'));
      return 1;
    case 'limit':
      console.error(pc.red(`✗ ${r.reason}`));
      console.error(pc.dim('You\'ve hit the activation limit for this license.'));
      console.error(pc.dim('Deactivate on another machine: cheesy license deactivate (run on that machine)'));
      console.error(pc.dim('Or contact support to raise the limit.'));
      return 1;
    case 'network':
      console.error(pc.yellow(`⚠ Network issue: ${r.reason}`));
      console.error(pc.dim('Check your connection and try again.'));
      return 2;
    case 'bad-request':
      console.error(pc.red(`✗ Request rejected: ${r.reason}`));
      return 1;
  }
}

function printRecord(rec: LicenseRecord): void {
  console.log();
  console.log(`  Product:   ${rec.productName ?? pc.dim('—')}`);
  console.log(`  Customer:  ${rec.customerEmail ?? pc.dim('—')}`);
  console.log(`  Instance:  ${rec.instanceName} (${pc.dim(rec.instanceId)})`);
  console.log(`  Status:    ${rec.status ? statusColor(rec.status) : pc.dim('unknown')}`);
  if (rec.activationLimit) {
    console.log(`  Slots:     ${rec.activationUsage ?? 0} / ${rec.activationLimit}`);
  }
  if (rec.expiresAt) {
    console.log(`  Expires:   ${rec.expiresAt}`);
  }
  if (rec.lastValidatedAt) {
    console.log(`  Validated: ${rec.lastValidatedAt}`);
  }
  console.log(`  Key:       ${pc.dim(rec.licenseKey.slice(0, 8) + '…' + rec.licenseKey.slice(-4))}`);
}

function statusColor(s: string): string {
  if (s === 'active') return pc.green(s);
  if (s === 'expired' || s === 'disabled') return pc.red(s);
  return pc.yellow(s);
}

export async function runLicenseActivate(key: string): Promise<number> {
  if (!key || !/^[0-9A-Fa-f-]{8,}/.test(key)) {
    console.error(pc.red('License key looks malformed. Expected a UUID-like string from your email receipt.'));
    return 1;
  }
  console.log(pc.cyan(`Activating license on ${defaultInstanceName()}…`));
  const r = await activateAndStore(key);
  return renderResult('activation', r);
}

export async function runLicenseStatus(): Promise<number> {
  // Dev mode short-circuit
  if (isDevMode()) {
    console.log(pc.yellow('License: DEV MODE'));
    console.log(pc.dim('Marker file at ~/.ccgram/.license-dev'));
    console.log(pc.dim('To use a real license: cheesy license activate <KEY>'));
    return 0;
  }
  const cached = readLicenseRecord();
  if (!cached) {
    console.log(pc.dim('No license activated on this machine.'));
    console.log(pc.dim(`Run: ${pc.bold('cheesy license activate <YOUR-KEY>')}`));
    return 0;
  }
  console.log(pc.cyan('Validating license…'));
  const r = await validateStored();
  return renderResult('validation', r);
}

export async function runLicenseDeactivate(): Promise<number> {
  const cached = readLicenseRecord();
  if (!cached) {
    console.log(pc.dim('No license to deactivate.'));
    return 0;
  }
  console.log(pc.cyan(`Deactivating ${cached.instanceName} (${cached.instanceId.slice(0, 8)}…)`));
  const r = await deactivateStored();
  return renderResult('deactivation', r);
}
