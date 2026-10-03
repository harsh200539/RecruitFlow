import { app } from './app.js';
import { db } from './db.js';
import { createServer } from 'node:http';
const server = createServer(app);
const port = Number(process.env.PORT || 5001);
server.listen(port, () => console.log('recruitflow API on ' + port));
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await db.$disconnect();
      process.exit(0);
    }),
  );
