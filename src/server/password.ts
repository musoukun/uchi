// Node.js ビルトインの scrypt を使ったパスワードハッシュ。
// - ネイティブビルド不要 (Docker node:20-slim でゼロ追加依存)
// - OWASP Password Storage Cheat Sheet で承認済みアルゴリズム
// - 形式: scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
//   将来パラメータを上げたいときに前方互換でハッシュを判別できる
import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number
) => Promise<Buffer>;

// OWASP 推奨パラメータ (2025): N=2^17, r=8, p=1, dkLen=64, salt 16 byte
const N = 1 << 17;
const R = 8;
const P = 1;
const KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN);
  return `scrypt$${N}$${R}$${P}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, , , , saltHex, hashHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password.normalize('NFKC'), salt, expected.length);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
