import worker from './api/_worker_core';

export const onRequest: PagesFunction<any> = async (context) => {
  const url = new URL(context.request.url);
  let cleanPath = url.pathname;
  try {
    cleanPath = decodeURIComponent(url.pathname).replace(/^\/\s+/, '/').replace(/\s+$/, '');
  } catch (_) {}

  if (cleanPath === '/sitemap.xml' || cleanPath === '/google8dc68fc0e32ac33e.html') {
    return worker.fetch(context.request, context.env);
  }
  return context.next();
};
