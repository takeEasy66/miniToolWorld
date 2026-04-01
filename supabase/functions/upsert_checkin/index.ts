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
    const { sessionToken, item_id, title, completed, note, updated_at } = await req.json();
    if (!sessionToken) return json({ error: "sessionToken 必填" }, 400);
    if (!item_id || !title) return json({ error: "item_id/title 必填" }, 400);
    const boardId = await boardFromSession(sessionToken);
    if (!boardId) return json({ error: "会话无效" }, 401);

    const upsert = await db.from("checkins").upsert({
      board_id: boardId,
      item_id,
      title,
      completed: !!completed,
      note: note || "",
      updated_at: updated_at || new Date().toISOString(),
    }, { onConflict: "board_id,item_id" });
    if (upsert.error) return json({ error: upsert.error.message }, 400);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
