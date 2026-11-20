'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert  = require('node:assert/strict');
const request = require('supertest');
const h       = require('./helpers');

let srv;
before(async () => { srv = await h.startServer({ WS_AUTH_REQUIRED: 'true' }); });
after(() => srv.close());
beforeEach(() => srv.socketService.clearStates());

const post = (path, body, secret = h.BROADCAST_SECRET) => {
    const r = request(srv.app).post(path).send(body);
    return secret === null ? r : r.set('X-WS-Secret', secret);
};

test('/broadcast/brumisateur : 422 si un champ obligatoire manque', async () => {
    for (const field of ['event', 'userId', 'devEui', 'refActionneur', 'etat']) {
        const body = h.brumisateurPayload();
        delete body[field];
        const res = await post('/broadcast/brumisateur', body);
        assert.equal(res.status, 422, field);
        assert.deepEqual(res.body.missing, [field]);
    }
});

test('/broadcast/brumisateur : 422 sur durée négative, type invalide ou champ inattendu', async () => {
    assert.equal((await post('/broadcast/brumisateur', h.brumisateurPayload({ dureeOn: -1 }))).status, 422);
    assert.equal((await post('/broadcast/brumisateur', h.brumisateurPayload({ dureeOff: '120' }))).status, 422);
    assert.equal((await post('/broadcast/brumisateur', h.brumisateurPayload({ etat: 'on' }))).status, 422);
    assert.equal((await post('/broadcast/brumisateur', h.brumisateurPayload({ event: 'autre' }))).status, 422);
    const res = await post('/broadcast/brumisateur', h.brumisateurPayload({ pirate: '<script>' }));
    assert.equal(res.status, 422);
    assert.deepEqual(res.body.unexpected, ['pirate']);
});

test('/broadcast/brumisateur : durées null acceptées', async () => {
    const res = await post('/broadcast/brumisateur', h.brumisateurPayload({ dureeOn: null, dureeOff: null, dureeTotale: null }));
    assert.equal(res.status, 200);
});

test('/broadcast/* : 401 sans secret ou avec un mauvais secret', async () => {
    for (const secret of [null, '', 'faux', h.BROADCAST_SECRET + 'x', h.BROADCAST_SECRET.slice(0, -1)]) {
        const res = await post('/broadcast/brumisateur', h.brumisateurPayload(), secret);
        assert.equal(res.status, 401, `secret=${secret}`);
        assert.deepEqual(res.body, { error: 'Non autorisé.' });
    }
    assert.equal((await post('/broadcast/ventilateur', h.ventilateurPayload(), null)).status, 401);
});

test('/broadcast/brumisateur : 200 et le message arrive dans la bonne room', async () => {
    const { socket } = await h.connect(srv.url, { token: h.makeToken(52) });
    try {
        const received = h.waitFor(socket, 'brumisateur.update');
        const res = await post('/broadcast/brumisateur', h.brumisateurPayload());
        assert.equal(res.status, 200);
        assert.equal(res.body.room, 'user:52');
        assert.equal(res.body.key, 'user:52:brumisateur:b1');
        const payload = await received;
        assert.equal(payload.etat, 1);
        assert.equal(payload.refActionneur, 'b1');
    } finally {
        socket.close();
    }
});

test("isolation : l'utilisateur A ne reçoit jamais les messages de B", async () => {
    const a = await h.connect(srv.url, { token: h.makeToken(52) });
    const b = await h.connect(srv.url, { token: h.makeToken(53) });
    try {
        // A tente en plus de rejoindre la room de B avec l'ancien `join`
        a.socket.emit('join', { userId: 53 });
        await h.delay(50);

        const bReceived = h.waitFor(b.socket, 'brumisateur.update');
        await post('/broadcast/brumisateur', h.brumisateurPayload({ userId: 53, refActionneur: 'b53' }));
        await post('/broadcast/ventilateur', h.ventilateurPayload({ userId: 53 }));
        assert.equal((await bReceived).userId, 53);
        await h.delay(100);

        assert.deepEqual(a.events, [], 'A ne doit rien recevoir');
    } finally {
        a.socket.close();
        b.socket.close();
    }
});

test('dernier état renvoyé à la connexion (ventilateur et brumisateur, uniquement le sien)', async () => {
    await post('/broadcast/ventilateur', h.ventilateurPayload({ vitesse: 40 }));
    await post('/broadcast/ventilateur', h.ventilateurPayload({ vitesse: 80 })); // remplace le précédent
    await post('/broadcast/brumisateur', h.brumisateurPayload({ etat: 0 }));
    await post('/broadcast/brumisateur', h.brumisateurPayload({ userId: 99, refActionneur: 'autre' }));

    const { socket, events } = await h.connect(srv.url, { token: h.makeToken(52) });
    try {
        await h.delay(100);
        const byEvent = Object.fromEntries(events.map((e) => [e.event, e.payload]));
        assert.equal(events.length, 2);
        assert.equal(byEvent['ventilateur.update'].vitesse, 80);
        assert.equal(byEvent['brumisateur.update'].etat, 0);
        assert.ok(events.every((e) => e.payload.userId === 52));
    } finally {
        socket.close();
    }
});

test('les états expirés (STATE_TTL_HOURS) ne sont plus renvoyés', async () => {
    await post('/broadcast/brumisateur', h.brumisateurPayload());
    assert.equal(srv.socketService.purgeExpiredStates(Date.now() + 25 * 3600 * 1000), 1);
    assert.deepEqual(srv.socketService.getAllStates(), {});
});

test('/broadcast/capteur et /broadcast/alerte : userId obligatoire, clé user:', async () => {
    const capteur = { event: 'capteur.mesure', capteurId: 42, ith: 68.3 };
    assert.equal((await post('/broadcast/capteur', capteur)).status, 422);
    const res = await post('/broadcast/capteur', { ...capteur, userId: 52 });
    assert.equal(res.status, 200);
    assert.equal(res.body.key, 'user:52:capteur:42');

    const alerte = { event: 'alerte.ith', userId: 52, ith: 79.2, niveau: 'critique' };
    assert.equal((await post('/broadcast/alerte', { ...alerte, niveau: 'grave' })).status, 422);
    const res2 = await post('/broadcast/alerte', alerte);
    assert.equal(res2.status, 200);
    assert.equal(res2.body.key, 'user:52:alerte:global');
});

test('corps trop gros -> 413, JSON invalide -> 400', async () => {
    const big = await post('/broadcast/brumisateur', { ...h.brumisateurPayload(), deviceName: 'x'.repeat(20_000) });
    assert.equal(big.status, 413);
    const bad = await request(srv.app).post('/broadcast/brumisateur')
        .set('X-WS-Secret', h.BROADCAST_SECRET).set('Content-Type', 'application/json').send('{bad');
    assert.equal(bad.status, 400);
});

test('/health : statut public, compteurs réservés au secret', async () => {
    const pub = await request(srv.app).get('/health');
    assert.equal(pub.status, 200);
    assert.equal(pub.body.status, 'ok');
    assert.equal(pub.body.clients, undefined);
    assert.equal(pub.body.states, undefined);

    const priv = await request(srv.app).get('/health').set('X-WS-Secret', h.BROADCAST_SECRET);
    assert.equal(typeof priv.body.clients, 'number');
    assert.equal(typeof priv.body.states, 'number');
});

test('/states : secret obligatoire, 404 en production', async () => {
    assert.equal((await request(srv.app).get('/states')).status, 401);
    assert.equal((await request(srv.app).get('/states').set('X-WS-Secret', h.BROADCAST_SECRET)).status, 200);

    process.env.NODE_ENV = 'production';
    try {
        assert.equal((await request(srv.app).get('/states').set('X-WS-Secret', h.BROADCAST_SECRET)).status, 404);
    } finally {
        process.env.NODE_ENV = 'test';
    }
});

test('limite de débit par IP sur /broadcast/* -> 429', async () => {
    Object.assign(process.env, { TRUST_PROXY: 'true', RATE_LIMIT_BROADCAST: '2' });
    try {
        const send = (ip) => request(srv.app).post('/broadcast/brumisateur')
            .set('X-WS-Secret', h.BROADCAST_SECRET).set('X-Forwarded-For', ip)
            .send(h.brumisateurPayload());
        assert.equal((await send('10.0.0.1')).status, 200);
        assert.equal((await send('10.0.0.1')).status, 200);
        assert.equal((await send('10.0.0.1')).status, 429);
        assert.equal((await send('10.0.0.2')).status, 200, 'une autre IP n\'est pas bloquée');
    } finally {
        delete process.env.TRUST_PROXY;
        delete process.env.RATE_LIMIT_BROADCAST;
    }
});
