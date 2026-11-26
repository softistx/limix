import { describe, expect, it } from 'bun:test';
import { rulesPathOf } from './index';

describe('rulesPathOf', () => {
	it('turns each {name} segment into :name', () => {
		expect(rulesPathOf('/things/{id}')).toBe('/things/:id');
		expect(rulesPathOf('/a/{aId}/b/{bId}')).toBe('/a/:aId/b/:bId');
	});

	it('leaves other paths and partial segments alone', () => {
		expect(rulesPathOf('/things')).toBe('/things');
		expect(rulesPathOf('/things/:id')).toBe('/things/:id');
		expect(rulesPathOf('/files/{name}.json')).toBe('/files/{name}.json');
		expect(rulesPathOf('/')).toBe('/');
	});
});
