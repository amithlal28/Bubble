export async function POST(request: Request) {
  return Response.json({ ok: true, msg: 'stream resolver is alive' });
}
