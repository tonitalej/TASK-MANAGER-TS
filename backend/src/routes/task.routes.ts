import express from 'express';
import * as controller from '../controllers/task.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import * as v from '../validators/index.js';

export const taskRoutes = express.Router();

taskRoutes.use(authenticate); // every task route requires a valid token

taskRoutes.get('/', validate(v.validateListQuery, 'query'), controller.list);
taskRoutes.get('/:id', validate(v.validateIdParam, 'params'), controller.getOne);
taskRoutes.post('/', validate(v.validateCreateTask), controller.create);
taskRoutes.patch('/:id', validate(v.validateIdParam, 'params'), validate(v.validateUpdateTask), controller.update);
taskRoutes.delete('/:id', validate(v.validateIdParam, 'params'), controller.remove);
