import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { ok, whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import { gqlPolicy, schema } from './graphql.fixtures';
import { limixGraphql } from './limix-graphql';

const tryOpen = (port: number, path: string) =>
	new Promise<string>((resolve) => {
		const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
		const timer = setTimeout(() => resolve('timeout'), 2000);
		ws.onmessage = (event) => {
			clearTimeout(timer);
			resolve(`message:${event.data}`);
			ws.close();
		};
		ws.onerror = () => {
			clearTimeout(timer);
			resolve('refused');
		};
	});

describe('a user websocket at the limixGraphql path', () => {
	test('is judged by the REST rules: an anonymous client is refused under deny', async () => {
		const app = alxia();
		const limix = { policy: gqlPolicy, claims: whoOf, app };
		app.use(limixGuard(limix));
		app.get('/open', ok);
		limixGraphql(app, { schema: schema(), limix });
		app.ws('/graphql', {
			open(ws) {
				ws.send('secret-over-socket');
			},
			message() {},
		});
		const server = await app.listen({ port: 0, hostname: '127.0.0.1' });
		try {
			expect(await tryOpen(server.port as number, '/graphql')).toBe('refused');
		} finally {
			await server.stop(true);
		}
	});
});
