// Read-only Canvas proxy — STUB. Replaced by the school-assistant build
// (docs/PLAN.md §Worker). Contract:
//
//   GET /api/canvas/proxy?host=<canvas host>&path=</api/v1/...>
//   Authorization: Bearer <student's Canvas token>
//
// Forwards the GET to https://<host>/api/v1<path> with the same bearer token,
// only for allow-listed hosts, and returns the JSON plus the pagination Link
// header. Never stores the token. Never issues anything but GET.

export async function handleCanvas() {
  return new Response(JSON.stringify({ error: 'canvas_proxy_not_built' }), {
    status: 501,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
