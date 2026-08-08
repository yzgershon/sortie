/* תחקיר — who may open the app.
 *
 * This is the only file to edit to turn the gate on, off, or change who gets in.
 * Leave clientId empty and the gate does not exist: the app opens exactly as it
 * did before. That is deliberate, so a half-finished setup can never lock
 * anybody out of their own flights.
 */
(function (g) {
  'use strict';

  g.AUTH_CONFIG = {

    /* From Google Cloud Console → APIs & Services → Credentials →
       OAuth client ID → Web application. Paste the whole thing, it ends in
       .apps.googleusercontent.com. Empty string = no gate. */
    clientId: '',

    /* Who is allowed in. Either a plain address or its SHA-256 hash, lowercase
       hex. Hashed here on purpose: this repo is public, and the addresses have
       no business being readable in it. Both forms work.
         node dev/hash-email.js someone@gmail.com
       An empty list blocks everyone, which is the safe way to fail. */
    allow: [
      '9d8a03a9a2c63f05d79602af80d164f1a58644686ec77f2890e04acc909ca520',   // Evyatar
      'afeb12968cba56fdae5ede45aab051d73fc03edec3f1846269beefbb343b6e6c'    // Yish
    ],

    /* How long a sign-in lasts before Google is asked again. Long on purpose:
       the session is read from the device, so the app still opens with no
       signal, which matters more here than a short window. */
    sessionDays: 30,

    /* Where Google sends him back. Left empty it uses the page's own address,
       which is right in every normal case. Set it only if that address and the
       one registered in Google Cloud Console have to differ. */
    redirectUri: ''
  };
})(window);
