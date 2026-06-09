import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { config } from './lib/config';
import { apiKeyAuth } from './middleware/auth';
import { errorHandler } from './middleware/errorHandler';
import projectsRouter from './routes/projects';
import artifactsRouter from './routes/artifacts';
import tasksRouter from './routes/tasks';
import dataneedsRouter from './routes/dataneeds';
import claimsRouter from './routes/claims';
import expertiseRouter from './routes/expertise';

const app = express();

app.use(express.json({ limit: '50mb' }));

// Health check (no auth required)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

// OpenAPI spec placeholder
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup({
  openapi: '3.0.0',
  info: { title: 'NbeamNG API', version: '0.1.0' },
  paths: {},
}));

// Auth middleware for all API routes
app.use(apiKeyAuth);

// Routes
app.use('/projects', projectsRouter);
app.use(artifactsRouter);
app.use(tasksRouter);
app.use(dataneedsRouter);
app.use(claimsRouter);
app.use('/expertise', expertiseRouter);

// Error handler
app.use(errorHandler);

export { app };