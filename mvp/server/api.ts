/** Express mount for the API routes (Node server). */
import express from 'express';
import { registerRoutes } from './routes';
import type { MiniRouter } from './routes';
import type { Engine } from './workflow/engine';
import type { DemoDirector } from './demo';

export function createApi(engine: Engine, director?: DemoDirector): express.Router {
  const r = express.Router();
  r.use(express.json({ limit: '8mb' }));
  registerRoutes(r as unknown as MiniRouter, engine, director);
  return r;
}
