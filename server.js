const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const DIRECTORY = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let filePath = path.join(DIRECTORY, req.url === '/' ? 'index.html' : req.url);
  const extname = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  // Устанавливаем правильные CSP заголовки
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-eval' https://cdn.jsdelivr.net https://binaries.soliditylang.org; " +
    "worker-src 'self' blob:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https://images.walletconnect.com; " +
    "connect-src 'self' https://api.etherscan.io https://api.bscscan.com https://api-testnet.bscscan.com " +
    "https://bsc-dataseed.binance.org https://data-seed-prebsc-1-s1.binance.org:8545 " +
    "https://rpc.ankr.com https://rpc.sepolia.org https://binaries.soliditylang.org " +
    "https://*.walletconnect.com https://relay.walletconnect.com https://explorer-api.walletconnect.com " +
    "wss://*.walletconnect.com wss://relay.walletconnect.com; " +
    "font-src 'self'; " +
    "form-action 'self'; " +
    "object-src 'none'; " +
    "base-uri 'self'"
  );
  
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('Server Error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('CSP with unsafe-eval enabled for solc.js compilation');
});
