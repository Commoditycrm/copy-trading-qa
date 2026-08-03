/**
 * Local SMS sink. With TWILIO_* creds blank, services/sms.py logs the composed message instead of
 * sending (log mode): WARNING "sms: TWILIO creds not set; NOT sending. to=<phone> body=<repr>". This
 * reads the backend container logs to assert whether an SMS was ATTEMPTED for a phone. No SMS is sent.
 */
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const compose = resolve(here, '../local-stack/docker-compose.qa.yml');

function backendLogs(sinceSeconds = 120): string {
  try {
    return execSync(`docker compose -f "${compose}" logs backend worker --since ${sinceSeconds}s --no-color`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/** Count SMS send-attempts (log-mode lines) to a phone, optionally whose body contains a substring. */
export function smsAttemptsTo(phone: string, bodyContains?: string): number {
  const logs = backendLogs();
  let n = 0;
  for (const line of logs.split('\n')) {
    if (!line.includes('sms:') || !line.includes(`to=${phone}`)) continue;
    if (!/NOT sending|sent to=|Twilio/.test(line)) continue; // an attempt (log-mode / success / reject)
    if (bodyContains && !line.includes(bodyContains)) continue;
    n += 1;
  }
  return n;
}

/** True if any SMS was attempted to the phone in the recent logs. */
export function smsAttempted(phone: string, bodyContains?: string): boolean {
  return smsAttemptsTo(phone, bodyContains) > 0;
}
