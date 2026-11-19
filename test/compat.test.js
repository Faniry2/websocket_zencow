'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const h       = require('./helpers');

// Mode rétrocompatible : la prod Laravel actuelle n'envoie ni jeton ni secret
let srv;
before(async () => { srv = await h.startServer({ WS_AUTH_REQUIRED: 'false' }); });
after(() => srv.close());
beforeEach(() => srv.socketService.clearStates());

test('rétrocompat : /broadcast sans secret accepté', async () => {
    const res = await request(srv.app).post('/broadcast/brumisateur').send(h.brumisateurPayload());
    assert.equal(res.status, 200);
});

test('rétrocompat : un secret fourni est quand même vérifié', async () => {
    const bad = await request(srv.app).post('/broadcast/brumisateur')
        .set('X-WS-Secret', 'faux').send(h.brumisateurPayload());
    assert.equal(bad.status, 401);
    const ok = await request(srv.app).post('/broadcast/brumisateur')
        .set('X-WS-Secret', h.BROADCAST_SECRET).send(h.brumisateurPayload());
    assert.equal(ok.status, 200);
});

test('rétrocompat : connexion sans jeton + ancien join { userId } fonctionne', async () => {
    await request(srv.app).post('/broadcast/ventilateur').send(h.ventilateurPayload({ vitesse: 33 }));

    const { socket } = await h.connect(srv.url);
    try {
        const last = h.waitFor(socket, 'ventilateur.update');
        socket.emit('join', { userId: 52 });
        assert.equal((await last).vitesse, 33);

        const live = h.waitFor(socket, 'brumisateur.update');
        await request(srv.app).post('/broadcast/brumisateur').send(h.brumisateurPayload());
        assert.equal((await live).userId, 52);
    } finally {
        socket.close();
    }
});

test('rétrocompat : un jeton fourni est quand même vérifié', async () => {
    await assert.rejects(h.connect(srv.url, { token: h.makeToken(52, { expiresIn: -60 }) }), /unauthorized/);
    await assert.rejects(h.connect(srv.url, { token: h.makeToken(52, { secret: 'faux' }) }), /unauthorized/);

    const { socket, events } = await h.connect(srv.url, { token: h.makeToken(52) });
    try {
        // jeton valide : room rejointe sans join, et join vers une autre room ignoré
        socket.emit('join', { userId: 53 });
        await h.delay(50);
        await request(srv.app).post('/broadcast/brumisateur').send(h.brumisateurPayload({ userId: 53 }));
        await request(srv.app).post('/broadcast/brumisateur').send(h.brumisateurPayload({ userId: 52 }));
        await h.delay(100);
        assert.equal(events.length, 1);
        assert.equal(events[0].payload.userId, 52);
    } finally {
        socket.close();
    }
});

test("rétrocompat : l'origine reste vérifiée si ALLOWED_ORIGIN est défini", async () => {
    await assert.rejects(h.connect(srv.url, { origin: 'https://pirate.example' }));
});

test("sans ALLOWED_ORIGIN : l'origine n'est pas vérifiée en websocket", async () => {
    const saved = process.env.ALLOWED_ORIGIN;
    delete process.env.ALLOWED_ORIGIN;
    try {
        const { socket } = await h.connect(srv.url, { origin: 'https://nimporte.example' });
        socket.close();
    } finally {
        process.env.ALLOWED_ORIGIN = saved;
    }
});

test('/states accessible sans secret hors production en mode rétrocompatible', async () => {
    assert.equal((await request(srv.app).get('/states')).status, 200);
});
