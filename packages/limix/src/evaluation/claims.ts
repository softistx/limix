/** Who or what a relation is asked about, and the object it is asked on: `{ type, id }` as in janus. */
export interface Subject {
	readonly type: string;
	readonly id: string;
}

/**
 * The caller, as the integration read it from its own credential. A rule only
 * ever sees this: the evaluators never read a header, a cookie or a token.
 */
export interface Claims {
	/** Whether the credential named a caller at all. */
	readonly authenticated: boolean;
	/** The `{ type, id }` the relations port is asked about. */
	readonly subject?: Subject;
	/** Read by `roles`: a role holds when it is in this list; a value that is not a list holds nothing. */
	readonly roles?: readonly string[];
	/**
	 * Read by `permissions`, together with `scope`: a permission must be a token
	 * of `scope`, and also in this list when it is present. A value that is not a
	 * list holds nothing.
	 */
	readonly permissions?: readonly string[];
	/**
	 * Space-separated OAuth scopes. A permission must be a token of `scope`, and
	 * also in `permissions` when that list is present; without `scope` (or with
	 * one that is not a string) no permission holds.
	 */
	readonly scope?: string;
	/** Anything else the issuer sent; a `when` condition can read it. */
	readonly [claim: string]: unknown;
}

export function isAuthenticated(claims: Claims): boolean {
	return claims.authenticated === true;
}
