const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const adminMiddleware = require('../middleware/admin');
const metrics = require('../services/metrics');

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/', (req, res) => {
  return res.json(metrics.snapshot());
});

module.exports = router;
