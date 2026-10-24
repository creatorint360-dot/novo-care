'use strict';
// The words this system uses (see lib/labels.js). Public: it holds no private data,
// and the sign-in screen needs it before anybody is signed in.

const { route, json } = require('../lib/http');
const { labels } = require('../lib/labels');

module.exports = route({ methods: ['GET'], auth: false }, async ({ res }) => json(res, 200, labels()));
