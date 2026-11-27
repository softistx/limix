import { type Claims, holdsPermission } from '@softistx/limix';

/**
 * The `can` predicate `printSchemaFor` and `visibleSchema` of
 * `@softistx/graxia/agent` take: a permission holds for a signed-in caller that
 * holds it as the rules read it (`scope`, and `permissions` when present).
 * Roles are never read. Synchronous and pure.
 */
export function canOf(claims: Claims): (permission: string) => boolean {
	if (claims === null || typeof claims !== 'object') {
		throw new TypeError('canOf: claims must be an object');
	}
	if (claims.authenticated !== true) return () => false;
	return holdsPermission(claims);
}
