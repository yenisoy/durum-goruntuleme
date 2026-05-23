const express = require('express');
const router = express.Router();

const { uniqKodSorgula } = require('../controllers/queryController');
const { secretKeyKontrol } = require('../middleware/secretKey');

router.post('/sorgula', secretKeyKontrol, uniqKodSorgula);

module.exports = router;
