const own = (value: unknown, key: string): unknown =>
	typeof value === 'object' && value !== null && Object.hasOwn(value, key)
		? (value as Record<string, unknown>)[key]
		: undefined;

/**
 * The object ids a term's `from` names: `param.id`, `query.project`,
 * `json.doc.id` or `args.input.noteId`, the first segment picking a root. A
 * list gives one id per element, so the relation must hold on every one. A
 * path that resolves nothing gives `[]`, and the term then does not hold.
 */
export function readIds(
	roots: Readonly<Record<string, unknown>>,
	from: string,
): string[] {
	const [root = '', ...path] = from.split('.');
	let value = own(roots, root);
	for (const key of path) value = own(value, key);
	return (Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === 'string' && item.length > 0,
	);
}
