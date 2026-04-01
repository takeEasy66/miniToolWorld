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
    const { sessionToken } = await req.json();
    if (!sessionToken) return json({ error: "sessionToken 必填" }, 400);
    const boardId = await boardFromSession(sessionToken);
    if (!boardId) return json({ error: "会话无效" }, 401);

    const boardRes = await db
      .from("couple_boards")
      .select("board_id,start_date,access_code_enabled")
      .eq("board_id", boardId)
      .single();
    if (boardRes.error) return json({ error: boardRes.error.message }, 400);

    const recordsRes = await db
      .from("checkins")
      .select("*")
      .eq("board_id", boardId);
    if (recordsRes.error) return json({ error: recordsRes.error.message }, 400);

    return json({
      board: {
        boardId,
        startDate: boardRes.data.start_date,
        accessCodeEnabled: !!boardRes.data.access_code_enabled,
      },
      records: recordsRes.data || [],
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
