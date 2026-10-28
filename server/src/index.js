import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { migrate, one } from './db.js';
import { errorHandler } from './errors.js';
import routes from './routes.js';
import { seed } from './seed.js';

migrate();
if (!one('SELECT COUNT(*) AS n FROM users').n) {
  console.log('Empty database — loading demo data…');
  seed();
}

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET must be set in production.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
// Behind a hosting proxy (Render): use the client's real IP for sign-in rate limiting.
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin' });
  next();
});

app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the built client in production (npm run build).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    index: false,
    // Hashed build assets never change; fonts are versioned by filename.
    setHeaders: (res, file) => {
      if (/[\\/](assets|fonts)[\\/]/.test(file)) res.set('Cache-Control', 'public, max-age=31536000, immutable');
    },
  }));
  // Client-side routes all serve the app shell, which must never be cached stale.
  app.get(/^(?!\/api).*/, (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use(errorHandler);

const port = Number(process.env.PORT) || 5180;
app.listen(port, () => console.log(`Stockroom API listening on http://localhost:${port}`));
