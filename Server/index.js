// Lightweight proxy + smart extractor for CricHeroes JSON
import express from "express";
import fetch from "node-fetch";

const app = express();
const PORT = process.env.PORT || 3000;

// CORS allow (taaki GitHub Pages se call ho sake)
app.use((_, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  next();
});

// Utility: deep find first key match
function deepFind(obj, keys) {
  let ans = null;
  function walk(o) {
    if (!o || ans) return;
    if (typeof o !== "object") return;
    for (const k of Object.keys(o)) {
      if (ans) break;
      const low = k.toLowerCase();
      if (keys.some(key => low === key || low.includes(key))) {
        // prefer numeric/score-ish values
        ans = { key: k, value: o[k] };
        break;
      }
      walk(o[k]);
    }
  }
  walk(obj);
  return ans?.value;
}

// GET /score?url=<encoded _next/data/.../index.json>
app.get("/score", async (req, res) => {
  try {
    const target = req.query.url || process.env.CRICHEROES_URL;
    if (!target) return res.status(400).json({ error: "Missing url" });
    // safety: whitelist domain
    if (!/^https:\/\/(www\.)?cricheroes\.com\/_next\/data\//.test(target))
      return res.status(400).json({ error: "Invalid host" });

    const r = await fetch(target, {
      headers: {
        // kuch servers referer/user-agent check karte hain
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "Accept": "application/json,text/plain,*/*",
        "Referer": "https://cricheroes.com/"
      }
    });

    if (!r.ok) return res.status(r.status).json({ error: "Upstream failed" });
    const raw = await r.json();

    // Try common Next.js shapes
    const root =
      raw?.pageProps?.data ||
      raw?.pageProps ||
      raw?.props?.pageProps ||
      raw;

    // Heuristic extraction (works even if exact paths unknown)
    const teamA =
      deepFind(root, ["teama", "battingteam", "team1", "teama_name", "hometeam"]) ||
      deepFind(root, ["team", "name"]);
    const teamB =
      deepFind(root, ["teamb", "bowlingteam", "team2", "teamb_name", "awayteam"]);
    const scoreText =
      deepFind(root, ["score_string", "scorestr", "score"]) ||
      (() => {
        const r = deepFind(root, ["runs", "r"]);
        const w = deepFind(root, ["wickets", "wk", "w"]);
        const o = deepFind(root, ["overs", "ov"]);
        if (r != null && w != null && o != null) return `${r}/${w} (${o} ov)`;
        if (r != null && w != null) return `${r}/${w}`;
        return null;
      })();

    const striker =
      deepFind(root, ["striker", "batsman1", "batter1", "onstrike"]) ||
      deepFind(root, ["batsman"]);
    const nonStriker =
      deepFind(root, ["nonstriker", "batsman2", "batter2"]);
    const bowler =
      deepFind(root, ["bowler", "currentbowler"]);

    const overs =
      deepFind(root, ["overs", "ov"]);

    // API response for overlay
    res.json({
      ok: true,
      teamA: typeof teamA === "string" ? teamA : teamA?.name || teamA?.teamName || null,
      teamB: typeof teamB === "string" ? teamB : teamB?.name || teamB?.teamName || null,
      scoreText: typeof scoreText === "string" ? scoreText : null,
      overs: typeof overs === "string" ? overs : (overs?.toString?.() || null),
      striker: typeof striker === "string" ? striker : striker?.name || null,
      nonStriker: typeof nonStriker === "string" ? nonStriker : nonStriker?.name || null,
      bowler: typeof bowler === "string" ? bowler : bowler?.name || null,
      // raw passthrough for debugging (optional)
      // raw
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

app.get("/", (_, res) => res.send("CricHeroes overlay proxy up ✅"));

app.listen(PORT, () => console.log("Server on", PORT));
