/* Public Firebase web configuration only. Never put credentials here.
 * Disabled until the release and real-device Google sign-in are verified. */
window.CLOUD_CONFIG = {
  enabled: false,
  googleClientId: '', // Keep the existing Sortie Google client, safelisted in Firebase.
  firebase: {
    apiKey: 'AIzaSyAKrKu00GF_NY2NyPD97wmQKQETzeV5gm0',
    authDomain: 'sortie-7900c.firebaseapp.com',
    projectId: 'sortie-7900c',
    appId: '1:959375176248:web:958e6f90af25de0e1eeccd'
  }
};
