import { filePolicyStore } from '@softistx/limix/bun';
import { remotePolicy } from '@softistx/limix/remote';

export function rulesFromServer(token: () => string) {
	return remotePolicy({
		rulesUrl: 'https://policy.example.com/tenants/acme/rules', // was: url
		audience: 'billing-api',
		issuer: 'https://policy.example.com',
		authToken: token, // was: token
		store: filePolicyStore('/var/lib/billing/policy.json'),
		// The rules pulled may name only these conditions: a remote file carries no code.
		conditions: { secondFactor: ({ claims }) => claims['aal'] === 'aal2' },
		onError: (error) => console.warn('policy pull failed', error.code),
		// No `typ`: it defaults to `limix-rules+jwt`.
	});
}
