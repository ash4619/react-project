import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

type ShortenResult = {
  originalUrl: string;
  shortCode: string;
  shortUrl: string;
  clickCount: number;
  createdAt: string;
  isExisting?: boolean;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('복사에 실패했습니다. 주소를 직접 선택해서 복사해 주세요.');
  }
}

function App() {
  const [longUrl, setLongUrl] = useState('');
  const [result, setResult] = useState<ShortenResult | null>(null);
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const createdAt = useMemo(() => {
    if (!result?.createdAt) return '';
    return new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(result.createdAt));
  }, [result]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');
    setIsCopied(false);

    if (!longUrl.trim()) {
      setMessage('단축할 URL을 입력해 주세요.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/shorten`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: longUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? '단축 URL 생성에 실패했습니다.');
      }

      setResult(data);
      setLongUrl('');
      setMessage(data.isExisting ? '이미 등록된 URL이라 기존 단축 주소를 불러왔습니다.' : '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshStats() {
    if (!result) return;

    setMessage('');

    try {
      const response = await fetch(`${API_BASE_URL}/api/urls/${result.shortCode}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? '통계를 불러오지 못했습니다.');
      }

      setResult(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '통계를 불러오지 못했습니다.');
    }
  }

  async function copyShortUrl() {
    if (!result) return;

    try {
      await copyText(result.shortUrl);
      setIsCopied(true);
      setMessage('단축 URL을 복사했습니다.');
    } catch (error) {
      setIsCopied(false);
      setMessage(error instanceof Error ? error.message : '복사에 실패했습니다.');
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <div className="intro">
          <p className="eyebrow">Supabase 기반 방문 통계 서비스</p>
          <h1>나만의 단축 URL 생성기</h1>
        </div>

        <form className="shorten-form" onSubmit={handleSubmit}>
          <label htmlFor="longUrl">단축할 URL을 입력하세요.</label>
          <div className="input-row">
            <input
              id="longUrl"
              type="text"
              placeholder="example.com/article/very-long-link"
              value={longUrl}
              onChange={(event) => setLongUrl(event.target.value)}
              autoComplete="url"
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? '생성 중' : '단축하기'}
            </button>
          </div>
          {message && <p className="form-message">{message}</p>}
        </form>

        {result && (
          <section className="result-panel" aria-label="단축 URL 결과">
            <div>
              <p className="label">단축 URL</p>
              <a className="short-link" href={result.shortUrl} target="_blank" rel="noreferrer">
                {result.shortUrl}
              </a>
            </div>

            <div className="actions">
              <button type="button" className="secondary" onClick={copyShortUrl}>
                {isCopied ? '복사됨' : '복사'}
              </button>
              <button type="button" className="secondary" onClick={refreshStats}>
                통계 새로고침
              </button>
            </div>

            <dl className="stats-grid">
              <div>
                <dt>클릭 수</dt>
                <dd>{result.clickCount.toLocaleString('ko-KR')}</dd>
              </div>
              <div>
                <dt>단축 코드</dt>
                <dd>{result.shortCode}</dd>
              </div>
              <div>
                <dt>생성 일시</dt>
                <dd>{createdAt}</dd>
              </div>
            </dl>

            <div className="original-url">
              <p className="label">원본 URL</p>
              <span>{result.originalUrl}</span>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

export default App;
