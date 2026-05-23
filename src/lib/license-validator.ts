/**
 * LemonSqueezy License API client.
 *
 * The License API is a *separate* API from the main LemonSqueezy API:
 *   - Base URL:   https://api.lemonsqueezy.com
 *   - Endpoints:  /v1/licenses/{activate,validate,deactivate}
 *   - Auth:       NONE — the license_key in the form-encoded body IS the auth.
 *   - Headers:    Accept: application/json
 *
 * Docs (the License API page is referenced in the LS API reference;
 * authoritative URL examples used by the official guides):
 *   https://api.lemonsqueezy.com/v1/licenses/activate
 *   https://api.lemonsqueezy.com/v1/licenses/validate
 *   https://api.lemonsqueezy.com/v1/licenses/deactivate
 *
 * Response invariant: status code is 200 on success AND on most "soft" errors
 * (invalid key, exceeded activation limit, etc.). The booleans
 * (activated|valid|deactivated) and the `error` field are the source of truth.
 * Hard failures (bad request, 5xx) come back as non-200 — handled below.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { CCGRAM_HOME } from '../utils/paths';

const LS_BASE = process.env.LEMONSQUEEZY_BASE_URL || 'https://api.lemonsqueezy.com';
const LICENSE_FILE = path.join(CCGRAM_HOME, '.license.json');
const DEV_MARKER_FILE = path.join(CCGRAM_HOME, '.license-dev');

// ── Types ────────────────────────────────────────────────────────

export interface LicenseKeyObject {
  id: number;
  status: string; // "active" | "inactive" | "expired" | "disabled"
  key: string;
  activation_limit: number | null;
  activation_usage: number;
  created_at: string;
  expires_at: string | null;
}

export interface LicenseInstance {
  id: string;
  name: string;
  created_at: string;
}

export interface LicenseMeta {
  store_id: number;
  order_id: number;
  order_item_id: number;
  product_id: number;
  product_name: string;
  variant_id: number;
  variant_name: string;
  customer_id: number;
  customer_name: string;
  customer_email: string;
}

export interface ActivateResponse {
  activated: boolean;
  error: string | null;
  license_key: LicenseKeyObject;
  instance: LicenseInstance;
  meta: LicenseMeta;
}

export interface ValidateResponse {
  valid: boolean;
  error: string | null;
  license_key: LicenseKeyObject;
  instance: LicenseInstance | null;
  meta: LicenseMeta;
}

export interface DeactivateResponse {
  deactivated: boolean;
  error: string | null;
  license_key: LicenseKeyObject;
  meta: LicenseMeta;
}

/** Stored locally at ~/.ccgram/.license.json (mode 0600). */
export interface LicenseRecord {
  licenseKey: string;
  instanceId: string;
  instanceName: string;
  activatedAt: string;       // ISO date — when we first activated.
  lastValidatedAt?: string;  // ISO date — last successful remote validation.
  productName?: string;
  customerName?: string;
  customerEmail?: string;
  status?: string;           // license_key.status from last validation
  activationLimit?: number | null;
  activationUsage?: number;
  expiresAt?: string | null;
}

/** Discriminated union for the validator result. */
export type LicenseResult =
  | { kind: 'ok'; record: LicenseRecord }
  | { kind: 'invalid'; reason: string }       // license is wrong/expired/disabled
  | { kind: 'limit'; reason: string }         // activation limit hit
  | { kind: 'network'; reason: string }       // couldn't reach LS
  | { kind: 'bad-request'; reason: string };  // 4xx other than 200-soft-fail

// ── HTTP helper ──────────────────────────────────────────────────

interface RawResponse {
  status: number;
  body: string;
}

/**
 * POST form-encoded data to a LemonSqueezy License API endpoint.
 * Uses global fetch (Node 18+).
 */
async function postForm(endpoint: string, params: Record<string, string>): Promise<RawResponse> {
  const url = `${LS_BASE}${endpoint}`;
  const body = new URLSearchParams(params).toString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    return { status: res.status, body: text };
  } finally {
    clearTimeout(timeout);
  }
}

// ── Endpoint wrappers ────────────────────────────────────────────

export async function activate(licenseKey: string, instanceName: string): Promise<ActivateResponse> {
  const res = await postForm('/v1/licenses/activate', {
    license_key: licenseKey,
    instance_name: instanceName,
  });
  if (res.status !== 200) {
    throw new HttpError(`Activate returned ${res.status}`, res.status, res.body);
  }
  return JSON.parse(res.body) as ActivateResponse;
}

export async function validate(licenseKey: string, instanceId?: string): Promise<ValidateResponse> {
  const params: Record<string, string> = { license_key: licenseKey };
  if (instanceId) params.instance_id = instanceId;
  const res = await postForm('/v1/licenses/validate', params);
  if (res.status !== 200) {
    throw new HttpError(`Validate returned ${res.status}`, res.status, res.body);
  }
  return JSON.parse(res.body) as ValidateResponse;
}

export async function deactivate(licenseKey: string, instanceId: string): Promise<DeactivateResponse> {
  const res = await postForm('/v1/licenses/deactivate', {
    license_key: licenseKey,
    instance_id: instanceId,
  });
  if (res.status !== 200) {
    throw new HttpError(`Deactivate returned ${res.status}`, res.status, res.body);
  }
  return JSON.parse(res.body) as DeactivateResponse;
}

class HttpError extends Error {
  status: number;
  body: string;
  constructor(msg: string, status: number, body: string) {
    super(msg);
    this.status = status;
    this.body = body;
  }
}

// ── High-level operations ────────────────────────────────────────

/** Pick a reasonable instance name. Hostname is identifiable to the customer
 *  ("activated on stephens-mbp") without leaking PII. Override via env. */
export function defaultInstanceName(): string {
  return process.env.CHEESY_INSTANCE_NAME || os.hostname() || 'cheesy';
}

/** Atomically write the license record to disk with mode 0600. */
function writeLicenseRecord(rec: LicenseRecord): void {
  fs.mkdirSync(CCGRAM_HOME, { recursive: true });
  const tmp = LICENSE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rec, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, LICENSE_FILE);
  // rename preserves mode on POSIX, but just in case:
  try { fs.chmodSync(LICENSE_FILE, 0o600); } catch {}
}

export function readLicenseRecord(): LicenseRecord | null {
  try {
    const raw = fs.readFileSync(LICENSE_FILE, 'utf8');
    return JSON.parse(raw) as LicenseRecord;
  } catch {
    return null;
  }
}

export function removeLicenseRecord(): void {
  try { fs.unlinkSync(LICENSE_FILE); } catch {}
}

export function isDevMode(): boolean {
  return fs.existsSync(DEV_MARKER_FILE);
}

export function writeDevMarker(): void {
  fs.mkdirSync(CCGRAM_HOME, { recursive: true });
  fs.writeFileSync(DEV_MARKER_FILE, new Date().toISOString() + '\n', { mode: 0o600 });
}

export function removeDevMarker(): void {
  try { fs.unlinkSync(DEV_MARKER_FILE); } catch {}
}

/**
 * Activate a license key and persist the record. Returns a discriminated
 * result so the caller can render a focused error message.
 */
export async function activateAndStore(licenseKey: string): Promise<LicenseResult> {
  const instanceName = defaultInstanceName();
  let resp: ActivateResponse;
  try {
    resp = await activate(licenseKey, instanceName);
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return classifyHttpError(err);
    }
    return { kind: 'network', reason: (err as Error).message };
  }

  if (!resp.activated || resp.error) {
    return classifySoftError(resp.error, resp.license_key);
  }

  const now = new Date().toISOString();
  const rec: LicenseRecord = {
    licenseKey,
    instanceId: resp.instance.id,
    instanceName: resp.instance.name,
    activatedAt: now,
    lastValidatedAt: now,
    productName: resp.meta.product_name,
    customerName: resp.meta.customer_name,
    customerEmail: resp.meta.customer_email,
    status: resp.license_key.status,
    activationLimit: resp.license_key.activation_limit,
    activationUsage: resp.license_key.activation_usage,
    expiresAt: resp.license_key.expires_at,
  };
  writeLicenseRecord(rec);
  // If they had a dev marker, drop it — they're a paying customer now.
  removeDevMarker();
  return { kind: 'ok', record: rec };
}

/**
 * Validate the stored license remotely. On success, refreshes the cached
 * record. On network failure, returns the cached record IF it was validated
 * within the offline-grace window.
 */
const OFFLINE_GRACE_DAYS = 7;

export async function validateStored(): Promise<LicenseResult> {
  const cached = readLicenseRecord();
  if (!cached) return { kind: 'invalid', reason: 'No license activated. Run: cheesy license activate <KEY>' };

  let resp: ValidateResponse;
  try {
    resp = await validate(cached.licenseKey, cached.instanceId);
  } catch (err: unknown) {
    if (err instanceof HttpError) {
      return classifyHttpError(err);
    }
    // Network failure — fall back to cached if recent enough.
    const last = cached.lastValidatedAt ? new Date(cached.lastValidatedAt).getTime() : 0;
    const ageDays = (Date.now() - last) / (1000 * 60 * 60 * 24);
    if (last && ageDays < OFFLINE_GRACE_DAYS) {
      return { kind: 'ok', record: cached };
    }
    return { kind: 'network', reason: `Could not reach LemonSqueezy and the cached validation is ${Math.floor(ageDays)} days old (grace = ${OFFLINE_GRACE_DAYS}d).` };
  }

  if (!resp.valid || resp.error) {
    return classifySoftError(resp.error, resp.license_key);
  }

  // Refresh cache.
  const refreshed: LicenseRecord = {
    ...cached,
    lastValidatedAt: new Date().toISOString(),
    productName: resp.meta.product_name,
    customerName: resp.meta.customer_name,
    customerEmail: resp.meta.customer_email,
    status: resp.license_key.status,
    activationLimit: resp.license_key.activation_limit,
    activationUsage: resp.license_key.activation_usage,
    expiresAt: resp.license_key.expires_at,
  };
  writeLicenseRecord(refreshed);
  return { kind: 'ok', record: refreshed };
}

/**
 * Deactivate the stored license remotely and remove the local record.
 */
export async function deactivateStored(): Promise<LicenseResult> {
  const cached = readLicenseRecord();
  if (!cached) return { kind: 'invalid', reason: 'No license is currently activated on this machine.' };

  try {
    const resp = await deactivate(cached.licenseKey, cached.instanceId);
    if (!resp.deactivated && resp.error) {
      // Still remove the local file — the customer's intent is clear.
      removeLicenseRecord();
      return { kind: 'invalid', reason: resp.error };
    }
  } catch (err: unknown) {
    // If we can't reach LS, we *don't* remove the local record — better to
    // leave it so the user can retry, otherwise they'd lose their instance ID.
    if (err instanceof HttpError) return classifyHttpError(err);
    return { kind: 'network', reason: (err as Error).message };
  }

  removeLicenseRecord();
  return { kind: 'ok', record: cached };
}

// ── Error classification ─────────────────────────────────────────

function classifyHttpError(err: HttpError): LicenseResult {
  // LS uses 400/404 for bad inputs.
  let msg = err.message;
  try {
    const body = JSON.parse(err.body);
    if (body.error) msg = body.error;
  } catch {}
  if (err.status >= 500) {
    return { kind: 'network', reason: `LemonSqueezy server error (${err.status}). Try again in a moment.` };
  }
  return { kind: 'bad-request', reason: msg };
}

function classifySoftError(err: string | null, lk: LicenseKeyObject | undefined): LicenseResult {
  const reason = err || 'license_key validation failed';
  const lower = reason.toLowerCase();
  if (lower.includes('activation') && lower.includes('limit')) {
    return { kind: 'limit', reason };
  }
  if (lk?.status === 'expired' || lower.includes('expired')) {
    return { kind: 'invalid', reason: 'License key has expired.' };
  }
  if (lk?.status === 'disabled' || lower.includes('disabled')) {
    return { kind: 'invalid', reason: 'License key has been disabled. Contact support.' };
  }
  return { kind: 'invalid', reason };
}
