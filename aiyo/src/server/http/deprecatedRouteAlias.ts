type RouteHandler = (request: Request, ...args: never[]) => Promise<Response> | Response;

export function deprecatedRouteAlias<T extends RouteHandler>(
  handler: T,
  canonicalPath: string,
): T {
  return (async (request: Request, ...args: never[]) => {
    const response = await handler(request, ...args);
    response.headers.set("Deprecation", "true");
    response.headers.set("Link", `<${canonicalPath}>; rel=\"successor-version\"`);
    return response;
  }) as T;
}
