interface Env {
  GITHUB_CLIENT_SECRET: string;
}

export default {
  async fetch(req: Request, _env: Env): Promise<Response> {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    return Response.json({ ok: true, stub: true });
  },
};
