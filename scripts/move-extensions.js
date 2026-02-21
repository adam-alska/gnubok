const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const extsDir = path.join(root, 'extensions');
const generalDir = path.join(extsDir, 'general');

const dirs = [
  'receipt-ocr',
  'ai-categorization',
  'ai-chat',
  'push-notifications',
  'enable-banking',
  'example-logger',
];

if (!fs.existsSync(generalDir)) {
  fs.mkdirSync(generalDir, { recursive: true });
}

for (const ext of dirs) {
  const src = path.join(extsDir, ext);
  const dest = path.join(generalDir, ext);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    fs.rmSync(src, { recursive: true, force: true });
    console.log('Done: ' + ext);
  } else {
    console.log('Skip: ' + ext);
  }
}

console.log('All done.');
