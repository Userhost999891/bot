// Discord OAuth2 authentication routes (ported)
const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');

const DISCORD_API = 'https://discord.com/api/v10';

function getCallbackUrl(req) {
  // Use CALLBACK_URL from env, or build from APP_URL, or from request
  if (process.env.CALLBACK_URL && !process.env.CALLBACK_URL.includes('localhost')) {
    return process.env.CALLBACK_URL;
  }
  if (process.env.APP_URL) {
    return `${process.env.APP_URL}/auth/callback`;
  }
  return process.env.CALLBACK_URL || `${req.protocol}://${req.get('host')}/auth/callback`;
}

// Redirect to Discord OAuth2
router.get('/discord', (req, res) => {
  const callbackUrl = getCallbackUrl(req);
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: 'identify guilds'
  });
  res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// OAuth2 callback
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/?error=no_code');

  try {
    const callbackUrl = getCallbackUrl(req);
    const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        scope: 'identify guilds'
      })
    });

    const tokenData = await tokenResponse.json();
    if (!tokenData.access_token) {
      console.error('Token error:', tokenData);
      return res.redirect('/?error=token_failed');
    }

    const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userResponse.json();

    const guildsResponse = await fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const guildsData = await guildsResponse.json();

    req.session.user = {
      id: userData.id,
      username: userData.username,
      discriminator: userData.discriminator,
      avatar: userData.avatar,
      guilds: guildsData
    };
    req.session.accessToken = tokenData.access_token;

    res.redirect('/dashboard.html');
  } catch (error) {
    console.error('Auth error:', error);
    res.redirect('/?error=auth_failed');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json(req.session.user);
});

module.exports = router;
