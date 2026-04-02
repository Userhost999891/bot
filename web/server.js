// Express web server — NarisMC Core Bot
const express = require('express');
const session = require('express-session');
const path = require('path');

function startWebServer(discordClient) {
  const app = express();
  const PORT = process.env.PORT || 4000;

  app.set('discordClient', discordClient);

  // Trust proxy for Railway/Render (needed for secure cookies behind reverse proxy)
  app.set('trust proxy', 1);

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  const isProduction = process.env.NODE_ENV === 'production' || process.env.APP_URL;

  app.use(session({
    secret: process.env.SESSION_SECRET || 'narismc-core-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: isProduction ? true : false,
      sameSite: isProduction ? 'lax' : 'lax',
      httpOnly: true
    }
  }));

  // Static files
  app.use(express.static(path.join(__dirname, 'public')));

  // Routes
  app.use('/auth', require('./routes/auth'));
  app.use('/api', require('./routes/api')(discordClient));
  app.use('/api/tickets', require('./routes/tickets-api')(discordClient));
  app.use('/api/announcements', require('./routes/announcements-api')(discordClient));
  app.use('/api/rewards', require('./routes/rewards-api')(discordClient));
  app.use('/', require('./routes/dashboard'));

  // Health check endpoint (for hosting platforms)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
  });

  // Bind to 0.0.0.0 for hosting (not just localhost)
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Panel webowy dostępny pod: http://localhost:${PORT}`);
  });

  return app;
}

module.exports = startWebServer;
