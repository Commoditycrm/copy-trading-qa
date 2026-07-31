/**
 * Shared provisioning for trading/fanout specs. Registers a trader + N subscribers via the API, then
 * seeds fake broker accounts + follow/copy state (local-only). Returns the trader's broker account id
 * for order entry and a cleanup that hard-deletes every synthetic user (cascades accounts/settings/orders).
 */
import type { SafeApi } from '../../../common/api.js';
import type { QaConfig } from '../../../common/config.js';
import { makeUser } from '../../../common/factory.js';
import * as auth from '../../clients/authApi.js';
import { seedFanout, type SubSpec, type FanoutSeed } from '../../../common/tradingSetup.js';
import { deleteUser } from '../../../common/localAdmin.js';

export interface Provisioned {
  traderAccess: string;
  traderId: string;
  brokerAccountId: string;
  traderEmail: string;
  subs: FanoutSeed['subscribers'];
  cleanup: () => void;
}

/** subSpecs describe each subscriber's copy config; emails are generated and returned via `subs`. */
export async function provisionFanout(
  api: SafeApi,
  config: QaConfig,
  subSpecs: Array<Omit<SubSpec, 'email'>>,
): Promise<Provisioned> {
  const trader = makeUser('trader');
  const t = await auth.registerAndLogin(api, trader);

  const subUsers = subSpecs.map(() => makeUser('subscriber'));
  for (const su of subUsers) {
    const r = await auth.register(api, su);
    if (r.status() !== 201) throw new Error(`subscriber register failed ${r.status()}: ${await r.text()}`);
  }

  const specs: SubSpec[] = subUsers.map((su, i) => ({ ...(subSpecs[i] as Omit<SubSpec, 'email'>), email: su.email }));
  const seed = seedFanout(config, trader.email, specs);
  const emails = [trader.email, ...subUsers.map((u) => u.email)];

  return {
    traderAccess: t.access,
    traderId: seed.trader_id,
    brokerAccountId: seed.trader_account_id,
    traderEmail: trader.email,
    subs: seed.subscribers,
    cleanup: () => {
      if (process.env.QA_KEEP_DATA === '1') return; // debugging: leave rows for inspection
      for (const e of emails) {
        try {
          deleteUser(config, e);
        } catch {
          /* best-effort cleanup */
        }
      }
    },
  };
}
