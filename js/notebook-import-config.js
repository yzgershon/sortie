/* Public release endpoint only. The server-side enabled flag is the kill switch.
   Provider credentials live only in the Cloudflare Worker secret. */
window.NOTEBOOK_IMPORT_CONFIG = { endpoint: 'https://sortie-notebook-reader.yzgershon.workers.dev/readNotebook' };
