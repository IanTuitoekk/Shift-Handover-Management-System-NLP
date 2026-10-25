var express = require('express');
var logger = require('morgan');
var cors = require('cors');
require('dotenv').config();

var indexRouter = require('./routes/index');
var handoverRouter = require('./routes/handovers');
var authRouter = require('./routes/auth');
var taskRouter = require('./routes/tasks');
var notificationRouter = require('./routes/notifications');
var userRouter = require('./routes/users');
var statsRouter = require('./routes/stats');
var insightsRouter = require('./routes/insights');
var configRouter = require('./routes/config');
var helmet = require('helmet');




var app = express();

// Behind a reverse proxy (Caddy in Docker, or a hosting platform's), trust its X-Forwarded-For so
// rate limits and logs see each person's address instead of the proxy's. TRUST_PROXY is the number
// of proxies in front of the app (e.g. 1); unset in development, where there is none.
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  app.set('trust proxy', Number.isInteger(hops) ? hops : process.env.TRUST_PROXY);
}

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(helmet());

app.use('/', indexRouter);
app.use('/api/handovers', handoverRouter);
app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/users', userRouter);
app.use('/api/stats', statsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/config', configRouter);

// 404 handler
app.use(function (req, res) {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(function (err, req, res, next) {
  console.error(err.stack); // full detail stays server-side only

  const status = err.status || 500;
  const message = status === 500 ? 'Internal server error' : err.message;

  res.status(status).json({ error: message });
});

module.exports = app;