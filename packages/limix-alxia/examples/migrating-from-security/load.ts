import { compilePolicy } from '@softistx/limix';
import { loadRules } from '@softistx/limix/bun';

export async function loadPolicy() {
	return compilePolicy(
		await loadRules(process.env['RULES_FILE'] ?? 'rules.yaml'),
		{
			conditions: { secondFactor: ({ claims }) => claims['aal'] === 'aal2' },
		},
	);
}
