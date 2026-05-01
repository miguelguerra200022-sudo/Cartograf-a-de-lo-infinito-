const puppeteer = require('puppeteer');
const http = require('http');
const handler = require('serve-handler');

const server = http.createServer((request, response) => {
  return handler(request, response, { public: '/home/miguelguerra200022/Universo/Cartografia-de-lo-Infinito' });
});

server.listen(3000, async () => {
    try {
        const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
        const page = await browser.newPage();
        page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
        page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
        page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));
        
        await page.goto('http://localhost:3000/index.html', { waitUntil: 'networkidle0' });
        
        await browser.close();
    } catch(e) {
        console.error(e);
    }
    server.close();
});
