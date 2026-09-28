import { DurableObject } from 'cloudflare:workers';
import { provideData } from '../server/data.ts';
import { Hub } from '../server/hub.ts';
import type { AdapterEnv, AdapterFactory } from '../server/adapters/types.ts';
import type { CityId } from '../shared/types.ts';

// One Worker script per city, each with a single Durable Object that owns the city's live adapters
// (their state persists across polls). Separate scripts keep every city in its own 128 MB isolate.

export interface CityEnv extends AdapterEnv {
  HUB: DurableObjectNamespace;
}

export function defineCity(city: CityId, factory: AdapterFactory, data: Record<string, string>) {
  class CityHub extends DurableObject<CityEnv> {
    private hub: Hub | null = null;

    private getHub(): Hub {
      if (!this.hub) {
        for (const [rel, text] of Object.entries(data)) provideData(rel, text);
        // Secrets and vars arrive on env; pass them all through (adapters read only the keys they know).
        const env: AdapterEnv = { ...(this.env as unknown as AdapterEnv), storage: this.ctx.storage };
        this.hub = new Hub(factory(env), { timers: false, defer: (p) => this.ctx.waitUntil(p) });
      }
      return this.hub;
    }

    override async fetch(): Promise<Response> {
      const recv = Date.now();
      const snap = await this.getHub().snapshot(city);
      return new Response(JSON.stringify({ ...snap, recv, now: Date.now() }), {
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  const worker: ExportedHandler<CityEnv> = {
    async fetch(req, env) {
      if (new URL(req.url).pathname !== '/trains') return new Response('not found', { status: 404 });
      const stub = env.HUB.get(env.HUB.idFromName(city));
      return stub.fetch(req);
    },
  };
  return { CityHub, worker };
}
