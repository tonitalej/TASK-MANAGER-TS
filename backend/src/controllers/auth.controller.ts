// Controller = HTTP in, HTTP out. Reads the request, calls a service, sends the response.
import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { currentUser } from '../middleware/auth.js';
import { validated } from '../middleware/validate.js';
import { validateLogin, validateRegister } from '../validators/index.js';

export async function register(req: Request, res: Response): Promise<void> {
  const result = await authService.register(validated(req, validateRegister));
  res.status(201).json({ data: result });
}

export async function login(req: Request, res: Response): Promise<void> {
  const result = await authService.login(validated(req, validateLogin));
  res.json({ data: result });
}

export async function me(req: Request, res: Response): Promise<void> {
  res.json({ data: { user: await authService.getProfile(currentUser(req).id) } });
}
