'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const h      = require('./helpers');

let srv;
before(async () => { srv = await h.startServer({ WS_AUTH_REQUIRED: 'true' }); });
after(() => srv.close());

async function assertRefused(opts, expected = 'unauthorized') {
    await assert.rejects(h.connect(srv.url, opts), (err) => {
        if (expected) assert.equal(err.message, expected);
        return true;
    });
}

test('connexion refusée sans jeton', async () => {
    await assertRefused({});
    await assertRefused({ token: '' });
});

test('connexion refusée avec un jeton expiré', async () => {
    await assertRefused({ token: h.makeToken(52, { expiresIn: -60 }) });
});

test('connexion refusée avec un jeton falsifié', async () => {
    await assertRefused({ token: h.makeToken(52, { secret: 'mauvais-secret' }) });

    // Payload modifié après signature (sub 52 -> 53)
    const [head, , sig] = h.makeToken(52).split('.');
    const now = Math.floor(Date.now() / 1000);
    const forged = Buffer.from(JSON.stringify({ sub: 53, iat: now, exp: now + 3600 })).toString('base64url');
    await assertRefused({ token: `${head}.${forged}.${sig}` });

    await assertRefused({ token: h.unsignedToken(52) });
    await assertRefused({ token: 'pas.un.jwt' });
});

test('connexion refusée si sub ou exp est invalide', async () => {
    const jwt = require('jsonwebtoken');
    await assertRefused({ token: jwt.sign({ sub: 52 }, h.JWT_SECRET) });           // pas d'exp
    await assertRefused({ token: h.makeToken('abc') });
    await assertRefused({ token: h.makeToken(0) });
});

test('connexion refusée depuis une origine non autorisée (websocket et polling)', async () => {
    const token = h.makeToken(52);
    await assertRefused({ token, origin: 'https://pirate.example' }, null);
    await assertRefused({ token, origin: 'https://pirate.example', transport: 'polling' }, null);
    await assertRefused({ token, origin: null }, null);
});

test('origines multiples : chacune est acceptée', async () => {
    process.env.ALLOWED_ORIGIN = 'https://zencow.fr, https://www.zencow.fr';
    try {
        for (const origin of ['https://zencow.fr', 'https://www.zencow.fr']) {
            const { socket } = await h.connect(srv.url, { token: h.makeToken(52), origin });
            socket.close();
        }
        await assertRefused({ token: h.makeToken(52), origin: h.ORIGIN }, null);
    } finally {
        process.env.ALLOWED_ORIGIN = h.ORIGIN;
    }
});

test('jeton valide (sub nombre ou chaîne de chiffres) : connexion acceptée', async () => {
    for (const sub of [52, '52']) {
        const { socket } = await h.connect(srv.url, { token: h.makeToken(sub) });
        assert.ok(socket.connected);
        socket.close();
    }
});

test("WS_AUTH_REQUIRED=true : l'ancien join est ignoré", async () => {
    // Un client authentifié en 52 qui demande la room 53 ne reçoit rien de 53
    const request = require('supertest');
    const { socket, events } = await h.connect(srv.url, { token: h.makeToken(52) });
    try {
        socket.emit('join', { userId: 53 });
        await h.delay(50);
        await request(srv.app).post('/broadcast/brumisateur')
            .set('X-WS-Secret', h.BROADCAST_SECRET)
            .send(h.brumisateurPayload({ userId: 53 }));
        await h.delay(100);
        assert.deepEqual(events, []);
    } finally {
        socket.close();
    }
});
