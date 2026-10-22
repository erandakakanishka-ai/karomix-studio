import worker from "../../src/worker";

// Automatically enables all /api/* + D1 routes when deployed via Cloudflare Pages too!
export const onRequest = (context: any) => {
  return worker.fetch(context.request, context.env);
};
