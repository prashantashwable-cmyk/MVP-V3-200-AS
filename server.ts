import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { app } from './src/serverApp';

const PORT = 3000;

// ==========================================
// Dev & Production serving
// ==========================================

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    // Development mode - integrate Vite dev server
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log("Vite development middleware integrated.");
  } else {
    // Production mode - serve compiled assets
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Production static asset serving configured.");
  }

  // Listen to PORT 3000 (Required by platform)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
