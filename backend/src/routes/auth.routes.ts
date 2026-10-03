import express from 'express';
import * as controller from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/auth.js';
import { createAuthRateLimiter } from '../middleware/rateLimit.js';
import { validateLogin, validateRegister } from '../validators/index.js';

export const authRoutes = express.Router();

// Pipeline per route:  rate limit -> validate -> controller -> service -> repository -> database
// Each route gets its own limiter, so failed logins don't use up the register budget and vice versa.
authRoutes.post('/register', createAuthRateLimiter(), validate(validateRegister), controller.register);
authRoutes.post('/login', createAuthRateLimiter(), validate(validateLogin), controller.login);
authRoutes.get('/me', authenticate, controller.me);
