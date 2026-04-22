'use strict';

require('dotenv').config();
const app = require('./src/app');

const PORT = process.env.PORT || 3000;

app.server.listen(PORT, '127.0.0.1', () => {
    console.log('══════════════════════════════════════════');
    console.log('  ZenCow WebSocket Server');
    console.log(`  Écoute    : http://127.0.0.1:${PORT}`);
    console.log(`  CORS      : ${process.env.ALLOWED_ORIGIN}`);
    console.log(`  Env       : ${process.env.NODE_ENV || 'development'}`);
    console.log('══════════════════════════════════════════');
});

process.on('uncaughtException',  (err) => console.error('[FATAL]', err));
process.on('unhandledRejection', (err) => console.error('[REJECT]', err));
