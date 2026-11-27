import { expect, test } from 'bun:test';
import type {
	JSONWebKeySet,
	PolicyStore,
	RefreshResult,
	RemotePolicy,
	RemotePolicyErrorCode,
	RemotePolicyLogger,
	RemotePolicyOptions,
	StoredPolicy,
	VerifiedRules,
	VerifyRulesOptions,
} from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual([
		'ALGORITHMS',
		'DEFAULT_TYP',
		'RemotePolicyConfigError',
		'RemotePolicyError',
		'remotePolicy',
		'verifyRules',
	]);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	JSONWebKeySet,
	PolicyStore,
	RefreshResult,
	RemotePolicy,
	RemotePolicyErrorCode,
	RemotePolicyLogger,
	RemotePolicyOptions,
	StoredPolicy,
	VerifiedRules,
	VerifyRulesOptions,
];
