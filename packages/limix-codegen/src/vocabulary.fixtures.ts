// What a program declares by hand beside the generated file: the role,
// permission and condition names its policy may use. `limix-codegen` never reads
// a policy, so these are written, not generated.
declare module '@softistx/limix' {
	interface Register {
		permission: 'notes:read' | 'notes:write';
		role: 'admin';
		condition: 'workingHours';
	}
}

export {};
