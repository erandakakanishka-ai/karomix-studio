export async function onRequest() {
  return new Response('google-site-verification: google8dc68fc0e32ac33e.html', {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
}
