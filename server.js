/**
 * 로컬 개발 서버 (정적 파일 서빙 + AI 프록시)
 * 실행: node server.js
 * 접속: http://localhost:3000
 */
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

const PORT = process.env.PORT || 3000;

// .env 파일에서 API 키 로드
function loadEnv() {
  try {
    const lines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n');
    for (const line of lines) {
      const [k, ...v] = line.trim().split('=');
      if (k && v.length) process.env[k] = v.join('=');
    }
  } catch {}
}
loadEnv();

function proxyToAI(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: '잘못된 요청입니다.' }));
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'GROQ_API_KEY가 설정되지 않았습니다.' }));
    }

    // Groq는 OpenAI 호환 포맷 그대로 사용
    const groqBody = JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      messages:    parsed.messages,
      temperature: 1.0,
      response_format: { type: 'json_object' },
    });

    const groqPayload = Buffer.from(groqBody);
    const options = {
      hostname: 'api.groq.com',
      port: 443,
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': groqPayload.length,
      },
      rejectUnauthorized: false,
    };

    const proxy = https.request(options, aiRes => {
      const chunks = [];
      aiRes.on('data', chunk => { chunks.push(chunk); });
      aiRes.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf8');
        try {
          const json = JSON.parse(data);
          if (json.error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ error: json.error.message || 'AI 오류' }));
          }
          const text = json.choices?.[0]?.message?.content;
          if (!text) throw new Error('응답 없음');
          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(text);
        } catch {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '응답을 파싱할 수 없습니다.' }));
        }
      });
    });

    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'AI 서버에 연결할 수 없습니다.' }));
    });

    proxy.write(groqPayload);
    proxy.end();
  });
}

http.createServer((req, res) => {
  // AI 프록시 엔드포인트
  if (req.url === '/api/generate' && req.method === 'OPTIONS') {
    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' });
    return res.end();
  }
  if (req.url === '/api/generate' && req.method === 'POST') {
    return proxyToAI(req, res);
  }

  // 정적 파일 서빙
  let urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const filePath = path.join(__dirname, urlPath);
  const ext      = path.extname(filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\n✅ Kbank 네이밍 생성기 실행 중`);
  console.log(`   → http://localhost:${PORT}\n`);
});
