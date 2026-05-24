// @ts-check

const root = new URL('../dist/', import.meta.url);
const port = Number(process.env.PORT || 8000);
/** @type {Record<string, string>} */
const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (pathname.includes('..')) return new Response('Not found', { status: 404 });

    const file = Bun.file(new URL(`.${pathname}`, root));
    if (!(await file.exists())) return new Response('Not found', { status: 404 });

    const ext = pathname.match(/\.[^.]+$/)?.[0] || '';
    return new Response(file, { headers: { 'content-type': types[ext] || 'application/octet-stream' } });
  },
});

console.log(`Serving dist at http://localhost:${port}/`);
