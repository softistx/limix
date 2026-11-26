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
	/** Read by `roles`: a role holds when it is in this list. */
	readonly roles?: readonly string[];
	/** Read by `permissions`: a permission holds when it is in this list. */
	readonly permissions?: readonly string[];
	/**
	 * Space-separated OAuth scopes. When present, a permission must also be one
	 * of its tokens: the scope is what the token was granted, `permissions`
	 * what the caller still holds.
	 */
	readonly scope?: string;
	/** Anything else the issuer sent; a `when` condition can read it. */
	readonly [claim: string]: unknown;
}

export function isAuthenticated(claims: Claims): boolean {
	return claims.authenticated === true;
}
