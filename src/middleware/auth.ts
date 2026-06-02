import { Request, Response, NextFunction } from 'express';
import { config } from '../lib/config';
import { UnauthorizedError } from '../lib/errors';

export interface AuthenticatedRequest extends Request {
  customer_id?: string;
}

export function apiKeyAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const key = req.headers['x-api-key'] as string | undefined;

  if (!key || key !== config.API_KEY) {
    return next(new UnauthorizedError('Invalid or missing API key'));
  }

  // For Slice 1, customer_id is passed as a header or derived from API key.
  // In production, API keys would be scoped to customers.
  req.customer_id = req.headers['x-customer-id'] as string | undefined || 'default-customer';

  next();
}