// Wspólne middleware autoryzacji panelu WWW
function authMiddleware(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// Wymaga, żeby zalogowany użytkownik był administratorem/właścicielem serwera z req.params.id
async function adminParamMiddleware(req, res, next) {
  const userGuilds = req.session?.user?.guilds || [];
  const g = userGuilds.find(g => g.id === req.params.id);
  if (!g) return res.status(403).json({ error: 'Brak uprawnień do tego serwera' });

  let isAdmin = g.owner === true;
  try {
    if (!isAdmin && g.permissions) {
      isAdmin = (BigInt(g.permissions) & 8n) === 8n;
    }
  } catch (e) {}

  if (!isAdmin) return res.status(403).json({ error: 'Wymagane uprawnienia administratora' });
  next();
}

module.exports = { authMiddleware, adminParamMiddleware };
