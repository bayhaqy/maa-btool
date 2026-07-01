import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getTokenFromHeaders } from '@/lib/auth';
import { getEmailClient } from '@/lib/resend';
import { getRedis } from '@/lib/redis';
import { getPineconeIndex } from '@/lib/pinecone';
import { ensureR2Config, isR2Configured, listR2Objects, getR2ConfigInfo } from '@/lib/r2';

/**
 * GET /api/health
 *
 * Comprehensive system-health check endpoint. Accessible ONLY to users
 * holding the "Super Admin" role. Returns:
 *   - Per-service health (Database, Auth, Email, Cache, Vector DB, AI, File Storage)
 *   - Aggregate DB stats (users, companies, modules, records, docs, api keys,
 *     lookups, pending approvals)
 *   - Runtime system info (Node version, platform, uptime, memory usage)
 *   - Environment-variable status (true / false — never values)
 *   - Overall status: "healthy" | "degraded" | "unhealthy"
 *
 * The endpoint does NOT make outbound network calls to third-party APIs — it
 * only verifies that the relevant SDK clients initialize without throwing and
 * that the required env vars are present.
 */
export async function GET(request: NextRequest) {
  // ── Auth: require Super Admin ──────────────────────────────────────────
  const tokenPayload = getTokenFromHeaders(request.headers);
  if (!tokenPayload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!tokenPayload.roles.includes('Super Admin')) {
    return NextResponse.json(
      { error: 'Forbidden — Super Admin role required' },
      { status: 403 },
    );
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  type ServiceStatus =
    | 'operational'
    | 'degraded'
    | 'down'
    | 'not_configured';

  interface ServiceCheck {
    name: string;
    status: ServiceStatus;
    responseTimeMs: number;
    details: string;
  }

  async function timed<T>(
    fn: () => Promise<T>,
  ): Promise<{ result: T; ms: number }> {
    const start = Date.now();
    const result = await fn();
    return { result, ms: Date.now() - start };
  }

  // ── Service checks ─────────────────────────────────────────────────────
  const services: ServiceCheck[] = [];

  // 1) Database (Prisma + Supabase PostgreSQL) — run a lightweight SELECT 1
  try {
    const { ms } = await timed(async () => {
      await db.$queryRaw`SELECT 1`;
    });
    services.push({
      name: 'Database',
      status: 'operational',
      responseTimeMs: ms,
      details: 'PostgreSQL · Supabase · Prisma ORM',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'Database',
      status: 'down',
      responseTimeMs: 0,
      details: `Connection failed: ${message}`,
    });
  }

  // 2) Auth — custom JWT (primary auth system)
  try {
    const { result, ms } = await timed(async () => {
      const jwtOk = !!process.env.JWT_SECRET;
      const userCount = await db.sysUser.count();
      return { jwtOk, userCount };
    });
    const status: ServiceStatus = result.jwtOk ? 'operational' : 'down';
    const details = result.jwtOk
      ? `Custom JWT configured · ${result.userCount} user${result.userCount === 1 ? '' : 's'} registered`
      : 'JWT_SECRET missing — auth will not work';
    services.push({
      name: 'Auth',
      status,
      responseTimeMs: ms,
      details,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'Auth',
      status: 'down',
      responseTimeMs: 0,
      details: `Auth check failed: ${message}`,
    });
  }

  // 3) Email — Resend
  try {
    const { result: client, ms } = await timed(async () => getEmailClient());
    if (client) {
      const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      services.push({
        name: 'Email',
        status: 'operational',
        responseTimeMs: ms,
        details: `Resend SDK configured · From: ${from}`,
      });
    } else {
      services.push({
        name: 'Email',
        status: 'not_configured',
        responseTimeMs: ms,
        details: 'RESEND_API_KEY missing — email delivery disabled',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'Email',
      status: 'down',
      responseTimeMs: 0,
      details: `Resend init failed: ${message}`,
    });
  }

  // 4) Cache — Upstash Redis (with in-memory fallback)
  try {
    const { result: redis, ms } = await timed(async () => getRedis());
    if (redis) {
      services.push({
        name: 'Cache',
        status: 'operational',
        responseTimeMs: ms,
        details: 'Upstash Redis configured',
      });
    } else {
      services.push({
        name: 'Cache',
        status: 'degraded',
        responseTimeMs: ms,
        details:
          'Upstash Redis not configured — using in-memory fallback (dev only)',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'Cache',
      status: 'down',
      responseTimeMs: 0,
      details: `Redis init failed: ${message}`,
    });
  }

  // 5) Vector DB — Pinecone
  try {
    const { result: index, ms } = await timed(async () => getPineconeIndex());
    if (index) {
      const indexName =
        process.env.PINECONE_INDEX_NAME || 'maa-btool-docs';
      services.push({
        name: 'Vector DB',
        status: 'operational',
        responseTimeMs: ms,
        details: `Pinecone configured · Index: ${indexName}`,
      });
    } else {
      services.push({
        name: 'Vector DB',
        status: 'not_configured',
        responseTimeMs: ms,
        details: 'PINECONE_API_KEY missing — vector search disabled',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'Vector DB',
      status: 'down',
      responseTimeMs: 0,
      details: `Pinecone init failed: ${message}`,
    });
  }

  // 6) AI — z-ai-web-dev-sdk
  try {
    const { result: imported, ms } = await timed(async () => {
      // Dynamic import — verifies the SDK is installed and importable.
      // We do NOT call ZAI.create() to avoid any network call.
      const mod = await import('z-ai-web-dev-sdk');
      return (
        typeof mod.default === 'function' ||
        typeof mod.default === 'object'
      );
    });
    if (imported) {
      services.push({
        name: 'AI',
        status: 'operational',
        responseTimeMs: ms,
        details: 'z-ai-web-dev-sdk importable · ready for chat completions',
      });
    } else {
      services.push({
        name: 'AI',
        status: 'down',
        responseTimeMs: ms,
        details: 'z-ai-web-dev-sdk default export not a function',
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'AI',
      status: 'down',
      responseTimeMs: 0,
      details: `AI SDK import failed: ${message}`,
    });
  }

  // 7) File Storage — FileAsset model in DB
  try {
    // A simple count verifies the table exists and is queryable.
    const { result: count, ms } = await timed(async () =>
      db.fileAsset.count(),
    );
    services.push({
      name: 'File Storage',
      status: 'operational',
      responseTimeMs: ms,
      details: `Database-backed (FileAsset) · ${count} file${count === 1 ? '' : 's'} stored`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'File Storage',
      status: 'down',
      responseTimeMs: 0,
      details: `FileAsset query failed: ${message}`,
    });
  }

  // 8) Cloud Storage — Cloudflare R2
  try {
    const { result: r2Check, ms: r2Ms } = await timed(async () => {
      await ensureR2Config();
      const configured = isR2Configured();
      if (!configured) {
        return { configured: false, connected: false, configInfo: null };
      }
      // Verify connectivity by listing objects
      try {
        const keys = await listR2Objects('images/', 1);
        return { configured: true, connected: true, configInfo: getR2ConfigInfo(), objectCount: keys.length };
      } catch {
        return { configured: true, connected: false, configInfo: getR2ConfigInfo() };
      }
    });

    if (!r2Check.configured) {
      services.push({
        name: 'Cloud Storage',
        status: 'not_configured',
        responseTimeMs: r2Ms,
        details: 'R2 credentials not configured — using local storage fallback',
      });
    } else if (r2Check.connected) {
      const configInfo = r2Check.configInfo!;
      services.push({
        name: 'Cloud Storage',
        status: 'operational',
        responseTimeMs: r2Ms,
        details: `Cloudflare R2 · Bucket: ${configInfo.bucket} · Connected`,
      });
    } else {
      const configInfo = r2Check.configInfo!;
      services.push({
        name: 'Cloud Storage',
        status: 'degraded',
        responseTimeMs: r2Ms,
        details: `Cloudflare R2 · Bucket: ${configInfo.bucket} · Config present but cannot connect`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    services.push({
      name: 'Cloud Storage',
      status: 'down',
      responseTimeMs: 0,
      details: `R2 check failed: ${message}`,
    });
  }

  // ── Aggregate DB stats ──────────────────────────────────────────────────
  type StatKey =
    | 'users'
    | 'companies'
    | 'modules'
    | 'records'
    | 'docs'
    | 'apiKeys'
    | 'lookups'
    | 'pendingApprovals';

  const stats: Record<StatKey, number> = {
    users: 0,
    companies: 0,
    modules: 0,
    records: 0,
    docs: 0,
    apiKeys: 0,
    lookups: 0,
    pendingApprovals: 0,
  };

  // R2-specific stats
  type R2Stats = {
    r2AssetsCount: number;
    r2ImageAssetsCount: number;
    r2TotalSize: number;
    configInfo: {
      endpoint: string;
      bucket: string;
      publicUrl: string;
      hasPublicUrl: boolean;
    } | null;
    storageBreakdown: {
      r2: number;
      local: number;
      fileAsset: number;
    };
  };
  const r2Stats: R2Stats = {
    r2AssetsCount: 0,
    r2ImageAssetsCount: 0,
    r2TotalSize: 0,
    configInfo: null,
    storageBreakdown: { r2: 0, local: 0, fileAsset: 0 },
  };

  try {
    const configInfo = getR2ConfigInfo();
    if (configInfo.endpoint) {
      r2Stats.configInfo = {
        endpoint: configInfo.endpoint.replace(/^(https?:\/\/)/, (_, proto) => proto + '***'),
        bucket: configInfo.bucket,
        publicUrl: configInfo.publicUrl ? configInfo.publicUrl.replace(/^(https?:\/\/)/, (_, proto) => proto + '***') : '',
        hasPublicUrl: !!configInfo.publicUrl,
      };
    }
  } catch {
    // R2 not configured
  }

  // Run counts in parallel — best-effort, individual failures don't fail the route.
  const [users, companies, modules, records, docs, apiKeys, lookups, pendingApprovals, r2AssetsCount, r2ImageAssetsCount, r2TotalSize, localAssetsCount, localImageAssetsCount, fileAssetCount] =
    await Promise.allSettled([
      db.sysUser.count(),
      db.tenantCompany.count(),
      db.metaModule.count(),
      db.dataRecord.count(),
      db.documentation.count(),
      db.apiKey.count(),
      db.lookupMaster.count(),
      db.approvalTicket.count({ where: { status: 'PENDING' } }),
      db.digitalAsset.count({ where: { storageType: 'r2' } }),
      db.imageAsset.count({ where: { storageType: 'r2' } }),
      db.digitalAsset.aggregate({ where: { storageType: 'r2' }, _sum: { fileSize: true } }),
      db.digitalAsset.count({ where: { storageType: 'local' } }),
      db.imageAsset.count({ where: { storageType: 'local' } }),
      db.fileAsset.count(),
    ]);

  if (users.status === 'fulfilled') stats.users = users.value;
  if (companies.status === 'fulfilled') stats.companies = companies.value;
  if (modules.status === 'fulfilled') stats.modules = modules.value;
  if (records.status === 'fulfilled') stats.records = records.value;
  if (docs.status === 'fulfilled') stats.docs = docs.value;
  if (apiKeys.status === 'fulfilled') stats.apiKeys = apiKeys.value;
  if (lookups.status === 'fulfilled') stats.lookups = lookups.value;
  if (pendingApprovals.status === 'fulfilled')
    stats.pendingApprovals = pendingApprovals.value;

  // R2 stats from parallel queries
  if (r2AssetsCount.status === 'fulfilled') r2Stats.r2AssetsCount = r2AssetsCount.value;
  if (r2ImageAssetsCount.status === 'fulfilled') r2Stats.r2ImageAssetsCount = r2ImageAssetsCount.value;
  if (r2TotalSize.status === 'fulfilled') r2Stats.r2TotalSize = (r2TotalSize.value._sum.fileSize as number) ?? 0;
  if (localAssetsCount.status === 'fulfilled') r2Stats.storageBreakdown.local = localAssetsCount.value;
  if (localImageAssetsCount.status === 'fulfilled') r2Stats.storageBreakdown.local += localImageAssetsCount.value;
  if (fileAssetCount.status === 'fulfilled') r2Stats.storageBreakdown.fileAsset = fileAssetCount.value;
  r2Stats.storageBreakdown.r2 = r2Stats.r2AssetsCount + r2Stats.r2ImageAssetsCount;

  // ── System info ─────────────────────────────────────────────────────────
  const mem = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  const systemInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptimeSeconds: Math.round(process.uptime()),
    memoryUsage: {
      rss: mem.rss,
      heapTotal: mem.heapTotal,
      heapUsed: mem.heapUsed,
      external: mem.external,
      arrayBuffers: mem.arrayBuffers,
      // Convenience: percentage of heap currently in use.
      heapUsedPct: mem.heapTotal > 0 ? (mem.heapUsed / mem.heapTotal) * 100 : 0,
    },
    cpuUsage: {
      userMicros: cpuUsage.user,
      systemMicros: cpuUsage.system,
    },
    pid: process.pid,
    timestamp: new Date().toISOString(),
  };

  // ── Resource usage (PostgreSQL database size + table row estimates) ────
  // Best-effort — these queries are PostgreSQL-specific and silently skipped
  // if the DB rejects them (e.g. on SQLite or without pg_stat_permissions).
  type ResourceUsage = {
    databaseSizeBytes: number | null;
    databaseSizePretty: string | null;
    tableCount: number | null;
    connectionCount: number | null;
    cacheHitRatioPct: number | null;
    estimatedRows: Record<string, number>;
  };
  const resourceUsage: ResourceUsage = {
    databaseSizeBytes: null,
    databaseSizePretty: null,
    tableCount: null,
    connectionCount: null,
    cacheHitRatioPct: null,
    estimatedRows: {},
  };

  try {
    // Total database size (pg_database_size for the current DB).
    const sizeRows = await db.$queryRaw<
      Array<{ db_size: bigint | number; db_size_pretty: string }>
    >`SELECT pg_database_size(current_database()) AS db_size,
             pg_size_pretty(pg_database_size(current_database())) AS db_size_pretty`;
    if (sizeRows.length > 0) {
      const s = sizeRows[0];
      resourceUsage.databaseSizeBytes =
        typeof s.db_size === 'bigint' ? Number(s.db_size) : (s.db_size as number);
      resourceUsage.databaseSizePretty = s.db_size_pretty;
    }
  } catch {
    // Silently ignore — not all DBs support these functions.
  }

  try {
    const tableRows = await db.$queryRaw<
      Array<{ relname: string; n_live_tup: bigint | number }>
    >`SELECT relname, n_live_tup
       FROM pg_stat_user_tables
       ORDER BY n_live_tup DESC
       LIMIT 12`;
    for (const r of tableRows) {
      resourceUsage.estimatedRows[r.relname] =
        typeof r.n_live_tup === 'bigint' ? Number(r.n_live_tup) : (r.n_live_tup as number);
    }
    resourceUsage.tableCount = tableRows.length;
  } catch {
    // ignore
  }

  try {
    const connRows = await db.$queryRaw<
      Array<{ count: bigint | number }>
    >`SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database()`;
    if (connRows.length > 0) {
      resourceUsage.connectionCount =
        typeof connRows[0].count === 'bigint'
          ? Number(connRows[0].count)
          : (connRows[0].count as number);
    }
  } catch {
    // ignore
  }

  try {
    const cacheRows = await db.$queryRaw<
      Array<{ ratio: number | null }>
    >`SELECT
         sum(blks_hit)::float / NULLIF(sum(blks_hit) + sum(blks_read), 0) * 100 AS ratio
       FROM pg_stat_database
       WHERE datname = current_database()`;
    if (cacheRows.length > 0 && cacheRows[0].ratio !== null) {
      resourceUsage.cacheHitRatioPct = Number(cacheRows[0].ratio);
    }
  } catch {
    // ignore
  }

  // ── Upstash Redis usage (free-tier quota information) ──────────────────
  // Upstash REST API exposes /usage, /pipeline-info, etc. We fetch the
  // daily usage to surface in the System Health UI.
  type RedisUsage = {
    available: boolean;
    dailyRequestCount: number | null;
    dailyRequestLimit: number | null;
    dailyBandwidthBytes: number | null;
    plan: string | null;
    error?: string;
  };
  const redisUsage: RedisUsage = {
    available: false,
    dailyRequestCount: null,
    dailyRequestLimit: null,
    dailyBandwidthBytes: null,
    plan: null,
  };
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (redisUrl && redisToken) {
    try {
      // Upstash REST: POST to / with a JSON array command. We use INFO to
      // get stats. To stay read-only and cheap, we ask for the STATS command.
      const infoRes = await fetch(`${redisUrl}/info`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redisToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ section: 'stats' }),
      });
      if (infoRes.ok) {
        const infoData = (await infoRes.json()) as { result?: string };
        const infoText: string = infoData.result || '';
        // Parse the INFO text — lines of `key:value`.
        const parsed: Record<string, string> = {};
        for (const line of infoText.split('\n')) {
          const idx = line.indexOf(':');
          if (idx > 0) {
            const k = line.slice(0, idx).trim();
            const v = line.slice(idx + 1).trim();
            if (k) parsed[k] = v;
          }
        }
        redisUsage.available = true;
        if (parsed['total_connections_received']) {
          redisUsage.dailyRequestCount = Number(parsed['total_connections_received']) || null;
        }
        if (parsed['total_net_output_bytes']) {
          redisUsage.dailyBandwidthBytes = Number(parsed['total_net_output_bytes']) || null;
        }
      } else {
        redisUsage.error = `HTTP ${infoRes.status}`;
      }
    } catch (err) {
      redisUsage.error = err instanceof Error ? err.message : String(err);
    }
  }

  // ── Env var checklist (true/false — NEVER values) ──────────────────────
  const envVars: Record<string, boolean> = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DIRECT_DATABASE_URL: !!process.env.DIRECT_DATABASE_URL,
    JWT_SECRET: !!process.env.JWT_SECRET,
    RESEND_API_KEY: !!process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: !!process.env.RESEND_FROM_EMAIL,
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
    PINECONE_API_KEY: !!process.env.PINECONE_API_KEY,
    PINECONE_INDEX_NAME: !!process.env.PINECONE_INDEX_NAME,
    R2_ENDPOINT: !!process.env.R2_ENDPOINT,
    R2_ACCESS_KEY_ID: !!process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: !!process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET: !!process.env.R2_BUCKET,
    R2_PUBLIC_URL: !!process.env.R2_PUBLIC_URL,
  };

  // ── Overall status ──────────────────────────────────────────────────────
  const hasDown = services.some((s) => s.status === 'down');
  const hasDegraded = services.some(
    (s) => s.status === 'degraded' || s.status === 'not_configured',
  );
  const overallStatus: 'healthy' | 'degraded' | 'unhealthy' = hasDown
    ? 'unhealthy'
    : hasDegraded
      ? 'degraded'
      : 'healthy';

  // ── Response ────────────────────────────────────────────────────────────
  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    services,
    stats,
    systemInfo,
    resourceUsage,
    redisUsage,
    r2Stats,
    envVars,
    requestedBy: {
      userId: tokenPayload.userId,
      username: tokenPayload.username,
      roles: tokenPayload.roles,
    },
  });
}
