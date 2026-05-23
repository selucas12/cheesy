/**
 * `cheesy license <subcommand>` — manage LemonSqueezy license activation.
 *
 * MILESTONE 1: Subcommand scaffolding only. The real LemonSqueezy API calls
 * land in Milestone 2 (src/lib/license-validator.ts). For now each subcommand
 * prints a "not yet implemented" notice so the surface area is locked in.
 *
 * Subcommands:
 *   activate <key>   — Activate a license key on this machine.
 *   status           — Show the current license status (validates remotely).
 *   deactivate       — Release the activation (free a slot).
 */

import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { CCGRAM_HOME } from '../utils/paths';

const LICENSE_FILE = path.join(CCGRAM_HOME, '.license.json');

export interface LicenseRecord {
  licenseKey: string;
  instanceId: string;
  instanceName: string;
  activatedAt: string;
  productName?: string;
  customerName?: string;
  customerEmail?: string;
}

/** Read the stored license record, if any. Returns null if missing/invalid. */
export function readLicense(): LicenseRecord | null {
  try {
    const raw = fs.readFileSync(LICENSE_FILE, 'utf8');
    return JSON.parse(raw) as LicenseRecord;
  } catch {
    return null;
  }
}

function notImplemented(subcommand: string): number {
  console.log(pc.yellow(`cheesy license ${subcommand}: not yet implemented.`));
  console.log(pc.dim('Wiring lands in Milestone 2 (src/lib/license-validator.ts).'));
  return 2;
}

export async function runLicenseActivate(_key: string): Promise<number> {
  return notImplemented('activate');
}

export async function runLicenseStatus(): Promise<number> {
  const rec = readLicense();
  if (!rec) {
    console.log(pc.dim('No license activated on this machine.'));
    console.log(pc.dim(`Run: ${pc.bold('cheesy license activate <YOUR-KEY>')}`));
    return 0;
  }
  console.log(pc.bold('License (cached — remote validation pending Milestone 2):'));
  console.log(`  Product:   ${rec.productName ?? pc.dim('unknown')}`);
  console.log(`  Customer:  ${rec.customerEmail ?? pc.dim('unknown')}`);
  console.log(`  Instance:  ${rec.instanceName} (${pc.dim(rec.instanceId)})`);
  console.log(`  Activated: ${rec.activatedAt}`);
  console.log(`  Key:       ${pc.dim(rec.licenseKey.slice(0, 8) + '…' + rec.licenseKey.slice(-4))}`);
  return 0;
}

export async function runLicenseDeactivate(): Promise<number> {
  return notImplemented('deactivate');
}
