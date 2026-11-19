# TODO — Serveur WebSocket ZenCow

Branche : `correction_web_socket_add_routebrumisateur` (ne pas commiter sur `main`).

Légende : 🔴 bloquant ou sécurité · 🟠 important · 🟢 amélioration

Plusieurs points touchent **aussi Laravel** (dépôt zencowWeb). Ils sont marqués **[Laravel]** et doivent être déployés **en même temps** que le serveur websocket, sinon la prod casse.

---

## 1. 🔴 Ajouter la route `/broadcast/brumisateur` (objet de la branche)

Constat :
- Laravel envoie déjà les mises à jour du brumisateur à `POST /broadcast/brumisateur` (`mesureApiController.php:878`).
- Le serveur n'a que `ventilateur`, `capteur` et `alerte` : il répond `404 Route POST /broadcast/brumisateur introuvable`.
- Conséquence : la page brumisateur ne reçoit jamais de mise à jour en direct (seul le polling de secours de `brumisateur.js` fonctionne), et Laravel écrit un `Log::warning('[Brumisateur WS] …')` à chaque trame.

Contenu envoyé par Laravel :
```json
{
  "event": "brumisateur.update",
  "devEui": "…", "deviceName": "…", "refActionneur": "…",
  "etat": 1, "dureeOn": 60, "dureeOff": 120, "dureeTotale": 3600,
  "receivedAt": "2026-…", "userId": 52, "configId": 3
}
```
`brumisateur.js` écoute l'événement `brumisateur.update` (ligne 102).

- [x] Créer `src/controllers/brumisateurController.js` sur le modèle de `ventilateurController.js` :
  - champs obligatoires : `event`, `userId`, `devEui`, `refActionneur`, `etat` ;
  - contrôle des durées : nombres ≥ 0 ou `null` ;
  - `stateKey = user:${userId}:brumisateur:${refActionneur}` (préfixe `user:` obligatoire pour que l'état soit renvoyé à la connexion) ;
  - `socketService.broadcast('brumisateur.update', stateKey, payload)`.
- [x] Déclarer la route dans `src/routes/index.js` : `router.post('/broadcast/brumisateur', brumisateurController.broadcast)`.
- [x] Documenter le contenu attendu en tête du contrôleur, comme pour le ventilateur.
- [ ] Tester en local : envoyer une trame brumisateur à Laravel, puis vérifier dans le navigateur que la page `/brumisateur` se met à jour sans rechargement.

---

## 2. 🔴 Sécurité : n'importe qui peut lire les données de n'importe quel éleveur

Constat (`src/services/socketService.js`) :
```js
socket.on('join', ({ userId }) => { socket.join(`user:${userId}`); ... })
```
- Le serveur croit sur parole le `userId` envoyé par le navigateur, sans vérification.
- Il suffit d'envoyer `join` avec `userId: 52` pour recevoir en direct les vitesses, ITH et alertes de l'éleveur 52, et le dernier état connu dès la connexion.

À faire : un jeton signé par Laravel.
- [ ] **[Laravel]** Générer un jeton court pour l'utilisateur connecté et l'injecter dans la page (`base.blade.php`, à côté de `window.wsUrl`) :
  - JWT HS256 ou HMAC maison : `{ userId, exp: now + 1h }`, signé avec un secret partagé `WS_JWT_SECRET` ;
  - rendre le jeton disponible en JS : `window.wsToken`.
- [ ] **[Laravel]** `fan.js` et `brumisateur.js` : envoyer le jeton à la connexion avec `io(wsUrl, { auth: { token: window.wsToken }, … })`, et **ne plus envoyer `userId`** dans `join`.
- [x] Websocket : un middleware `io.use((socket, next) => …)` vérifie la signature et l'expiration du jeton :
  - refuser la connexion si le jeton est invalide ;
  - sinon `socket.data.userId = payload.userId` et `socket.join('user:' + userId)` automatiquement.
- [x] Supprimer l'événement `join` côté serveur, ou ignorer le `userId` envoyé par le client. *Fait : `join` ignoré si le socket est authentifié ou si `WS_AUTH_REQUIRED=true` ; accepté avec avertissement sinon (rétrocompatibilité).*
- [ ] Ajouter `WS_JWT_SECRET` dans le `.env` du websocket **et** de Laravel (prod et local : `docker-compose.yml`). *Local fait (`.env` + `docker-compose.yml`) ; reste la prod.*
- [ ] Prévoir la reconnexion après expiration du jeton (rechargement de la page, ou route Laravel `/ws/token` pour en demander un nouveau).

---

## 3. 🔴 Sécurité : routes HTTP sans authentification

Constat :
- `POST /broadcast/*` accepte n'importe quel appel : on peut envoyer de fausses vitesses ou de fausses alertes sur l'écran d'un éleveur. Ça n'agit pas sur le matériel, mais l'éleveur voit de fausses informations.
- `GET /states` (commenté « debug ») renvoie le dernier état de **tous** les éleveurs.
- `GET /health` donne le nombre de clients connectés.
- En prod, ces routes sont publiques si le proxy de `testapi.zencow.fr` transmet tout au serveur Node. À vérifier : `curl https://testapi.zencow.fr/states`.

À faire :
- [x] Middleware Express `requireSecret` sur `/broadcast/*` : en-tête `X-WS-Secret` comparé à `process.env.WS_BROADCAST_SECRET` avec `crypto.timingSafeEqual`, sinon 401.
- [ ] **[Laravel]** `mesureApiController` (ventilateur ligne ~786, brumisateur ligne ~881) : ajouter `->withHeaders(['X-WS-Secret' => config('webhook.ws_broadcast_secret')])`, avec la clé `ws_broadcast_secret` dans `config/webhook.php` (env `WS_BROADCAST_SECRET`).
- [ ] **[Laravel]** Regrouper les appels au websocket dans un service unique `App\Services\WebSocketNotifier` au lieu de deux blocs recopiés dans le contrôleur.
- [x] `/states` : désactivé si `NODE_ENV=production`, ou protégé par le même secret.
- [x] `/health` : garder le statut, mais retirer `clients` et `states`, ou les réserver aux requêtes avec le secret.
- [ ] Côté proxy de prod, n'exposer que `/socket.io/` au public. `/broadcast/*` n'a besoin d'être joignable que par Laravel, en local sur le serveur.

---

## 4. 🟠 `ALLOWED_ORIGIN` ne protège pas les connexions websocket

Constat :
- `cors: { origin }` de socket.io ne s'applique qu'au transport *polling*. Les navigateurs passent par le transport *websocket* (`transports: ['websocket', 'polling']`), qui ignore ce réglage.
- Test local avec `Origin: https://pirate.example` : polling bloqué ✅, websocket **accepté (101)** ❌.
- En prod, `ALLOWED_ORIGIN=https://testapi.zencow.fr` est l'adresse du serveur websocket lui-même, pas celle du site. Ça marche quand même, uniquement parce que le websocket ignore ce réglage.

À faire :
- [x] `socketService.init` : ajouter `allowRequest: (req, cb) => cb(null, origines.includes(req.headers.origin))` pour vérifier l'origine aussi en websocket.
- [x] Accepter plusieurs origines : `ALLOWED_ORIGIN=https://zencow.fr,https://www.zencow.fr`, découpées sur `,` dans `src/app.js`.
- [ ] **Prod** : corriger `ALLOWED_ORIGIN` dans le `.env` du serveur avec le vrai domaine du site, **avant** de déployer le point précédent, sinon toutes les connexions seront refusées.
- [x] Local : `docker-compose.yml` fournit déjà `ALLOWED_ORIGIN=https://zencow.test`.

---

## 5. 🟠 Route `/broadcast/capteur` inutilisable

Constat (`capteurController.js`) :
- `userId` n'est pas obligatoire, alors que `socketService.broadcast` **ignore** tout message sans `userId` (`broadcast sans userId — ignoré`). Le message n'est donc jamais diffusé.
- `stateKey = capteur:${capteurId}` n'a pas le préfixe `user:` : même avec un `userId`, le dernier état ne serait jamais renvoyé à la connexion.
- Laravel n'appelle pas cette route aujourd'hui, et aucun JS n'écoute `capteur.mesure`.

- [ ] Décider : la supprimer, ou la corriger (`userId` obligatoire, `stateKey = user:${userId}:capteur:${capteurId}`).
- [ ] Même vérification pour `/broadcast/alerte` : `alerte.ith` n'est écouté par aucun JS et n'est appelé nulle part par Laravel.

---

## 6. 🟠 Adresse d'écoute (`HOST`)

- [x] `websocket-server.js` : l'adresse d'écoute se règle avec `process.env.HOST` (défaut `127.0.0.1`, donc aucun changement en prod). Docker la définit à `0.0.0.0`. *Modification faite, pas encore commitée.*
- [ ] Optionnel : renommer en `WS_HOST`. *Non fait : décision de garder `HOST`.* Aucun système ne définit cette variable, alors que zsh et tcsh définissent `HOST` avec le nom de la machine. Ça change une ligne ici et une dans `docker-compose.yml`.
- [x] Ajouter un `.env.example` au dépôt, avec `PORT`, `HOST`, `ALLOWED_ORIGIN`, `NODE_ENV`, `WS_JWT_SECRET` et `WS_BROADCAST_SECRET`.

---

## 7. 🟢 Robustesse

- [ ] `latestStates` (une `Map` en mémoire) : perdue à chaque redémarrage, et elle grossit sans limite (une entrée par appareil). Ajouter une durée de vie, par exemple supprimer les états de plus de 24 h.
- [ ] Contrôler le contenu reçu : types et bornes de chaque champ, et refus des champs inattendus, au lieu de rediffuser `req.body` tel quel aux navigateurs.
- [ ] Limite de taille du corps des requêtes : `express.json({ limit: '10kb' })`.
- [ ] Limite de débit par IP sur `/broadcast/*` et sur les connexions socket.io.
- [ ] Logs : moins verbeux en prod (une ligne par message diffusé), avec un niveau réglable par `LOG_LEVEL`.
- [ ] Arrêt propre sur `SIGTERM` (`io.close()`, `server.close()`), pour PM2 et Docker.

---

## 8. 🟢 Tests

- [ ] Ajouter `vitest` ou `jest` + `supertest` + `socket.io-client` en dépendances de développement.
- [ ] `POST /broadcast/brumisateur` : 422 si un champ manque, 401 sans secret, 200 sinon, et le message arrive dans la bonne room.
- [ ] Connexion socket.io : refusée sans jeton, avec un jeton expiré ou falsifié, ou depuis une origine non autorisée.
- [ ] Un client de l'utilisateur A ne reçoit **jamais** les messages de l'utilisateur B.
- [ ] Le dernier état est renvoyé à la connexion, pour le ventilateur et le brumisateur.
- [ ] Script `npm test` dans `package.json`.

---

## 9. Ordre conseillé et déploiement

1. **§1, route brumisateur** : rapide, aucun impact sur Laravel ni sur la prod existante.
2. **§6**, plus le `.env.example`.
3. **§3, secret sur `/broadcast/*`** : à déployer en même temps que **[Laravel]**. Ordre sûr :
   - (a) Laravel envoie l'en-tête ;
   - (b) le websocket l'exige.
4. **§4, origines** : corriger `ALLOWED_ORIGIN` en prod d'abord, puis déployer `allowRequest`.
5. **§2, jeton signé** : le plus long, et il touche Laravel et le JS. Ordre sûr :
   - (a) Laravel injecte `wsToken` ;
   - (b) le JS l'envoie ;
   - (c) le websocket l'exige.
6. §5, §7, §8.

Test complet en local : `make up`, puis https://zencow.test/ventilateur et `/brumisateur`, avec un compte éleveur (mot de passe `password`). Les logs du serveur websocket s'affichent avec `make logs s=websocket`.
