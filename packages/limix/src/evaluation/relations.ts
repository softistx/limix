import type { Subject } from './claims';

/** One question to the relations backend: may `subject` hold `relation` on `object`? */
export interface RelationQuery {
	readonly subject: Subject;
	readonly relation: string;
	readonly object: { readonly type: string; readonly id: string };
}

/**
 * The port relations go through (janus first, through `@softistx/limix-janus`, planned: see the roadmap).
 * Called once per rung with every query of that rung; it answers one boolean
 * per query, in order.
 */
export interface RelationChecker {
	check(queries: RelationQuery[]): Promise<boolean[]>;
}
