import { db, randomToken, sha256 } from "../_shared/db.ts";
import { handleOptions, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const { boardId, accessCode } = await req.json();
    if (!boardId) return json({ error: "boardId 必填" }, 400);

    let created = false;
    const boardRes = await db
      .from("couple_boards")
      .select("board_id,start_date,access_code_enabled,access_code_hash")
      .eq("board_id", boardId)
      .maybeSingle();
    if (boardRes.error) return json({ error: boardRes.error.message }, 400);

    let board = boardRes.data;
    if (!board) {
      created = true;
      const today = new Date().toISOString().slice(0, 10);
      const insertRes = await db
        .from("couple_boards")
        .insert({ board_id: boardId, start_date: today, access_code_enabled: false, access_code_hash: null })
        .select("board_id,start_date,access_code_enabled,access_code_hash")
        .single();
      if (insertRes.error) return json({ error: insertRes.error.message }, 400);
      board = insertRes.data;
    }

    if (board.access_code_enabled) {
      if (!accessCode) return json({ error: "需要访问码" }, 401);
      const hash = await sha256(String(accessCode));
      if (hash !== board.access_code_hash) return json({ error: "访问码错误" }, 401);
    }

    const sessionToken = randomToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const insertSession = await db.from("board_sessions").insert({
      session_token: sessionToken,
      board_id: boardId,
      expires_at: expiresAt,
    });
    if (insertSession.error) return json({ error: insertSession.error.message }, 400);

    return json({ sessionToken, created });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
