import { MAX_BODY_BYTES } from './defaults';
import { RemotePolicyError } from './errors';

const tooLarge = (what: string) =>
	new RemotePolicyError(
		'TOO_LARGE',
		`${what} is larger than ${MAX_BODY_BYTES} bytes`,
	);

/** The body as text, refused beyond `MAX_BODY_BYTES` before it is all read. */
export async function readCapped(
	response: Response,
	what: string,
): Promise<string> {
	const declared = Number(response.headers.get('content-length'));
	if (declared > MAX_BODY_BYTES) throw tooLarge(what);
	if (!response.body) return response.text();
	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let size = 0;
	let text = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		size += value.byteLength;
		if (size > MAX_BODY_BYTES) {
			void reader.cancel().catch(() => {});
			throw tooLarge(what);
		}
		text += decoder.decode(value, { stream: true });
	}
}
