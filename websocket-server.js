'use strict';

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';

app.server.listen(PORT, HOST, () => {
    console.log('══════════════════════════════════════════');
    console.log('  ZenCow WebSocket Server');
    console.log(`  Écoute    : http://${HOST}:${PORT}`);
    console.log(`  CORS      : ${process.env.ALLOWED_ORIGIN}`);
    console.log(`  Env       : ${process.env.NODE_ENV || 'development'}`);
    console.log('══════════════════════════════════════════');
});

process.on('uncaughtException',  (err) => console.error('[FATAL]', err));
process.on('unhandledRejection', (err) => console.error('[REJECT]', err));
