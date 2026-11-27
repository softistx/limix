import { describe, expect, test } from 'bun:test';
import { fencesOf, problemsOf } from './guide.fixtures';

const problems = (text: string) => problemsOf(fencesOf(text));

describe('the guide fence check', () => {
	test('accepts marked fences and the free languages', () => {
		const text = [
			'<!-- before -->',
			'```ts',
			"import x from 'y';",
			'```',
			'```sh',
			'bun add x',
			'```',
		].join('\n');
		expect(problems(text)).toEqual([]);
	});

	const bypasses: Record<string, string> = {
		'a tilde fence': '~~~ts\nconst a = 1;\n~~~',
		'an indented fence': '  ```ts\n  const a = 1;\n  ```',
		'a four-backtick fence': '````ts\nconst a = 1;\n````',
		typescript: '```typescript\nconst a = 1;\n```',
		tsx: '```tsx\nconst a = 1;\n```',
		js: '```js\nconst a = 1;\n```',
		mjs: '```mjs\nconst a = 1;\n```',
		yml: '```yml\na: 1\n```',
		'an upper-case language': '```TS\nconst a = 1;\n```',
		'no language': '```\nconst a = 1;\n```',
		'an unknown language': '```python\na = 1\n```',
	};
	for (const [name, text] of Object.entries(bypasses)) {
		test(`refuses ${name}`, () => {
			expect(problems(text).length).toBeGreaterThan(0);
		});
	}

	test('refuses a before fence that imports limix', () => {
		const text =
			"<!-- before -->\n```ts\nimport { a } from '@softistx/limix';\n```";
		expect(problems(text)).toEqual([
			'line 2: a "before" fence imports @softistx/limix',
		]);
	});

	test('a fence nested in a longer one is one fence', () => {
		const text = '<!-- before -->\n````ts\n```ts\nx\n```\n````';
		expect(fencesOf(text).length).toBe(1);
	});
});
