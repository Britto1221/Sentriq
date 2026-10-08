import { handleAuthProxy } from "@/server/auth-proxy";

interface RouteContext {
  params: Promise<{ segments: string[] }>;
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { segments } = await context.params;
  return handleAuthProxy(request, segments);
}

export const GET = proxy;
export const POST = proxy;
