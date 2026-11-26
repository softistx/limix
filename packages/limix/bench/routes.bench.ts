/**
 * Compares three ways to match REST route patterns, on ~300 realistic routes
 * and 10,000 first-match lookups (the scan `findRoute` does):
 *
 *   (a) path-to-regexp v8, the baseline (a root devDependency, for this
 *       script only: the package no longer depends on it),
 *   (b) `URLPattern`, the web standard (the rules syntax translated to it),
 *   (c) the in-house compiler of `src/rules/compile/matcher.ts`.
 *
 * Run with `bun run packages/limix/bench/routes.bench.ts` or, on Node >= 23.8
 * (global `URLPattern`, and a TypeScript loader such as `--experimental-strip-types`),
 * `node --experimental-strip-types packages/limix/bench/routes.bench.ts`.
 * Not shipped: outside `src/`, and not in `files`.
 */
import { match as ptrMatch } from 'path-to-regexp';
import { compileMatcher } from '../src/rules/compile/matcher';
import { type PatternToken, parsePattern } from '../src/rules/compile/pattern';

type Lookup = (path: string) => unknown;

const BASE = '/api/v2';
const resources = [
	'users',
	'orders',
	'invoices',
	'products',
	'carts',
	'payments',
	'teams',
	'projects',
	'tasks',
	'comments',
	'files',
	'reports',
	'tags',
	'notes',
	'events',
	'devices',
	'sessions',
	'tokens',
	'webhooks',
	'plans',
	'coupons',
	'refunds',
	'shipments',
	'reviews',
	'groups',
	'roles',
	'folders',
	'exports',
	'imports',
	'alerts',
];

/** ~300 patterns: static, one param, nested params, a wildcard, an optional group. */
function buildPatterns(): { patterns: string[]; samples: string[] } {
	const patterns: string[] = [];
	const samples: string[] = [];
	const add = (pattern: string, sample: string) => {
		patterns.push(`${BASE}${pattern}`);
		samples.push(`${BASE}${sample}`);
	};
	for (const [i, r] of resources.entries()) {
		add(`/${r}`, `/${r}`);
		add(`/${r}/:id`, `/${r}/${1000 + i}`);
		add(
			`/${r}/:id/${resources[(i + 1) % resources.length]}`,
			`/${r}/${i}/${resources[(i + 1) % resources.length]}`,
		);
		add(
			`/${r}/:id/${resources[(i + 2) % resources.length]}/:childId`,
			`/${r}/${i}/${resources[(i + 2) % resources.length]}/c${i}`,
		);
		add(
			`/${r}/by-name/:name/versions/:version`,
			`/${r}/by-name/n${i}/versions/${i}`,
		);
		add(`/${r}/search`, `/${r}/search`);
		add(`/${r}/export{.:ext}`, `/${r}/export.csv`);
		add(`/${r}{/:slug}`, `/${r}/slug-${i}`);
		add(`/static/${r}/*path`, `/static/${r}/a/b/c-${i}.png`);
		add(`/${r}/:id/history/:year/:month`, `/${r}/${i}/history/2026/11`);
	}
	return { patterns, samples };
}

/** The rules syntax in URLPattern's: `*name` is `:name(.+)`, `{...}` is optional, a trailing slash is allowed. */
function toUrlPattern(pattern: string): string {
	const out = (tokens: readonly PatternToken[]): string =>
		tokens
			.map((token) =>
				token.type === 'group'
					? `{${out(token.tokens)}}?`
					: token.type === 'text'
						? token.value.replace(/[+*?:(){}\\]/g, '\\$&')
						: token.type === 'param'
							? `:${token.name}`
							: `:${token.name}(.+)`,
			)
			.join('');
	return `${out(parsePattern(pattern))}{/}?`;
}

const strategies: Record<string, ((pattern: string) => Lookup) | undefined> = {
	'(a) path-to-regexp v8': (p) => ptrMatch(p, { decode: decodeURIComponent }),
	'(b) URLPattern':
		typeof URLPattern === 'function'
			? (p) => {
					const urlPattern = new URLPattern(
						{ pathname: toUrlPattern(p) },
						{ ignoreCase: true },
					);
					return (path) => urlPattern.exec({ pathname: path });
				}
			: undefined,
	'(c) in-house RegExp': compileMatcher,
};

const median = (values: number[]) =>
	[...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] as number;

function run(
	name: string,
	compile: (pattern: string) => Lookup,
	patterns: string[],
	paths: string[],
) {
	const compileTimes: number[] = [];
	let matchers: Lookup[] = [];
	for (let i = 0; i < 21; i++) {
		const start = performance.now();
		matchers = patterns.map(compile);
		compileTimes.push(performance.now() - start);
	}
	const lookupRates: number[] = [];
	let hits = 0;
	for (let round = 0; round < 11; round++) {
		hits = 0;
		const start = performance.now();
		for (const path of paths) {
			for (const matcher of matchers) {
				if (matcher(path)) {
					hits++;
					break;
				}
			}
		}
		lookupRates.push(paths.length / ((performance.now() - start) / 1000));
	}
	return {
		name,
		compileMs: median(compileTimes.slice(1)),
		lookupsPerSecond: median(lookupRates.slice(1)),
		hits,
	};
}

const { patterns, samples } = buildPatterns();
// 10k lookups: the 300 hits in rotation, a tenth of them misses (an unknown path).
const paths = Array.from({ length: 10_000 }, (_, i) =>
	i % 10 === 9
		? `${BASE}/unknown/${i}/nothing`
		: (samples[(i * 7) % samples.length] as string),
);

const runtime =
	typeof Bun === 'undefined' ? `Node ${process.version}` : `Bun ${Bun.version}`;
console.log(`${runtime}: ${patterns.length} routes, ${paths.length} lookups\n`);
const results = Object.entries(strategies).flatMap(([name, compile]) =>
	compile ? [run(name, compile, patterns, paths)] : [],
);
if (!strategies['(b) URLPattern'])
	console.log('URLPattern: not available in this runtime\n');
const baseline = results[0];
console.log(
	'| option | compile 300 routes (ms) | lookups/s | vs (a) |\n| --- | ---: | ---: | ---: |',
);
for (const r of results) {
	const ratio = baseline
		? ((r.lookupsPerSecond / baseline.lookupsPerSecond - 1) * 100).toFixed(1)
		: '0';
	console.log(
		`| ${r.name} | ${r.compileMs.toFixed(2)} | ${Math.round(r.lookupsPerSecond).toLocaleString('en-US')} | ${ratio}% |`,
	);
}
const hitCounts = new Set(results.map((r) => r.hits));
console.log(
	hitCounts.size === 1
		? `\nAll options agree: ${[...hitCounts][0]} hits per round.`
		: `\nDISAGREEMENT in hits: ${results.map((r) => `${r.name}=${r.hits}`).join(', ')}`,
);
