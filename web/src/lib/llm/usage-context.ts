import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Request-scoped attribution for LLM token spend.
 *
 * Route handlers / server actions wrap their LLM work in `withUsage(...)`,
 * and the gateway reads the current context to record one `usage_events`
 * row per completion — so every nested LLM call is metered automatically
 * without threading tenant ids through every function signature.
 */
export interface UsageContext {
  tenantId: string;
  /** Granular operation, e.g. "evaluation", "cv_score", "recruiter:screen". */
  feature: string;
}

const storage = new AsyncLocalStorage<UsageContext>();

export function withUsage<T>(ctx: UsageContext, fn: () => Promise<T>): Promise<T> {
  return storage.run(ctx, fn);
}

export function currentUsageContext(): UsageContext | undefined {
  return storage.getStore();
}
