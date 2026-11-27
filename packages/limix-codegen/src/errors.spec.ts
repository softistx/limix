import { expect, it } from 'bun:test';
import { CodegenError } from './errors';

it('is an Error named CodegenError', () => {
	const error = new CodegenError('boom');
	expect(error).toBeInstanceOf(Error);
	expect(error.name).toBe('CodegenError');
	expect(error.message).toBe('boom');
});
