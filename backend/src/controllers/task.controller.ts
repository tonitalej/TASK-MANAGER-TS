import type { Request, Response } from 'express';
import * as taskService from '../services/task.service.js';
import { currentUser } from '../middleware/auth.js';
import { validated } from '../middleware/validate.js';
import * as v from '../validators/index.js';

// The user id comes from the verified JWT (currentUser), NEVER from the request body.
const idOf = (req: Request) => validated(req, v.validateIdParam, 'params').id;

export async function list(req: Request, res: Response): Promise<void> {
  const { tasks, meta } = await taskService.list(currentUser(req).id, validated(req, v.validateListQuery, 'query'));
  res.json({ data: tasks, meta });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ data: await taskService.getOne(currentUser(req).id, idOf(req)) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await taskService.create(currentUser(req).id, validated(req, v.validateCreateTask)) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ data: await taskService.update(currentUser(req).id, idOf(req), validated(req, v.validateUpdateTask)) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await taskService.remove(currentUser(req).id, idOf(req));
  res.status(204).end();
}
