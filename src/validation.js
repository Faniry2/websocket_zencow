'use strict';

/**
 * Validation des corps reçus de Laravel : types, bornes, champs inattendus.
 * Le payload diffusé aux navigateurs est reconstruit à partir des seuls
 * champs connus, au lieu de rediffuser req.body tel quel.
 *
 * Règle de champ : { type, required, nullable, min, max, maxLength, values, integer }
 *   type : 'string' | 'number' | 'id' (entier > 0, ou chaîne de chiffres)
 *          | 'ref' (chaîne ou nombre, identifiant d'appareil)
 *   required : la clé doit être présente (une valeur null est acceptée si nullable)
 */

function checkField(name, rule, value) {
    if (value === null) {
        return rule.nullable ? null : `${name} ne peut pas être null`;
    }

    switch (rule.type) {
        case 'string':
            if (typeof value !== 'string') return `${name} doit être une chaîne`;
            if (rule.maxLength && value.length > rule.maxLength) return `${name} dépasse ${rule.maxLength} caractères`;
            if (rule.values && !rule.values.includes(value)) return `${name} doit être : ${rule.values.join(', ')}`;
            return null;

        case 'ref':
            if (typeof value === 'number' && Number.isFinite(value)) return null;
            if (typeof value !== 'string' || value === '') return `${name} doit être une chaîne ou un nombre`;
            if (value.length > (rule.maxLength || 64)) return `${name} dépasse ${rule.maxLength || 64} caractères`;
            return null;

        case 'id': {
            const n = typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : value;
            if (!Number.isSafeInteger(n) || n <= 0) return `${name} doit être un entier positif`;
            return null;
        }

        case 'number':
            if (typeof value !== 'number' || !Number.isFinite(value)) return `${name} doit être un nombre`;
            if (rule.integer && !Number.isInteger(value)) return `${name} doit être un entier`;
            if (rule.min !== undefined && value < rule.min) return `${name} doit être >= ${rule.min}`;
            if (rule.max !== undefined && value > rule.max) return `${name} doit être <= ${rule.max}`;
            return null;

        default:
            return `${name} : type inconnu`;
    }
}

/**
 * @returns {{ status: 422, body: object } | { value: object }}
 */
function validate(schema, body, label) {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
        return { status: 422, body: { error: `Le payload ${label} doit être un objet JSON.` } };
    }

    const missing = Object.keys(schema).filter((k) => schema[k].required && body[k] === undefined);
    if (missing.length > 0) {
        return { status: 422, body: { error: `Champs manquants dans le payload ${label}.`, missing } };
    }

    const unexpected = Object.keys(body).filter((k) => !(k in schema));
    if (unexpected.length > 0) {
        return { status: 422, body: { error: `Champs inattendus dans le payload ${label}.`, unexpected } };
    }

    const errors = [];
    const value  = {};
    for (const [name, rule] of Object.entries(schema)) {
        if (body[name] === undefined) continue;
        const err = checkField(name, rule, body[name]);
        if (err) errors.push(err);
        else value[name] = body[name];
    }

    if (errors.length > 0) {
        return { status: 422, body: { error: errors.join(' ; '), invalid: errors } };
    }

    return { value };
}

// Champs communs ─────────────────────────────────────────────────────────────
const event = (name) => ({ type: 'string', required: true, values: [name] });
const userId     = { type: 'id', required: true };
const devEui     = { type: 'string', nullable: true, maxLength: 64 };
const deviceName = { type: 'string', nullable: true, maxLength: 255 };
const ref        = { type: 'ref', nullable: true, maxLength: 64 };
const receivedAt = { type: 'string', nullable: true, maxLength: 64 };
const configId   = { type: 'id', nullable: true };
const duree      = { type: 'number', nullable: true, min: 0, max: 31_536_000 }; // secondes, 1 an max

const schemas = {
    ventilateur: {
        event:         event('ventilateur.update'),
        userId,
        devEui:        { ...devEui, required: true },
        deviceName,
        refActionneur: { ...ref, required: true },
        vitesse:       { type: 'number', required: true, min: 0, max: 100 },
        mode:          { type: 'number', required: true, integer: true, min: 0, max: 255 },
        modeLabel:     { type: 'string', nullable: true, maxLength: 32 },
        receivedAt,
        configId,
    },
    brumisateur: {
        event:         event('brumisateur.update'),
        userId,
        devEui:        { ...devEui, required: true },
        deviceName,
        refActionneur: { ...ref, required: true },
        etat:          { type: 'number', required: true, integer: true, min: 0, max: 255 },
        dureeOn:       duree,
        dureeOff:      duree,
        dureeTotale:   duree,
        receivedAt,
        configId,
    },
    capteur: {
        event:       event('capteur.mesure'),
        userId,
        capteurId:   { type: 'ref', required: true },
        devEui,
        nom:         { type: 'string', nullable: true, maxLength: 255 },
        temperature: { type: 'number', nullable: true, min: -60, max: 80 },
        humidite:    { type: 'number', nullable: true, min: 0, max: 100 },
        ith:         { type: 'number', required: true, min: 0, max: 150 },
        receivedAt,
    },
    alerte: {
        event:      event('alerte.ith'),
        userId,
        capteurId:  { type: 'ref', nullable: true },
        nom:        { type: 'string', nullable: true, maxLength: 255 },
        ith:        { type: 'number', required: true, min: 0, max: 150 },
        niveau:     { type: 'string', required: true, values: ['attention', 'alerte', 'critique'] },
        message:    { type: 'string', nullable: true, maxLength: 500 },
        receivedAt,
    },
};

module.exports = { validate, schemas };
