import worker from './api/_worker_core';

export const onRequest: PagesFunction<any> = async (context) => {
  const url = new URL(context.request.url);
  let cleanPath = url.pathname;
  try {
    cleanPath = decodeURIComponent(url.pathname).replace(/^\/\s+/, '/').replace(/\s+$/, '');
  } catch (_) {}

  if (
    cleanPath === '/sitemap.xml' ||
    cleanPath === '/google8dc68fc0e32ac33e.html' ||
    cleanPath === '/blog' ||
    cleanPath === '/blog/' ||
    cleanPath.startsWith('/blog/') ||
    cleanPath === '/tools' ||
    cleanPath === '/tools/' ||
    cleanPath.startsWith('/tools/')
  ) {
    return worker.fetch(context.request, context.env);
  }
  return context.next();
};
