/* Public Firebase web configuration only. Never put credentials here.
 * Keep disabled until rules, roster and real-device Google sign-in are verified. */
window.CLOUD_CONFIG = {
  enabled: false,
  googleClientId: '', // Dedicated project's Google OAuth web client; same pinned redirect URI.
  firebase: { apiKey: '', authDomain: '', projectId: '', appId: '' }
};
