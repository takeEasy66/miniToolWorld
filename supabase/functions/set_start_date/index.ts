import { db } from "../_shared/db.ts";
import { handleOptions, json } from "../_shared/cors.ts";

async function boardFromSession(sessionToken: string) {
  const now = new Date().toISOString();
  const sessionRes = await db
    .from("board_sessions")
    .select("board_id,expires_at")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (sessionRes.error || !sessionRes.data) return null;
  if (sessionRes.data.expires_at <= now) return null;
  return sessionRes.data.board_id;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const { sessionToken, startDate } = await req.json();
    if (!sessionToken || !startDate) return json({ error: "sessionToken/startDate 必填" }, 400);
    const boardId = await boardFromSession(sessionToken);
    if (!boardId) return json({ error: "会话无效" }, 401);
    const update = await db.from("couple_boards").update({ start_date: startDate }).eq("board_id", boardId);
    if (update.error) return json({ error: update.error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
