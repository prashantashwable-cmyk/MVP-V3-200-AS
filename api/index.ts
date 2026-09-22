// Vercel serverless entrypoint: exports the shared Express app (no app.listen —
// Vercel's Node runtime handles the request/response lifecycle itself).
import { app } from '../src/serverApp';

export default app;
