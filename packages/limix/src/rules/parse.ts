import { formatPath, RulesError, type RulesIssue } from './error';
import { BAD_KEY, graphqlKeyProblem, restKeyProblem } from './keys';
import { type Rules, RulesSchema } from './schema';

/**
 * Validates a rules document and returns it. Throws a `RulesError` listing
 * every issue with its path; `x-` top-level keys (YAML anchors) are dropped.
 */
export function parseRules(input: unknown, source?: string): Rules {
	const result = RulesSchema.safeParse(input);
	if (result.success) return result.data;
	const issues: RulesIssue[] = result.error.issues.flatMap((issue) => {
		if (issue.code === 'unrecognized_keys') {
			// One issue per key, at the key, so the path says which one.
			return issue.keys.map((key) => ({
				path: formatPath([...issue.path, key]),
				message: keyMessage(issue.message, key),
			}));
		}
		return [{ path: formatPath(issue.path), message: messageOf(issue) }];
	});
	throw new RulesError(issues, source);
}

/** The part of a multi-key message that concerns `key`. */
function keyMessage(message: string, key: string): string {
	const own = message
		.split('; ')
		.find(
			(part) => part.startsWith(`\`${key}\``) || part.includes(`\`${key}\``),
		);
	return own ?? message;
}

/** What zod said, except for a refused key of `rest` or `graphql`, which it only marks. */
function messageOf(issue: {
	path: readonly PropertyKey[];
	message: string;
}): string {
	if (issue.message !== BAD_KEY) return issue.message;
	const [block, key] = issue.path;
	if (typeof key !== 'string') return issue.message;
	return (
		(block === 'rest' ? restKeyProblem(key) : graphqlKeyProblem(key)) ??
		issue.message
	);
}
