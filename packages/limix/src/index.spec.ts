import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pkg from '../package.json';
import * as api from './index';
import {
	type Claims,
	type CompiledGraphqlEntry,
	type CompiledPolicy,
	type CompiledRestRoute,
	type CompileOptions,
	type Condition,
	type ConditionContext,
	type ConditionMap,
	type ConditionName,
	type Decision,
	type Explanation,
	type FieldInput,
	type GraphqlOperationName,
	LIMIX_FORMAT_VERSION,
	type MutableSource,
	type Permission,
	type PolicyInput,
	type PolicySource,
	type Refusal,
	type Register,
	type RelationChecker,
	type RelationQuery,
	type RestInput,
	type RestOperationName,
	type RestRequest,
	type Role,
	type Rules,
	type RulesIssue,
	type Step,
	type StepKind,
	type Subject,
	type TermStep,
	type TypedRules,
	type TypedRulesInput,
} from './index';

test('the rules format starts at version 1', () => {
	expect(LIMIX_FORMAT_VERSION).toBe(1);
});

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual([
		'CODE_FORBIDDEN',
		'CODE_NOT_FOUND',
		'CODE_UNAUTHENTICATED',
		'CODE_UNAVAILABLE',
		'LIMIX_FORMAT_VERSION',
		'LimixRefusal',
		'RulesError',
		'compilePolicy',
		'definePolicy',
		'evaluateField',
		'evaluateRest',
		'explain',
		'holdsPermission',
		'isLimixRefusal',
		'isPolicySource',
		'mutableSource',
		'outageReporter',
		'parseRules',
		'policySource',
		'staticSource',
	]);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	Claims,
	CompileOptions,
	CompiledGraphqlEntry,
	CompiledPolicy,
	CompiledRestRoute,
	Condition,
	ConditionContext,
	ConditionMap,
	ConditionName,
	Decision,
	Explanation,
	FieldInput,
	GraphqlOperationName,
	MutableSource,
	Permission,
	PolicyInput,
	PolicySource,
	Refusal,
	Register,
	RelationChecker,
	RelationQuery,
	RestInput,
	RestOperationName,
	RestRequest,
	Role,
	Rules,
	RulesIssue,
	Step,
	StepKind,
	Subject,
	TermStep,
	TypedRules,
	TypedRulesInput,
];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual([
		'.',
		'./bun',
		'./coverage',
		'./package.json',
		'./remote',
		'./rules.schema.json',
	]);
});

test('the rules schema target exists', () => {
	const target = pkg.exports['./rules.schema.json'];
	expect(existsSync(join(import.meta.dir, '..', target))).toBe(true);
});
