import dns from 'node:dns';
import net from 'node:net';
import pg from 'pg';
import { HttpError } from './http.js';

/**
 * Some ISP/router DNS servers refuse to resolve Neon hostnames (getaddrinfo ENOTFOUND), even though
 * the database itself is reachable. When the system resolver fails, ask public DNS instead.
 * Only the address lookup changes: the socket still connects by hostname, so TLS SNI and the
 * verify-full certificate check run against the real Neon hostname.
 */
const FALLBACK_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];
const FALLBACK_ON = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL', 'EREFUSED', 'ESERVFAIL']);
const publicResolver = new dns.promises.Resolver();
publicResolver.setServers(FALLBACK_DNS_SERVERS);
let loggedFallback = false;

async function resolveWithPublicDns(hostname: string): Promise<{ address: string; family: 4 | 6 }[]> {
  const v4 = await publicResolver.resolve4(hostname).catch(() => [] as string[]);
  if (v4.length) return v4.map((address) => ({ address, family: 4 as const }));
  const v6 = await publicResolver.resolve6(hostname);
  return v6.map((address) => ({ address, family: 6 as const }));
}

/** dns.lookup-compatible: system resolver first, public DNS if it can't resolve the name. */
const lookupWithFallback = ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
  dns.lookup(hostname, options, (err, address, family) => {
    if (!err || !FALLBACK_ON.has(err.code ?? '')) return callback(err, address, family);
    resolveWithPublicDns(hostname).then(
      (records) => {
        if (!records.length) return callback(err);
        if (!loggedFallback) {
          loggedFallback = true;
          console.warn(
            `[db] System DNS could not resolve ${hostname} (${err.code}); using public DNS (${FALLBACK_DNS_SERVERS.join(', ')}).`,
          );
        }
        if (options.all) return callback(null, records);
        callback(null, records[0].address, records[0].family);
      },
      () => callback(err),
    );
  });
}) as unknown as net.LookupFunction;

/** pg calls socket.connect(port, host); route that through the fallback lookup. */
function socketWithDnsFallback(): net.Socket {
  const socket = new net.Socket();
  const connect = socket.connect.bind(socket) as (options: net.TcpSocketConnectOpts) => net.Socket;
  socket.connect = ((port: number, host: string) =>
    connect({ port, host, lookup: lookupWithFallback })) as unknown as typeof socket.connect;
  return socket;
}

/**
 * Neon connection strings use sslmode=require. Pin it to verify-full (full certificate +
 * hostname check), which is pg's current behavior and stays secure after pg v9 changes it.
 */
const connectionString = process.env.DATABASE_URL?.trim().replace(
  /sslmode=(require|prefer|verify-ca)\b/,
  'sslmode=verify-full',
);

/** Shared connection pool. Null when DATABASE_URL is not set. */
export const pool = connectionString
  ? new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 30_000, stream: socketWithDnsFallback })
  : null;

pool?.on('error', (err) => {
  // Neon closes idle connections; log and let the pool reconnect.
  console.error('[db] idle client error:', err.message);
});

export function getDb(): pg.Pool {
  if (!pool) {
    throw new HttpError(503, 'Database is not configured. Set DATABASE_URL in .env.');
  }
  return pool;
}

/** pgvector accepts vectors as a "[1,2,3]" string literal. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}
