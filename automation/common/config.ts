/**
 * Central QA config loader. Reads environment from process.env (populated by
 * dotenv / CI secret store). No secrets are hard-coded; only variable names are
 * referenced. See docs/ENVIRONMENT_GUIDE.md.
 */
import 'dotenv/config';

export type EnvName = 'local' | 'qa' | 'prod';
export type BrokerMode = 'fake' | 'paper' | 'none';

export interface QaConfig {
  envName: EnvName;
  apiBaseUrl: string;
  frontendUrl: string;
  brokerMode: BrokerMode;
  /** QA-only JWT secret used to mint test tokens. Never a production secret. */
  jwtSecret?: string;
  /** Whether this run is explicitly authorized for the manual Alpaca Paper suite. */
  paperAuthorized: boolean;
}

const PROD_HOST_MARKERS = ['kopyya.com'];
const NONPROD_HOST_MARKERS = ['test.kopyya.com', 'localhost', '127.0.0.1'];

function detectEnv(apiBaseUrl: string): EnvName {
  const explicit = (process.env.QA_ENV || '').toLowerCase();
  if (explicit === 'local' || explicit === 'qa' || explicit === 'prod') return explicit;
  const host = apiBaseUrl.toLowerCase();
  // test.kopyya.com must be checked before the bare kopyya.com marker.
  if (NONPROD_HOST_MARKERS.some((m) => host.includes(m))) {
    return host.includes('localhost') || host.includes('127.0.0.1') ? 'local' : 'qa';
  }
  if (PROD_HOST_MARKERS.some((m) => host.includes(m))) return 'prod';
  return 'local';
}

export function loadConfig(): QaConfig {
  const apiBaseUrl = process.env.QA_BASE_URL || process.env.PROD_BASE_URL || 'http://localhost:8000';
  const frontendUrl = process.env.QA_FRONTEND_URL || process.env.PROD_FRONTEND_URL || 'http://localhost:3000';
  const envName = detectEnv(apiBaseUrl);
  const brokerMode = (process.env.BROKER_MODE || (envName === 'prod' ? 'none' : 'fake')) as BrokerMode;

  return {
    envName,
    apiBaseUrl: apiBaseUrl.replace(/\/+$/, ''),
    frontendUrl: frontendUrl.replace(/\/+$/, ''),
    brokerMode,
    jwtSecret: process.env.JWT_SECRET,
    paperAuthorized: process.env.PAPER_SUITE_AUTHORIZED === 'true',
  };
}

export const isProduction = (c: QaConfig): boolean => c.envName === 'prod';
