import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const forbidden = (message = 'You do not have permission to do that') => new HttpError(403, message);

// Translates validation and SQLite constraint failures into clean API errors.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const issue = err.issues[0];
    const field = issue?.path?.join('.');
    return res.status(400).json({
      error: field ? `${field}: ${issue.message}` : 'Invalid request',
      details: err.issues,
    });
  }
  if (err?.code === 'ERR_SQLITE_ERROR') {
    const msg = String(err.message);
    if (/CHECK constraint failed: stock/.test(msg)) {
      return res.status(409).json({ error: 'Not enough stock on hand for this change' });
    }
    if (/UNIQUE constraint failed: (\w+)\.(\w+)/.test(msg)) {
      const [, , col] = msg.match(/UNIQUE constraint failed: (\w+)\.(\w+)/);
      return res.status(409).json({ error: `A record with this ${col} already exists` });
    }
    if (/FOREIGN KEY constraint failed/.test(msg)) {
      return res.status(409).json({ error: 'This record is referenced by other records' });
    }
    if (err.errcode === 19 || /constraint|immutable|transition|locked|ledger|Closed/i.test(msg)) {
      return res.status(409).json({ error: msg.replace(/^.*?: /, '') });
    }
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
}
