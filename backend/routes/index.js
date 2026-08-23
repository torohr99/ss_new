const express = require('express');
const router = express.Router();

// Future route files will be imported here
// const userRoutes = require('./users');
// const postRoutes = require('./posts');

// router.use('/users', userRoutes);
// router.use('/posts', postRoutes);

router.get('/', (req, res) => {
  res.json({ message: 'Welcome to the SportSmack API' });
});

module.exports = router;
