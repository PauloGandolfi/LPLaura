const fs = require('node:fs');
fs.mkdirSync('dist', { recursive:true });
fs.copyFileSync('index.html', 'dist/index.html');
fs.cpSync('src', 'dist/src', { recursive:true });
fs.cpSync('images', 'dist/images', { recursive:true });
