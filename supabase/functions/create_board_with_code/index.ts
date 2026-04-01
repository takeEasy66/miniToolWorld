import { db, sha256 } from "../_shared/db.ts";
import { handleOptions, json } from "../_shared/cors.ts";

function randomBoardId() {
  return "love-" + crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 8);
}

function randomCode8() {
  return String(Math.floor(10000000 + Math.random() * 90000000));
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;
  try {
    const boardId = randomBoardId();
    const accessCode = randomCode8();
    const accessCodeHash = await sha256(accessCode);
    const today = new Date().toISOString().slice(0, 10);

    const insert = await db
      .from("couple_boards")
      .insert({
        board_id: boardId,
        start_date: today,
        access_code_enabled: true,
        access_code_hash: accessCodeHash,
      });
    if (insert.error) return json({ error: insert.error.message }, 400);

    return json({ boardId, accessCode });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
