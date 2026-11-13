/**
 * Creates a login for the leads dashboard (/admin), or changes the name/password of an existing one.
 *   npm run admin:create                      (asks for email, name and password; the password isn't shown)
 *   npm run admin:create -- --email a@b.com --name "Deepika"   (still asks for the password)
 */
import '../env';
import readline from 'node:readline/promises';
import { hashPassword } from '../auth';
import { getDb, pool } from '../db';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 10;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

/** Reads a line without showing what is typed (stars instead). */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      ask(question).then(resolve, reject); // piped input: nothing to hide
      return;
    }
    process.stdout.write(question);
    let value = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          process.stdout.write('\n');
          process.exit(130); // Ctrl+C
        }
        if (ch === '\u007f' || ch === '\b') {
          if (value) {
            value = value.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          value += ch;
          process.stdout.write('*');
        }
      }
    };
    stdin.on('data', onData);
  });
}

try {
  const email = (arg('email') ?? (await ask('Email: '))).toLowerCase();
  if (!EMAIL_RE.test(email)) throw new Error('That email address looks invalid.');
  const name = arg('name') ?? (await ask('Name (shown in the dashboard): '));
  if (!name) throw new Error('A name is required.');
  const password = await askHidden(`Password (at least ${MIN_PASSWORD} characters): `);
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters.`);
  const again = await askHidden('Type the password again: ');
  if (again !== password) throw new Error("The passwords don't match.");

  const { rows } = await getDb().query<{ id: string; inserted: boolean }>(
    `INSERT INTO admin_users (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
     RETURNING id, (xmax = 0) AS inserted`,
    [email, name.slice(0, 80), await hashPassword(password)],
  );
  console.log(rows[0].inserted ? `Login created for ${email}. Open /admin to sign in.` : `Login updated for ${email} (new name and password).`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await pool?.end();
}
