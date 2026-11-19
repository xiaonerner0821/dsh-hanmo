/**
 * Host half of Hanmo. The Client module (client.js) does almost all the work in
 * the browser; this half adds the one thing the browser cannot do itself: edit
 * a file in the main-panel file preview and save it back.
 *
 * DSH's own `workspaceFiles` Remote namespace is read-only by design (and its
 * paged read drops the file's own line endings), so editing goes through one
 * exact Fetch route on the shared, authenticated API channel, the mechanism
 * DSH's deliverables plugin uses for its own routes:
 *
 *   GET  ROUTE?sessionId=<sid>&path=<path>[&large=1]
 *        -> 200 text/plain: the whole file, LF line breaks, no BOM;
 *           its version in the `x-dsh-version` header
 *        -> 413 { code:'large', size }  above the soft limit unless large=1
 *   POST ROUTE?sessionId=<sid>&path=<path>&version=<v>   body: the new text
 *        -> { ok, version }  |  409 { ok:false, code:'stale' }
 *
 * Size: up to SOFT_BYTES a file opens for editing directly; up to HARD_BYTES
 * (DSH's own single-file read cap) after the user confirms; beyond, refused.
 * The text travels as a raw body both ways (no JSON escaping of megabytes),
 * and a save samples only the head of the old file for its conventions.
 *
 * Safety:
 * - only owner peers reach an exact route (Connection's own fence), and a write
 *   must carry `x-dsh-edit: 1`, a header a cross-site form cannot send;
 * - the path resolves against the Session's working directory and must stay
 *   inside it, as an existing regular file (no symlink, nothing created);
 * - `version` from the GET turns the write into a compare-and-set, so a file the
 *   agent changed meanwhile is refused with 409 instead of being overwritten;
 * - the file's line-ending style and UTF-8 BOM are kept on save.
 */

const ROUTE = '/api/hanmo.edit';
const SOFT_BYTES = 4 * 1024 * 1024;
const HARD_BYTES = 32 * 1024 * 1024;
const SAMPLE_BYTES = 64 * 1024;
const BOM = '\uFEFF';

const json = (status, body) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const fail = (status, code, message, extra) => json(status, { ok: false, code, message, ...extra });
const mb = (n) => `${Math.round(n / 1024 / 1024)} MB`;

/** CRLF when most sampled line breaks are CRLF. */
function usesCrlf(sample) {
  const crlf = sample.split('\r\n').length - 1;
  const lf = sample.split('\n').length - 1 - crlf;
  return crlf > 0 && crlf >= lf;
}

async function workspaceRootOf(ctx, sessionId) {
  const live = ctx.sessions.get(sessionId);
  let header = live && live.header;
  if (!header) {
    const persistence = ctx.get('sessionPersistence');
    const stored = persistence ? await persistence.stat(sessionId).catch(() => undefined) : undefined;
    header = stored && stored.header;
  }
  return header ? header.cwd || ctx.sandboxPolicy.workspaceRoot : undefined;
}

/** The addressed workspace file, or the refusal to answer with. */
async function locate(ctx, request) {
  const query = new URL(request.url).searchParams;
  const sessionId = query.get('sessionId');
  const path = query.get('path');
  if (!sessionId || !path || path.includes('\0')) return fail(400, 'bad-request', 'sessionId and path are required');
  const workspaceRoot = await workspaceRootOf(ctx, sessionId);
  if (!workspaceRoot) return fail(404, 'session-not-found', '找不到这个会话');
  const { fs } = ctx;
  const signal = request.signal;
  const entry = await fs.lstat(path, { cwd: workspaceRoot }, signal);
  if (!entry) return fail(404, 'not-found', '文件不存在');
  if (entry.type !== 'file') return fail(422, 'not-regular-file', '只能编辑普通文件（不支持目录或符号链接）');
  const root = await fs.resolve(workspaceRoot, { signal });
  const target = await fs.resolve(path, { cwd: workspaceRoot, signal });
  if (!fs.contains(root, target)) return fail(403, 'outside-workspace', '只能编辑工作目录内的文件');
  const info = await fs.stat(target, signal);
  if (!info || info.type !== 'file') return fail(422, 'not-regular-file', '只能编辑普通文件');
  if (info.size > HARD_BYTES) return fail(413, 'too-large', `文件超过 ${mb(HARD_BYTES)}，不支持在面板里编辑`, { size: info.size });
  return { target, info, query };
}

async function handleRead(ctx, request) {
  const at = await locate(ctx, request);
  if (at instanceof Response) return at;
  if (at.info.size > SOFT_BYTES && at.query.get('large') !== '1') {
    return fail(413, 'large', `文件有 ${mb(at.info.size)}`, { size: at.info.size, soft: SOFT_BYTES });
  }
  let raw;
  try {
    raw = await ctx.fs.readText(at.target, request.signal);
  } catch (error) {
    if (error && error.code === 'FS_NOT_TEXT') return fail(422, 'not-text', '不是 UTF-8 文本文件，无法编辑');
    throw error;
  }
  if (raw.includes('\0')) return fail(422, 'not-text', '不是 UTF-8 文本文件，无法编辑');
  let text = raw.startsWith(BOM) ? raw.slice(1) : raw;
  if (text.includes('\r')) text = text.replace(/\r\n/g, '\n');
  return new Response(text, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
      'x-dsh-version': encodeURIComponent(String(at.info.version)),
    },
  });
}

async function handleWrite(ctx, request) {
  if (request.headers.get('x-dsh-edit') !== '1') return fail(403, 'header', 'missing x-dsh-edit header');
  const at = await locate(ctx, request);
  if (at instanceof Response) return at;
  const version = at.query.get('version');
  if (!version) return fail(400, 'bad-request', 'version is required');
  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > HARD_BYTES) return fail(413, 'too-large', `内容超过 ${mb(HARD_BYTES)}`);
  if (body.includes('\0')) return fail(422, 'not-text', '内容包含 NUL 字符');

  // keep the file's own conventions, judged from its head only: the editor
  // works in LF without a BOM
  const head = await ctx.fs.readByteRange(at.target, { offset: 0, length: SAMPLE_BYTES }, request.signal);
  const bom = head.length >= 3 && head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
  const crlf = usesCrlf(new TextDecoder('utf-8').decode(head));
  let content = body.startsWith(BOM) ? body.slice(1) : body;
  if (content.includes('\r')) content = content.replace(/\r\n/g, '\n');
  if (crlf) content = content.replace(/\n/g, '\r\n');
  if (bom) content = BOM + content;

  try {
    const outcome = await ctx.fs.writeText(at.target, content, { kind: 'replaceIfVersion', version }, request.signal);
    return json(200, { ok: true, version: outcome.version });
  } catch (error) {
    const code = error && error.code;
    if (code === 'FS_STALE_VERSION') return fail(409, 'stale', '文件在你编辑期间已被修改');
    if (code === 'FS_NOT_FOUND') return fail(404, 'not-found', '文件已不存在');
    throw error;
  }
}

/** Host services the edit route needs; the route lives as long as the plugin. */
export const inject = ['connection', 'fs', 'sessions', 'sandboxPolicy'];

export function apply(ctx) {
  ctx.connection.fetch.register({
    path: ROUTE,
    methods: ['GET', 'POST'],
    requestBody: 'buffered',
    fetch: (request) => (request.method === 'POST' ? handleWrite(ctx, request) : handleRead(ctx, request)).catch((error) => {
      if (request.signal.aborted) return fail(499, 'aborted', 'request aborted');
      return fail(500, (error && error.code) || 'failed', (error && error.message) || String(error));
    }),
  });
}
