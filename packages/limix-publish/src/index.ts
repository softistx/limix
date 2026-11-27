/**
 * The emitter side of `@softistx/limix/remote`: sign a rules file as a JWS,
 * publish its key set, serve both. No `node:` or Bun API here, so it runs in
 * a browser or an edge worker; the `limix-publish` command is the Bun part.
 */

export {
	type JwksEndpointOptions,
	jwksEndpoint,
	type RulesEndpointOptions,
	rulesEndpoint,
} from './endpoint';
export { PublishError, type PublishErrorCode } from './errors';
export type { JSONWebKeySet, JWK } from './jose';
export {
	ALGORITHMS,
	type Alg,
	generateSigningKeyPair,
	importSigningKey,
	type JwksKey,
	jwksOf,
} from './keys';
export { type SignRulesOptions, signRules } from './sign';
