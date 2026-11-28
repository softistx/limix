import { parseArgs } from 'node:util';
import { type ModuleInput, sourceNames } from '../module';
import { readGraphql, readOpenapi } from '../sources';
import type { Io } from './io';

const BASE = {
	graphql: { type: 'string', multiple: true },
	openapi: { type: 'string', multiple: true },
	help: { type: 'boolean', short: 'h' },
} as const;

/** The flags every command shares, plus the command's own. */
export function parseInputs<
	T extends Record<string, { type: 'string' | 'boolean'; short?: string }>,
>(argv: readonly string[], extra: T) {
	return parseArgs({
		args: [...argv],
		allowPositionals: false,
		options: { ...BASE, ...extra },
	});
}

export interface InputFlags {
	graphql?: string[] | undefined;
	openapi?: string[] | undefined;
}

/** What the inputs hold; `sources` names them. */
export async function loadInputs(
	flags: InputFlags,
	io: Io,
): Promise<ModuleInput> {
	const sources: string[] = [];
	const input: { -readonly [K in keyof ModuleInput]: ModuleInput[K] } = {
		sources,
	};
	if (flags.graphql?.length) {
		input.graphql = await readGraphql(flags.graphql, io);
		sources.push(...flags.graphql);
	}
	if (flags.openapi?.length) {
		const lists = await Promise.all(
			flags.openapi.map((p) => readOpenapi(p, io)),
		);
		input.rest = lists.flat();
		sources.push(...flags.openapi);
	}
	input.sources = sourceNames(sources);
	return input;
}
