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

    /* Who is allowed in: SHA-256 of the address, lowercase hex. A plain address
       works too, but do not put one here — this repo is public and a course
       roster of personal addresses has no business being readable in it.
         node dev/hash-email.js someone@gmail.com
       An empty list blocks everyone, which is the safe way to fail.

       The comments are first names only, deliberately: enough to find whose
       line to delete, not enough to reconstruct an address. The full mapping
       lives in dev/roster.json, which is gitignored and stays on his machine.

       Hashing here is obfuscation, not protection. Anyone holding a list of
       candidate addresses can hash them and compare, and the salt would be in
       this file too. It stops the roster being READ off a public repo, which
       is the thing worth stopping. */
    allow: [
      '2614af7ee7e8c53ef4a0e77dff0b2741a7203d30f5cf562694a14b13ef43c7f0',   // 01 Amir C
      'a9c3e9d0c53b58efce25f1db355b3c76949e96385e4cbe174036f542a9d16054',   // 02 Alon Az
      'ad9c4134447e1be547483d80c15e920ee9b96e353d0217ccccd89fef9f77dd16',   // 03 Yoav Ad
      '98de5041b2d78a6c7705803706ff8359ae353b6ac0f3536a533125ba93e00f8e',   // 04 Tomer Ap
      '9d8a03a9a2c63f05d79602af80d164f1a58644686ec77f2890e04acc909ca520',   // 05 Evyatar
      '5b7778f288a1bc0845c92b7e69d37227237144fd43bf953abaf52dbbf530f81a',   // 06 Eyal Ya
      '5fa828b86d4512e0fd5b5993621ea5a41b7978d0116f13e12490c1afa2ea8dc5',   // 07 Yuval Fr
      'b7f89e9f0e1415ae5af93bb77022d49952e1d02c990e481afaed363bbfafff24',   // 08 Yuval Hg
      'd50d82301ebdd12c073e1ff284df29e360d8512e12535728d93210b657a8fd86',   // 09 Alon Be
      '609c5fe327dc3591cbd9b16505c86aecb38e65a265ba822cbdf3333a35bf6f7a',   // 10 Yuval Hp
      '38a09840f8a8763322fd2ccb66dcef22919ecda3be8f165a6f5b1aadf2fc68f1',   // 11 Guy Da
      'f4fe5972d5f51ebec5c98da4a6bbb82291d6b61ff7420b674f809a9d6a9d9fa3',   // 12 Liam Be
      '956b113888b639ad9dff2ebc3106866d9e682b8fa1a02d8766af92bd43941ef7',   // 13 Alon Go
      'b112c231421617b3d032ab3451ba1781b5a9089602aec03510e8f201cb84e7cc',   // 14 Noam Le
      'bcece65ee57082e24436d9868545233e70fd96c0064ce4d17def463b982c7640',   // 15 Eyal Sh
      '16544321969c956e4dcafaa7fa5b291bf4c2a3d2c0785f20017955a56eb21ac2',   // 16 R Lavie
      'bd7cab5365b6daeb7e9ab14c6c2b548028d348aea25edda0bb3b076c1e725749',   // 17 Alma No
      'cebf1e5c1f08f2a71babe70a9c820f1baf079bcc38586503ec3dd91cd8b4e464',   // 18 Gal Oh
      'cc81bf84abd3974663b843eaaccf9e80adffa0eeb57d736eaae1131eb591281b',   // 19 Yuval (4th)
      '7dc7a50f9f9314e04dc2b5132d7be19514b2c1161425de904e991f74c0f50e4c',   // 20 Bar Gl
      'f060175be0128f107ae34be95613ec7bd20b3e6415effbfe16b149b4b666ab61',   // 21 Ben Sh
      '5dab1702c10f9777737bc8a4a9cbdcdcf2cc853cdb02f56b140d499f77d2dd70',   // 22 Yair Za
      '7644a2de8e12a1a2bb92c9f994f27e2683f686320fa877a6d3f87d2fee826baa',   // 23 Yishai Am
      'afeb12968cba56fdae5ede45aab051d73fc03edec3f1846269beefbb343b6e6c',   // 24 Yish
      // Added 2026-08-08 to test the iOS side: an iPhone, and an account that
      // does NOT own the Google Cloud project, which is the pair we could not
      // test otherwise. Safe to delete this line once that is answered.
      '09c50b3124255f866d39fe8837c792f193bd3836c5bda2a05d5ee4c7e32f9ab8'    // 25 iOS test
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
