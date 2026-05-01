import puppeteer from 'puppeteer';
import handler from 'serve-handler';
import http from 'http';

const server = http.createServer((request, response) => {
  return handler(request, response, {
    public: '/home/miguelguerra200022/Universo/Cartografia-de-lo-Infinito'
  });
});

server.listen(3000, async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));
  
  await page.goto('http://localhost:3000');
  
  // Wait for loading to finish
  await page.waitForFunction(() => document.getElementById('loading-screen').style.opacity === '0', { timeout: 15000 });
  
  console.log("Game loaded. Triggering planet enter...");
  await page.evaluate(() => {
    // Force planet entry
    window.dispatchEvent(new CustomEvent('planet-mode', {
      detail: { type: 'enter', data: { biome: 'Temperate', name: 'Test', seed: 12345, radius: 5, index: 0 } }
    }));
  });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Dump scene state
  const state = await page.evaluate(() => {
    const scene = window.__TEST_SCENE__; // We need to expose scene!
    return { altitude: document.getElementById('planet-altitude').innerText };
  });
  console.log("State:", state);
  
  await browser.close();
  server.close();
});
