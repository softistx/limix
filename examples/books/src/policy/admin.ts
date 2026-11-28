import type { RestRules } from '../generated/limix';

/**
 * The REST rules under /admin. Document order is the first-match order: the
 * public health check is written BEFORE the "* /admin/*" wildcard, which would
 * otherwise take it and ask for an admin. Keep this block's keys in that order.
 */
export const adminRest = {
	'GET /admin/health': { public: true },

	// Method wildcard: every method under /admin. The "*" of the path takes one
	// or more characters.
	'* /admin/*': { roles: [['admin']] },
} satisfies RestRules<never>;
