import { buildApp } from './app';
import { createStore } from './store';

/** A fresh app (and its data) per spec. */
export async function freshApp() {
	return buildApp(createStore());
}

type Fetcher = { fetch(request: Request): Response | Promise<Response> };

function headersOf(user: string | undefined): Record<string, string> {
	return user === undefined ? {} : { authorization: `Bearer ${user}` };
}

/** A REST call as a demo user (anonymous when `user` is left out). */
export async function rest(
	app: Fetcher,
	method: string,
	path: string,
	user?: string,
	body?: unknown,
) {
	const response = await app.fetch(
		new Request(`http://localhost${path}`, {
			method,
			headers: {
				...headersOf(user),
				...(body === undefined ? {} : { 'content-type': 'application/json' }),
			},
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
		}),
	);
	const text = await response.text();
	return {
		status: response.status,
		body: text === '' ? undefined : (JSON.parse(text) as unknown),
	};
}

interface GraphqlResult {
	status: number;
	data?: Record<string, unknown> | null;
	errors?: {
		message: string;
		path?: unknown[];
		extensions?: { code?: string };
	}[];
}

/** A GraphQL operation as a demo user. */
export async function gql(
	app: Fetcher,
	query: string,
	user?: string,
): Promise<GraphqlResult> {
	const response = await app.fetch(
		new Request('http://localhost/graphql', {
			method: 'POST',
			headers: { ...headersOf(user), 'content-type': 'application/json' },
			body: JSON.stringify({ query }),
		}),
	);
	return { status: response.status, ...((await response.json()) as object) };
}
