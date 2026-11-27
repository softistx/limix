import { expect, test } from 'bun:test';
import pkg from '../package.json';
import type {
	Alg,
	JSONWebKeySet,
	JWK,
	JwksEndpointOptions,
	JwksKey,
	PublishErrorCode,
	RulesEndpointOptions,
	SignRulesOptions,
} from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual([
		'ALGS',
		'DEFAULT_EXPIRES_IN',
		'PublishError',
		'generateSigningKeyPair',
		'importSigningKey',
		'jwksEndpoint',
		'jwksOf',
		'rulesEndpoint',
		'signRules',
	]);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	Alg,
	JSONWebKeySet,
	JWK,
	JwksEndpointOptions,
	JwksKey,
	PublishErrorCode,
	RulesEndpointOptions,
	SignRulesOptions,
];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual(['.', './package.json']);
});
