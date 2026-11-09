import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import fontkit from 'npm:@pdf-lib/fontkit@1.1.1';
import { degrees, PDFDocument, rgb } from 'npm:pdf-lib@1.17.1';

const BUCKET = 'work-files';
const MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_FONT_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.6.205/standard_fonts/LiberationSans-Regular.ttf';
let fontBytesPromise: Promise<Uint8Array> | undefined;
let signingKeyPromise: Promise<CryptoKey> | undefined;

type OpenContext = {
  session_id: string;
  work_id: string;
  opened_at: string;
  open_token: string;
};

type OpenTokenPayload = {
  version: 1;
  sessionId: string;
  workId: string;
  openedAt: string;
};

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const getAllowedOrigin = (request: Request) => {
  const requestOrigin = request.headers.get('origin') || '';
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) return '*';
  return configuredOrigins.includes(requestOrigin) ? requestOrigin : configuredOrigins[0];
};

const corsHeaders = (request: Request) => ({
  'Access-Control-Allow-Origin': getAllowedOrigin(request),
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Expose-Headers': [
    'Content-Disposition',
    'X-Guest-Access-Id',
    'X-Guest-Open-Token',
    'X-Guest-Session-Id',
    'X-Opened-At',
    'X-Generated-At',
  ].join(', '),
  Vary: 'Origin',
});

const jsonError = (request: Request, status: number, message: string) => new Response(
  JSON.stringify({ error: message }),
  {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  },
);

const clientIp = (request: Request) => {
  const candidate = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || '';
  const value = candidate.trim().replace(/^\[|\]$/g, '');

  // PostgreSQL INET performs the authoritative validation. This preliminary
  // check rejects header injection and values containing ports.
  return value && /^[0-9a-f:.]+$/i.test(value) ? value : null;
};

const limitHeader = (value: string | null, maxLength: number) => value?.slice(0, maxLength) || null;

const textEncoder = new TextEncoder();

const toBase64Url = (value: Uint8Array) => {
  let binary = '';
  value.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const getSigningKey = () => {
  signingKeyPromise ||= crypto.subtle.importKey(
    'raw',
    textEncoder.encode(Deno.env.get('GUEST_WATERMARK_SECRET') || serviceRoleKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return signingKeyPromise;
};

const createOpenToken = async (payload: OpenTokenPayload) => {
  const encodedPayload = toBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    'HMAC',
    await getSigningKey(),
    textEncoder.encode(encodedPayload),
  );
  return `${encodedPayload}.${toBase64Url(new Uint8Array(signature))}`;
};

const verifyOpenToken = async (token: string, expectedWorkId: string) => {
  const [encodedPayload, encodedSignature, extraPart] = token.split('.');
  if (!encodedPayload || !encodedSignature || extraPart) throw new Error('Invalid guest preview token');

  const valid = await crypto.subtle.verify(
    'HMAC',
    await getSigningKey(),
    fromBase64Url(encodedSignature),
    textEncoder.encode(encodedPayload),
  );
  if (!valid) throw new Error('Invalid guest preview token');

  const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(encodedPayload))) as OpenTokenPayload;
  const openedAt = new Date(payload.openedAt);
  const tokenAge = Date.now() - openedAt.getTime();
  if (
    payload.version !== 1
    || payload.workId !== expectedWorkId
    || !UUID_PATTERN.test(payload.sessionId)
    || !Number.isFinite(openedAt.getTime())
    || tokenAge < -60_000
    || tokenAge > 24 * 60 * 60 * 1000
  ) {
    throw new Error('Guest preview token has expired');
  }

  return payload;
};

const resolveStoragePath = (storedValue: string) => {
  if (!storedValue) throw new Error('The work version has no storage path');

  if (!/^https?:\/\//i.test(storedValue)) {
    return storedValue.replace(/^\/+/, '').replace(/^work-files\//, '');
  }

  const url = new URL(storedValue);
  const markers = [
    `/storage/v1/object/public/${BUCKET}/`,
    `/storage/v1/object/sign/${BUCKET}/`,
    `/storage/v1/object/authenticated/${BUCKET}/`,
  ];
  const marker = markers.find((candidate) => url.pathname.includes(candidate));
  if (!marker) throw new Error('Unsupported Storage URL');

  return decodeURIComponent(url.pathname.split(marker)[1]);
};

const safeFileName = (value: string) => {
  const baseName = value.replace(/\.pdf$/i, '') || 'student-work';
  return `${baseName.replace(/[^a-zA-Z0-9._-]+/g, '_')}_protected.pdf`;
};

const encodedDisposition = (fileName: string, attachment: boolean) => {
  const fallback = safeFileName(fileName);
  const utf8Name = `${fileName.replace(/\.pdf$/i, '') || 'student-work'}_protected.pdf`;
  const encodedName = encodeURIComponent(utf8Name).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
  return `${attachment ? 'attachment' : 'inline'}; filename="${fallback}"; filename*=UTF-8''${encodedName}`;
};

const formatTimestamp = (value: string) => new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZoneName: 'short',
}).format(new Date(value));

const getFontBytes = () => {
  fontBytesPromise ||= (async () => {
    const response = await fetch(Deno.env.get('WATERMARK_FONT_URL') || DEFAULT_FONT_URL);
    if (!response.ok) throw new Error(`Unable to load watermark font (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  })();
  return fontBytesPromise;
};

const createWatermarkedPdf = async (
  sourceBytes: Uint8Array,
  sessionId: string,
  openedAt: string,
  generatedAt: string,
  isDownload: boolean,
) => {
  const pdf = await PDFDocument.load(sourceBytes);
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(await getFontBytes(), { subset: true });
  const visibleSessionId = sessionId.replace(/-/g, '').slice(0, 12).toUpperCase();

  const lines = [
    'Робота студента ЦДУ ім. В. Винниченка',
    `Сесія: ${visibleSessionId} · Відкрито: ${formatTimestamp(openedAt)}`,
    `${isDownload ? 'Завантажено' : 'Перегляд'}: ${formatTimestamp(generatedAt)}`,
  ];

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(7.5, Math.min(9.5, width / 72));
    const lineHeight = fontSize + 2.5;
    let row = 0;

    // Dense staggered diagonal pattern, matching the former GUEST VIEW layout.
    for (let y = -35; y < height + 100; y += 112) {
      const firstX = row % 2 === 0 ? -105 : -245;
      for (let x = firstX; x < width + 220; x += 285) {
        lines.forEach((line, index) => {
          page.drawText(line, {
            x,
            y: y - index * lineHeight,
            size: fontSize,
            font,
            color: rgb(0.27, 0.22, 0.82),
            opacity: 0.24,
            rotate: degrees(18),
          });
        });
      }
      row += 1;
    }
  }

  pdf.setSubject('Захищена гостьова копія студентської роботи');
  pdf.setKeywords(['ЦДУ ім. В. Винниченка', 'guest copy', sessionId]);
  pdf.setModificationDate(new Date(generatedAt));
  return pdf.save({ useObjectStreams: true });
};

const getPublishedVersion = async (workId: string) => {
  const { data: work, error: workError } = await admin
    .from('qualification_works')
    .select('id, title, status')
    .eq('id', workId)
    .eq('status', 'defense_completed')
    .maybeSingle();

  if (workError) throw workError;
  if (!work) return null;

  const { data: version, error: versionError } = await admin
    .from('work_versions')
    .select('id, file_name, file_url')
    .eq('work_id', workId)
    .order('version_number', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) throw versionError;
  return version ? { work, version } : null;
};

const getOrCreateSessionId = (candidate: string | null) => {
  return candidate && UUID_PATTERN.test(candidate) ? candidate : crypto.randomUUID();
};

const createOpenContext = async (workId: string, requestedSessionId: string | null): Promise<OpenContext> => {
  const sessionId = getOrCreateSessionId(requestedSessionId);
  const openedAt = new Date().toISOString();
  const openToken = await createOpenToken({
    version: 1,
    sessionId,
    workId,
    openedAt,
  });

  return {
    session_id: sessionId,
    work_id: workId,
    opened_at: openedAt,
    open_token: openToken,
  };
};

const getDownloadContext = async (
  openToken: string,
  workId: string,
): Promise<OpenContext> => {
  const payload = await verifyOpenToken(openToken, workId);
  return {
    session_id: payload.sessionId,
    work_id: payload.workId,
    opened_at: payload.openedAt,
    open_token: openToken,
  };
};

const logDownload = async (
  request: Request,
  context: OpenContext,
  downloadedAt: string,
) => {
  const { data, error } = await admin
    .from('guest_file_access')
    .insert({
      session_id: context.session_id,
      work_id: context.work_id,
      opened_at: context.opened_at,
      first_downloaded_at: downloadedAt,
      last_downloaded_at: downloadedAt,
      download_count: 1,
      open_ip: null,
      download_ip: clientIp(request),
      user_agent: limitHeader(request.headers.get('user-agent'), 1000),
      referrer: limitHeader(request.headers.get('referer'), 2000),
    })
    .select('id')
    .single();

  if (error) throw error;
  return data.id as string;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'GET') return jsonError(request, 405, 'Method not allowed');

  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  const workId = url.searchParams.get('work_id') || '';
  const requestedSessionId = url.searchParams.get('session_id');
  const requestedOpenToken = url.searchParams.get('open_token') || '';

  if (action !== 'open' && action !== 'download') {
    return jsonError(request, 400, 'Action must be open or download');
  }
  if (!UUID_PATTERN.test(workId)) return jsonError(request, 400, 'Invalid work id');

  try {
    const published = await getPublishedVersion(workId);
    if (!published) return jsonError(request, 404, 'Published work file was not found');

    let context: OpenContext;
    if (action === 'open') {
      context = await createOpenContext(workId, requestedSessionId);
    } else {
      if (!requestedOpenToken) return jsonError(request, 400, 'A valid preview token is required');
      context = await getDownloadContext(requestedOpenToken, workId);
    }

    const path = resolveStoragePath(published.version.file_url);
    const { data: source, error: storageError } = await admin.storage.from(BUCKET).download(path);
    if (storageError || !source) throw storageError || new Error('Unable to read source PDF');
    if (source.size > MAX_SOURCE_BYTES) {
      return jsonError(request, 413, 'The PDF is too large for protected guest delivery');
    }

    const generatedAt = new Date().toISOString();
    const output = await createWatermarkedPdf(
      new Uint8Array(await source.arrayBuffer()),
      context.session_id,
      context.opened_at,
      generatedAt,
      action === 'download',
    );
    const downloadId = action === 'download'
      ? await logDownload(request, context, generatedAt)
      : null;

    const responseHeaders: Record<string, string> = {
      ...corsHeaders(request),
      'Content-Type': 'application/pdf',
      'Content-Disposition': encodedDisposition(
        `student_work_${published.work.id.slice(0, 8)}.pdf`,
        action === 'download',
      ),
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Content-Type-Options': 'nosniff',
      'X-Guest-Open-Token': context.open_token,
      'X-Guest-Session-Id': context.session_id,
      'X-Opened-At': context.opened_at,
      'X-Generated-At': generatedAt,
    };
    if (downloadId) responseHeaders['X-Guest-Access-Id'] = downloadId;

    return new Response(new Blob([output], { type: 'application/pdf' }), {
      status: 200,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('guest-files error', error);
    const isTokenError = error instanceof Error && error.message.toLowerCase().includes('preview token');
    const message = isTokenError ? error.message : 'Unable to prepare the protected PDF';
    return jsonError(request, isTokenError ? 401 : 500, message);
  }
});

