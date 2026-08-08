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
    clientId: '790989398891-df36sea2it2rbupm466ae8tknsg28h31.apps.googleusercontent.com',

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

    /* Where Google sends him back. PINNED, and it has to stay pinned.
       Left empty this follows the page's own address, and there are two of
       those: the installed app starts at /sortie/index.html (the manifest's
       start_url) while Safari at the plain URL is /sortie/. Google treats those
       as different redirect URIs and only the first is registered, so following
       the page would give redirect_uri_mismatch to anyone who opened the plain
       URL. Pinning it means both routes come back to the same place, which is
       the same app and the same origin either way.
       Change this only alongside the Authorized redirect URIs in Google Cloud
       Console → Credentials, and re-run: node dev/check-oauth.js */
    redirectUri: 'https://yzgershon.github.io/sortie/index.html'
  };
})(window);
