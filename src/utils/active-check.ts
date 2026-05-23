/**
 * active-check.ts — Detects whether the user is actively working at the terminal.
 *
 * Reads /tmp/claude_last_msg_time (written by the UserPromptSubmit hook in
 * ~/.claude/settings.json) to determine when the user last sent a message to Claude.
 *
 * If the gap is below ACTIVE_THRESHOLD_SECONDS (default: 120 = 2 min), the user
 * is considered active at the terminal and Telegram notifications should be
 * suppressed (they can see the output directly). After 2 min idle, Telegram
 * takes over so the user can answer permissions/questions from their phone.
 *
 * Applied to: enhanced-hook-notify (Stop/Notification), permission-hook (PermissionRequest).
 * Skipped when: typing-active file exists (command was Telegram-injected).
 */

import fs from 'fs';

const LAST_MSG_FILE = '/tmp/claude_last_msg_time';
const DEFAULT_THRESHOLD = 120; // 2 minutes — Cheesyboy default (was 300 in upstream ccgram)

/**
 * Returns true if the user sent a Claude message within the active threshold.
 * @param thresholdSeconds - seconds since last message to consider user "active" (default 120)
 */
export function isUserActiveAtTerminal(
  thresholdSeconds: number = parseInt(process.env.ACTIVE_THRESHOLD_SECONDS || '', 10) || DEFAULT_THRESHOLD
): boolean {
  try {
    const raw = fs.readFileSync(LAST_MSG_FILE, 'utf8').trim();
    const lastMsg = parseInt(raw, 10);
    if (!lastMsg || isNaN(lastMsg)) return false;
    const nowSeconds = Math.floor(Date.now() / 1000);
    return (nowSeconds - lastMsg) < thresholdSeconds;
  } catch {
    // File doesn't exist — no session info, assume not active
    return false;
  }
}
