/** An input the generator refuses: a bad OpenAPI document, a missing peer, a wrong plugin config. */
export class CodegenError extends Error {
	override readonly name = 'CodegenError';
}
