/** Orpheus accepts at most 200 UTF-16 characters per speech request. */
export function chunkMatorSpeech(input: string, limit = 190): string[] {
  if (!Number.isInteger(limit) || limit < 20 || limit > 200) {
    throw new RangeError(
      'Speech chunk limit must be between 20 and 200 characters'
    );
  }
  let remaining = input.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  while (remaining.length > limit) {
    const window = remaining.slice(0, limit);
    const punctuation = Math.max(
      window.lastIndexOf('. '),
      window.lastIndexOf('! '),
      window.lastIndexOf('? ')
    );
    const whitespace = window.lastIndexOf(' ');
    let cut =
      punctuation >= Math.floor(limit / 2)
        ? punctuation + 1
        : whitespace >= Math.floor(limit / 2)
          ? whitespace
          : limit;
    if (
      cut > 0 &&
      cut < remaining.length &&
      /[\uD800-\uDBFF]/.test(remaining[cut - 1]!) &&
      /[\uDC00-\uDFFF]/.test(remaining[cut]!)
    )
      cut -= 1;
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}

export type MatorSpeechChunkTransport = {
  synthesize: (text: string) => Promise<Blob>;
  play: (blob: Blob) => Promise<void>;
  fallback: (remaining: string) => Promise<void> | void;
  isCancelled: () => boolean;
};

export async function playMatorSpeechChunks(
  text: string,
  transport: MatorSpeechChunkTransport,
): Promise<void> {
  const chunks = chunkMatorSpeech(text);
  for (let i = 0; i < chunks.length; i += 1) {
    if (transport.isCancelled()) return;
    try {
      const audio = await transport.synthesize(chunks[i]!);
      if (transport.isCancelled()) return;
      await transport.play(audio);
    } catch {
      if (!transport.isCancelled())
        await transport.fallback(chunks.slice(i).join(' '));
      return;
    }
  }
}
