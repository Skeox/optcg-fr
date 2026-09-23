// Comparaison des empreintes perceptuelles (chaînes hexadécimales) ; leur calcul est dans vision.ts.

const POP = new Uint8Array(256);
for (let i = 0; i < 256; i++) POP[i] = (i & 1) + POP[i >> 1];

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const cache = new Map<string, Uint8Array>();
export function bytesOf(hex: string): Uint8Array {
  let b = cache.get(hex);
  if (!b) {
    b = hexToBytes(hex);
    // Les empreintes vidéo changent à chaque image : borner le cache d'une session longue.
    if (cache.size >= 8192) cache.clear();
    cache.set(hex, b);
  }
  return b;
}

export function hamming(a: string, b: string): number {
  const x = bytesOf(a), y = bytesOf(b);
  let d = 0;
  for (let i = 0; i < x.length; i++) d += POP[x[i] ^ y[i]];
  return d;
}
