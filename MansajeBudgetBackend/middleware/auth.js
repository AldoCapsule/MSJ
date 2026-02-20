const admin = require('firebase-admin');

/**
 * Middleware: verify Firebase ID token from Authorization header.
 * Sets req.uid on success.
 */
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.uid = decodedToken.uid;
    req.email = decodedToken.email;
    next();
  } catch (error) {
    console.error('[AUTH] Token verification failed:', error.message);
    return res.status(401).json({ error: 'Unauthorized: invalid or expired token' });
  }
}

module.exports = { verifyFirebaseToken };
