import { serve } from 'bun';
import { buildApp } from './app';

const port = Number(Bun.env['PORT'] ?? 3000);
const { app } = await buildApp();

const server = serve({ fetch: app.fetch, port });
console.log(`books API on ${server.url} (REST, and GraphQL at /graphql)`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		void server.stop().finally(() => process.exit(0));
	});
}
