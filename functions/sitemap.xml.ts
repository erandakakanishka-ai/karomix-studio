import worker from './api/_worker_core';

export const onRequest: PagesFunction<any> = (context) => {
  return worker.fetch(context.request, context.env);
};
