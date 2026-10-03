var express = require('express');
var logger = require('morgan');
var cors = require('cors');
require('dotenv').config();

var indexRouter = require('./routes/index');
var handoverRouter = require('./routes/handovers');

var app = express();

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use('/', indexRouter);
app.use('/api/handovers', handoverRouter);

// 404 handler
app.use(function (req, res) {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: err.message });
});

module.exports = app;