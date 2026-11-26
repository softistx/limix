import { expect, test } from 'bun:test';
import { LIMIX_FORMAT_VERSION } from './index';

test('the rules format starts at version 1', () => {
	expect(LIMIX_FORMAT_VERSION).toBe(1);
});
