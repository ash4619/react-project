import express, { Request, Response } from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

type UrlRecord = {
  id: number;
  original_url: string;
  short_code: string;
  click_count: number;
  created_at: string;
};

const app = express();
const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_KEY must be set in backend/.env');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.use(cors());
app.use(express.json());

function normalizeUrl(value: unknown) {
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function createShortCode(length = 6) {
  return Array.from({ length }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

function getParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function toResponse(data: UrlRecord, isExisting?: boolean) {
  return {
    originalUrl: data.original_url,
    shortCode: data.short_code,
    shortUrl: `${PUBLIC_BASE_URL}/${data.short_code}`,
    clickCount: data.click_count ?? 0,
    createdAt: data.created_at,
    isExisting,
  };
}

async function findByCode(shortCode: string) {
  return supabase.from('urls').select('*').eq('short_code', shortCode).single<UrlRecord>();
}

async function findByOriginalUrl(originalUrl: string) {
  return supabase
    .from('urls')
    .select('*')
    .eq('original_url', originalUrl)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle<UrlRecord>();
}

async function incrementClickCount(shortCode: string, currentCount: number) {
  const rpcResult = await supabase
    .rpc('increment_click_count', { code_to_increment: shortCode })
    .maybeSingle<UrlRecord>();

  if (!rpcResult.error) {
    return rpcResult;
  }

  return supabase
    .from('urls')
    .update({ click_count: currentCount + 1 })
    .eq('short_code', shortCode)
    .select('*')
    .single<UrlRecord>();
}

async function createUniqueCode() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const shortCode = createShortCode();
    const { data, error } = await findByCode(shortCode);

    if (error?.code === 'PGRST116' || (!error && !data)) {
      return shortCode;
    }

    if (error) {
      throw error;
    }
  }

  throw new Error('Could not create a unique short code');
}

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, service: 'url-shortener' });
});

app.post('/api/shorten', async (req: Request, res: Response) => {
  const originalUrl = normalizeUrl(req.body.url);

  if (!originalUrl) {
    return res.status(400).json({ error: '올바른 URL을 입력해 주세요.' });
  }

  try {
    const { data: existingUrl, error: lookupError } = await findByOriginalUrl(originalUrl);

    if (lookupError) {
      throw lookupError;
    }

    if (existingUrl) {
      return res.json(toResponse(existingUrl, true));
    }

    const shortCode = await createUniqueCode();
    const { data, error } = await supabase
      .from('urls')
      .insert([{ original_url: originalUrl, short_code: shortCode }])
      .select('*')
      .single<UrlRecord>();

    if (error) throw error;

    return res.status(201).json(toResponse(data, false));
  } catch (error) {
    console.error('URL creation failed:', error);
    return res.status(500).json({ error: '단축 URL 생성에 실패했습니다.' });
  }
});

app.get('/api/urls/:shortCode', async (req: Request, res: Response) => {
  try {
    const { data, error } = await findByCode(getParam(req.params.shortCode));

    if (error || !data) {
      return res.status(404).json({ error: '존재하지 않는 단축 URL입니다.' });
    }

    return res.json(toResponse(data));
  } catch (error) {
    console.error('URL lookup failed:', error);
    return res.status(500).json({ error: 'URL 정보를 불러오지 못했습니다.' });
  }
});

app.get('/:shortCode', async (req: Request, res: Response) => {
  const shortCode = getParam(req.params.shortCode);

  if (shortCode === 'favicon.ico') {
    return res.status(204).send();
  }

  try {
    const { data, error } = await findByCode(shortCode);

    if (error || !data) {
      return res.status(404).send('존재하지 않는 단축 URL입니다.');
    }

    const { error: updateError } = await incrementClickCount(shortCode, data.click_count ?? 0);

    if (updateError) {
      throw updateError;
    }

    return res.redirect(302, data.original_url);
  } catch (error) {
    console.error('Redirect failed:', error);
    return res.status(500).send('서버 오류가 발생했습니다.');
  }
});

app.listen(PORT, () => {
  console.log(`URL shortener API is running at http://localhost:${PORT}`);
});
