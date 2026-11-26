import { describe, expect, it } from 'bun:test';
import { boot, memoryStore, settled } from './harness.fixtures';
import { createPublisher, URL_JWKS } from './publisher.fixtures';

const gate = () => {
	let open!: () => void;
	const opened = new Promise<void>((resolve) => {
		open = resolve;
	});
	return { open, opened };
};

describe('stop() while a start-up step is pending', () => {
	it('during the store read: nothing is held or notified', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const saved = memoryStore();
		await settled(boot(publisher, { store: saved }).policy);
		const { open, opened } = gate();
		const slow = {
			read: async () => {
				await opened;
				return saved.value;
			},
			write: async () => {},
		};
		const { policy, changes } = boot(publisher, { store: slow });
		policy.stop();
		open();
		await Bun.sleep(30);
		expect(policy.current()).toBeNull();
		expect(changes).toEqual([]);
	});

	it('during the key load: a forged restored copy is neither dropped nor reported', async () => {
		const real = await createPublisher();
		const attacker = await createPublisher();
		await attacker.publish(999999, '/evil');
		real.state.down = true;
		const store = memoryStore({
			jws: attacker.state.body,
			jwks: attacker.jwks,
		});
		const { open, opened } = gate();
		const { policy, codes } = boot(real, {
			store,
			fetch: (async (url: string, init?: RequestInit) => {
				if (url === URL_JWKS) await opened;
				return real.fetch(url, init);
			}) as typeof fetch,
		});
		const heard: unknown[] = [];
		await policy.ready;
		policy.subscribe((next) => heard.push(next));
		policy.stop();
		open();
		await Bun.sleep(30);
		expect(heard).toEqual([]);
		expect(codes()).toEqual([]);
	});
});
