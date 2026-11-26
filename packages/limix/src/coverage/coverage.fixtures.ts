import type { coverage, Operation } from './index';

export const rest = (method: string, path: string): Operation => ({
	kind: 'rest',
	method,
	path,
});
export const field = (type: string, name: string, root = true): Operation => ({
	kind: 'graphql',
	type,
	field: name,
	root,
});
export const statuses = (report: ReturnType<typeof coverage>) =>
	report.operations.map((entry) => `${entry.label} ${entry.status}`);
