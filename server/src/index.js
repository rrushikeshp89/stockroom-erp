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

const app = express();
app.disable('x-powered-by');
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
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use(errorHandler);

const port = Number(process.env.PORT) || 5180;
app.listen(port, () => console.log(`Stockroom API listening on http://localhost:${port}`));
