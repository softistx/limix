// The names the policy (src/policy.ts) may use, declared once, by hand.
// `limix-codegen` generates the API's operations (src/generated/limix.ts); it
// never reads the policy, so the roles and permissions are written here and
// `definePolicy` refuses any other in `roles` and `permissions`. The condition
// names come from the `conditions` object the policy passes to `definePolicy`.
//
// Declare them BEFORE or AFTER generating, but never in the generated file:
// `generate` rewrites it, and a key declared twice in `Register` conflicts.
declare module '@softistx/limix' {
	interface Register {
		role: 'editor' | 'admin';
		permission: 'books:write';
	}
}

export {};
