import { coverage, type RestOperation } from '@softistx/limix/coverage';
import { app, policy } from './hono';

// Hono spells a parameter `:id`, as the rules file does, so a path needs no
// conversion. `app.use` registers as `ALL` and is no operation; a wildcard
// route (`/files/*`) must be spelled as the rules file spells it (`/files/*path`).
export function honoOperations(hono: {
	routes: readonly { method: string; path: string }[];
}): RestOperation[] {
	return hono.routes
		.filter((route) => route.method !== 'ALL')
		.map((route) => ({ kind: 'rest', method: route.method, path: route.path }));
}

export const report = coverage(policy, honoOperations(app));
export const uncovered = report.operations
	.filter((entry) => entry.status === 'uncovered')
	.map((entry) => entry.label);
export const stale = report.stale.map((rule) => rule.label);
