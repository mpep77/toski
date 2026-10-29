import React, { useState, useRef, useEffect } from "react";
import RESORTS from "../data/resorts.json";
import CONFIG from "../data/config.json"; // season window + verdict thresholds (the server reads the same file)


// ─── Pass config ──────────────────────────────────────────────────────────────
const PASSES = {
  none: { label: "Day ticket", short: "Day ticket", color: "#546A80" },
  ikon: { label: "Ikon",       short: "Ikon",       color: "#2563EB" },
  epic: { label: "Epic",       short: "Epic",       color: "#0369A1" },
  indy: { label: "Indy",       short: "Indy",       color: "#B45309" },
};

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  bg:      "#F0F4F8",  // cool snow white
  surf:    "#FFFFFF",  // card white
  raise:   "#E4ECF4",  // depressed input / raised chip
  bdr:     "#CBD8E8",  // border
  bdrHi:   "#93B0CC",  // active border
  txt:     "#0C1E30",  // near-black navy
  sub:     "#2E4A62",  // body copy
  mid:     "#5A7A92",  // muted labels
  dim:     "#7C97AB",  // very muted (still legible)
  accent:  "#1D6FB8",  // ice blue accent — CTA, active states
  accentLo:"#E8F2FC",  // accent tint
  accentBdr:"#93C4E8", // accent border
  go:      "#166534",  // deep forest green — YES
  goBg:    "#DCFCE7",
  goBdr:   "#86EFAC",
  warn:    "#92400E",  // deep amber — MAYBE
  warnBg:  "#FDF6E3",
  warnBdr: "#D9B96A",
  stop:    "#991B1B",  // deep red — NO
  stopBg:  "#FEE2E2",
  stopBdr: "#FCA5A5",
};

const validCity = (c) => (c.match(/[A-Za-z\u00C0-\u024F]/g) || []).length >= 2;

// ─── Score colour ─────────────────────────────────────────────────────────────
// Same cut-offs the server uses for YES / MAYBE / NO, so a score's colour always matches its verdict.
const tone = (score) => (score >= CONFIG.verdict.yes ? C.go : score >= CONFIG.verdict.maybe ? C.warn : C.stop);

// ─── Quip bank ────────────────────────────────────────────────────────────────
const QUIPS = {
  YES: [
    "Set your alarm. This one's worth it.",
    "The mountain's ready. Are you?",
    "Stop reading this and start driving.",
    "First chair pays off this weekend.",
    "Conditions like this don't come around every weekend.",
    "Your coworkers will be jealous. Go.",
    "This is why you have the pass.",
    "The forecast is doing you a favor. Use it.",
    "Good snow, manageable crowds. No excuses.",
    "It's going to be a good one. Don't miss it.",
  ],
  MAYBE: [
    "Not pretty, but you've skied worse.",
    "Pack your patience and your poles.",
    "The mountain's open. That's about the best we can say.",
    "Go early, leave before the ice sets.",
    "Manage your expectations and you'll have a fine day.",
    "It's not a powder day, but neither is most of February.",
    "Groomed runs only. Save the trees for next week.",
    "You'll have fun. Just don't Instagram the conditions.",
    "Marginal snow, real mountain. Could be worse.",
    "East Coast skiing. You know what you signed up for.",
  ],
  NO: [
    "Even we can't make this one work.",
    "The mountain will still be there next weekend.",
    "Sit this one out. Seriously.",
    "Save the miles for when it matters.",
    "Some weekends you take the L and watch film.",
    "Not every weekend is a ski weekend. This is one of them.",
    "The drive alone isn't worth what you'll find up there.",
    "Rest up. Better conditions are coming.",
    "Your skis will thank you for waiting.",
    "Hard pass. And we love skiing.",
  ],
};

function pickQuip(verdict, score) {
  const bank = QUIPS[verdict] || QUIPS.MAYBE;
  const i = Number.isInteger(score) ? ((score % bank.length) + bank.length) % bank.length : 0;
  return bank[i];
}

// Guards against a partially-malformed AI response reaching render and
// blanking the page — throws a plain Error (caught by analyze()'s try/catch)
// rather than letting React crash on a missing nested field.
function validateVerdict(p) {
  if (!p || typeof p !== "object") throw new Error("Empty response");
  if (!["YES", "NO", "MAYBE"].includes(p.verdict)) throw new Error("Bad verdict");
  if (!Number.isFinite(p.score)) throw new Error("Bad score");
  if (typeof p.headline !== "string" || !p.headline) throw new Error("Missing headline");
  if (typeof p.summary !== "string" || !p.summary) throw new Error("Missing summary");
  const c = p.conditions;
  for (const k of ["snow", "weather", "crowds", "drive"]) {
    if (!c || !c[k] || !Number.isFinite(c[k].score)) {
      // Fill in a safe default rather than failing the whole verdict —
      // one missing sub-score shouldn't nuke an otherwise good response.
      p.conditions = p.conditions || {};
      p.conditions[k] = c?.[k]?.score != null ? c[k] : { score: 50, note: "—" };
    }
  }
  if (!Array.isArray(p.resorts) || p.resorts.length === 0) throw new Error("No resorts");
  p.resorts = p.resorts.filter(r => r && typeof r.name === "string" && Number.isFinite(r.score));
  if (p.resorts.length === 0) throw new Error("No valid resorts");
  if (typeof p.tip !== "string") p.tip = "";
}

// ─── Weekend helpers ──────────────────────────────────────────────────────────
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Season window (Nov 15 - May 1). Dates are "MM-DD" strings, so plain string comparison works.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const mdLabel = (md) => `${MONTHS[parseInt(md.slice(0, 2), 10) - 1]} ${parseInt(md.slice(3), 10)}`;
const mdInSeason = (md) => md >= CONFIG.season.open || md <= CONFIG.season.close;
// Local dev (npm run dev / vercel dev) skips the gate so you can test in the off-season; production builds never do.
const SEASON_BYPASS = import.meta.env.DEV;

function nextWeekends() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); // Saturday: today counts
  return Array.from({ length: 4 }, (_, i) => {
    const s = new Date(d); s.setDate(s.getDate() + i * 7);
    const e = new Date(s); e.setDate(e.getDate() + 1);
    const f = (x) => x.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { value: ymd(s), label: `${f(s)} – ${f(e)}` };
  }).filter((w) => SEASON_BYPASS || mdInSeason(w.value.slice(5))); // only in-season weekends are offered
}

// ─── Verdict style ────────────────────────────────────────────────────────────
function vStyle(v) {
  if (v === "YES") return { color: C.go,   bg: C.goBg,   bdr: C.goBdr,   shadow: "0 0 0 4px rgba(22,101,52,.08), 0 4px 24px rgba(22,101,52,.12)" };
  if (v === "NO")  return { color: C.stop,  bg: C.stopBg, bdr: C.stopBdr, shadow: "0 0 0 4px rgba(153,27,27,.08), 0 4px 24px rgba(153,27,27,.12)" };
  return                  { color: C.warn,  bg: C.warnBg, bdr: C.warnBdr, shadow: "0 0 0 4px rgba(146,64,14,.08), 0 4px 24px rgba(146,64,14,.12)" };
}

const LOAD_MSGS = [
  "Checking snowpack…",
  "Reading storm reports…",
  "Scanning the forecast…",
  "Calculating drive time…",
  "Sizing up the crowds…",
  "Ranking your options…",
  "Writing your verdict…",
];

// ─── Sub-components ───────────────────────────────────────────────────────────
function ScoreBar({ label, score, note }) {
  const c = tone(score);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: C.sub, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 12, color: c, fontWeight: 600 }}>{note}</span>
      </div>
      <div style={{ height: 4, background: C.raise, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: c, borderRadius: 2, transition: "width 1s ease" }} />
      </div>
    </div>
  );
}

function DataChip({ label, value, color }) {
  return (
    <div style={{ background: C.raise, border: `1px solid ${C.bdr}`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: color || C.txt, letterSpacing: -.3 }}>{value}</div>
      <div style={{ fontSize: 9, color: C.mid, fontWeight: 600, marginTop: 3, textTransform: "uppercase", letterSpacing: .8 }}>{label}</div>
    </div>
  );
}

function VibeTag({ label }) {
  const c = /\b(ice|icy|thin|limited|closed|rain|slush|mud|no|little|low|sparse|bare)\b/i.test(label) ? C.stop
    : /crowd|busy|mlk|holiday|lines/i.test(label) ? C.stop
    : /powder|fresh|snow|dump|storm/i.test(label) ? C.go
    : C.accent;
  return (
    <span style={{
      display: "inline-block", padding: "3px 9px", borderRadius: 20,
      marginRight: 5, marginBottom: 5,
      fontSize: 11, fontWeight: 600,
      background: c === C.go ? C.goBg : c === C.stop ? C.stopBg : C.accentLo,
      border: `1px solid ${c === C.go ? C.goBdr : c === C.stop ? C.stopBdr : C.accentBdr}`,
      color: c,
    }}>{label}</span>
  );
}

// ─── Error boundary — last line of defense against a crashed render ───────────
class ResultBoundary extends React.Component {
  constructor(props) { super(props); this.state = { broke: false }; }
  static getDerivedStateFromError() { return { broke: true }; }
  componentDidCatch(err) { console.error("toski render error:", err); }
  render() {
    if (this.state.broke) {
      return (
        <div style={{ background: C.stopBg, border: `1px solid ${C.stopBdr}`, borderRadius: 12, padding: "18px", textAlign: "center", marginBottom: 16 }}>
          <div style={{ fontSize: 24, marginBottom: 8 }}>⛔</div>
          <p style={{ fontSize: 13, color: C.stop, fontWeight: 500, marginBottom: 14, lineHeight: 1.6 }}>
            That verdict came back malformed. Try again.
          </p>
          <button onClick={() => { this.setState({ broke: false }); this.props.onReset?.(); }} style={{
            background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 8,
            color: C.sub, fontSize: 13, fontWeight: 600, padding: "9px 20px",
            cursor: "pointer", fontFamily: "inherit",
          }}>Start over →</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ResortCard({ name, rank, score, why, insider, tags, stats, passKey }) {
  const r   = RESORTS.find(x => x.name === name) || null;
  const top = rank === 1;
  const pm  = passKey !== "none" ? PASSES[passKey] : null;
  const [open, setOpen] = useState(rank === 1);

  return (
    <div style={{
      background: C.surf,
      border: `1px solid ${top ? C.goBdr : C.bdr}`,
      borderRadius: 12, marginBottom: 10, overflow: "hidden",
      boxShadow: top ? "0 2px 12px rgba(22,101,52,.08)" : "0 1px 4px rgba(12,30,48,.04)",
    }}>
      {/* Tappable header */}
      <div role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(o => !o); } }}
        style={{ padding: "14px 16px", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{
                fontSize: 11, fontWeight: 700, color: top ? C.go : C.mid,
                background: top ? C.goBg : C.raise,
                border: `1px solid ${top ? C.goBdr : C.bdr}`,
                padding: "1px 7px", borderRadius: 20,
              }}>#{rank}</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: C.txt, letterSpacing: -.3 }}>{name}</span>
            </div>
            <div style={{ fontSize: 11, color: C.mid, marginBottom: tags?.length ? 8 : 0 }}>
              {r ? <>{r.state} · {r.vertical?.toLocaleString()}ft · {r.trails} trails</> : "East Coast"}
              {pm && <span style={{ color: pm.color, marginLeft: 8, fontWeight: 600 }}>· {pm.short}</span>}
            </div>
            {tags?.length > 0 && (
              <div>{tags.map((t, i) => <VibeTag key={t + i} label={t} />)}</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, marginLeft: 14, flexShrink: 0 }}>
            <div style={{
              fontSize: 18, fontWeight: 800, color: tone(score), letterSpacing: -.5,
            }}>{score}</div>
            <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>{open ? "Less ↑" : "More ↓"}</div>
          </div>
        </div>
      </div>

      {/* Expandable detail */}
      {open && (
        <div style={{ borderTop: `1px solid ${top ? C.goBdr : C.bdr}`, padding: "12px 16px" }}>
          {stats && Object.keys(stats).length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
              {Object.entries(stats).map(([k, v]) => (
                <DataChip key={k} label={k} value={v}
                  color={/snow/i.test(k) ? C.go : /base/i.test(k) ? C.accent : undefined}
                />
              ))}
            </div>
          )}
          <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.75, margin: "0 0 12px" }}>{why}</p>
          {insider && (
            <div style={{ background: C.accentLo, borderRadius: 8, padding: "10px 12px", borderLeft: `3px solid ${C.accent}` }}>
              <div style={{ fontSize: 9, color: C.accent, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Insider tip</div>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.65, fontStyle: "italic" }}>{insider}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [city, setCity]                 = useState("");
  const [cityError, setCityError]       = useState("");
  const [weekend, setWeekend]           = useState("");
  const [pass, setPass]                 = useState("none");
  const [loading, setLoading]           = useState(false);
  const [loadIdx, setLoadIdx]           = useState(0);
  const [loadPct, setLoadPct]           = useState(0);
  const [result, setResult]             = useState(null);
  const [error, setError]               = useState(null);
  const [copied, setCopied]             = useState(false);
  const [shareFailed, setShareFailed]   = useState(false);
  const [stamped, setStamped]           = useState(false);
  const [quipIn, setQuipIn]             = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const resultRef = useRef(null);
  const inputRef  = useRef(null);
  const weekends  = nextWeekends();

  const today     = ymd(new Date()).slice(5);
  const offSeason = !SEASON_BYPASS && (!mdInSeason(today) || weekends.length === 0);
  const passResorts = pass === "none" ? RESORTS : RESORTS.filter(r => r.passes.includes(pass));
  const cityOk  = validCity(city);
  const ready   = cityOk && !!weekend;

  useEffect(() => {
    if (!result) return;
    setStamped(false); setQuipIn(false);
    const a = setTimeout(() => setStamped(true), 100);
    const b = setTimeout(() => setQuipIn(true), 580);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, [result]);

  const validateCity = () => {
    if (!city.trim()) { setCityError(""); return; }
    if (!validCity(city)) {
      setCityError("Enter a valid city name");
    } else {
      setCityError("");
    }
  };

  const analyze = async () => {
    if (!ready || loading || offSeason) return;
    const picked = weekends.find(w => w.value === weekend);
    if (!picked) return;
    const ctx = { city: city.trim(), weekend: picked.value, label: picked.label, pass };
    setLoading(true); setResult(null); setError(null); setConfirmReset(false);
    setLoadIdx(0); setLoadPct(0);

    let i = 0;
    const ticker = setInterval(() => {
      i++;
      setLoadIdx(Math.min(i, LOAD_MSGS.length - 1));
      setLoadPct(Math.min(92, Math.round((i / LOAD_MSGS.length) * 100)));
    }, 2800);

    // Minimum load time so the progress bar doesn't flash; hard timeout so nobody is stuck forever.
    const minWait = new Promise(r => setTimeout(r, 2000));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 58000);

    try {
      const [res] = await Promise.all([
        fetch("/api/verdict", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city: ctx.city, weekend: ctx.weekend, pass: ctx.pass }),
          signal: controller.signal,
        }),
        minWait,
      ]);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const err = new Error(`Server returned ${res.status}`);
        err.userMessage = data?.error?.message;
        throw err;
      }
      const parsed = data?.verdict;
      validateVerdict(parsed); // belt and suspenders — the server already validates
      parsed.quip = pickQuip(parsed.verdict, parsed.score);
      parsed.ctx = ctx; // snapshot, so edits made while loading can't change this ticket
      setLoadPct(100);
      await new Promise(r => setTimeout(r, 300));
      setResult(parsed);
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (err) {
      console.error("toski:", err);
      if (err.name === "AbortError") setError("That took too long. The mountain's not going anywhere. Try again.");
      else if (err.userMessage) setError(err.userMessage);
      else if (err instanceof TypeError) setError("Couldn't reach toski. Check your connection and try again.");
      else setError("Couldn't get a verdict right now. Try again in a moment.");
    } finally {
      clearTimeout(timeoutId);
      clearInterval(ticker);
      setLoading(false);
    }
  };

  const flash = (setter) => { setter(true); setTimeout(() => setter(false), 2500); };

  const copyLegacy = (text) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = text; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;opacity:0;top:0;left:0";
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch { return false; }
  };

  const share = async () => {
    if (!result) return;
    const { ctx } = result;
    const txt = `${result.verdict} — ${result.headline}\n\n"${result.quip}"\n\n${ctx.label} · from ${ctx.city}\n${window.location.origin}`;
    if (navigator.share) {
      try { await navigator.share({ title: "toski verdict", text: txt }); return; }
      catch (e) { if (e?.name === "AbortError") return; /* else fall through to copy */ }
    }
    try { await navigator.clipboard.writeText(txt); flash(setCopied); return; } catch { /* try legacy */ }
    if (copyLegacy(txt)) flash(setCopied); else flash(setShareFailed);
  };

  const reset = () => {
    setResult(null); setWeekend(""); setConfirmReset(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const vs  = result ? vStyle(result.verdict) : null;
  const ctx = result?.ctx;
  const pm  = ctx ? PASSES[ctx.pass] : null;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.txt, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        button, input { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; }
        input:focus { outline: none; }
        button:focus-visible, [role=button]:focus-visible { outline: 2px solid #1D6FB8; outline-offset: 2px; }
        input::placeholder { color: #7C97AB; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }
        @keyframes stamp {
          0%   { transform: scale(1.45); filter: blur(12px); opacity: 0; }
          60%  { transform: scale(.97); filter: blur(0); opacity: 1; }
          100% { transform: scale(1); }
        }
        @keyframes fadeUp  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes sway    { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(18px); } to { opacity: 1; transform: translateY(0); } }
        .result { animation: slideUp .38s ease both; }
        .fadeup { animation: fadeUp .3s ease both; }
        button:active { opacity: .82; transition: opacity .1s; }
        button { -webkit-tap-highlight-color: transparent; }
        html { scroll-behavior: smooth; }
      `}</style>

      {/* ── Header ── */}
      <header style={{
        background: C.surf, borderBottom: `1px solid ${C.bdr}`,
        padding: "13px 20px", display: "flex", justifyContent: "space-between",
        alignItems: "center", position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 1px 8px rgba(12,30,48,.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%", background: C.accent,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span style={{ fontSize: 13, fontWeight: 900, color: "#fff", lineHeight: 1 }}>∧</span>
          </div>
          <span style={{ fontWeight: 800, fontSize: 16, color: C.txt, letterSpacing: -.5 }}>
            toski<span style={{ color: C.accent }}>.</span>
          </span>
        </div>
      </header>

      <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 16px 80px", paddingTop: offSeason ? 0 : 8 }}>

        {/* ── Off-season ── */}
        {offSeason && (
          <div style={{
            background: C.warnBg, border: `1px solid ${C.warnBdr}`,
            borderRadius: 12, padding: "18px", margin: "16px 0", textAlign: "center",
          }}>
            <div style={{ fontSize: 26, marginBottom: 8 }}>🏔</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.warn, marginBottom: 6 }}>toski is closed for the season</div>
            <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.65 }}>
              Verdicts run <span style={{ whiteSpace: "nowrap" }}>{mdLabel(CONFIG.season.open)} – {mdLabel(CONFIG.season.close)}</span>.<br />Come back when it gets cold.
            </p>
          </div>
        )}

        {/* ── Hero ── */}
        <div style={{ padding: "32px 4px 24px", textAlign: "center" }}>
          <h1 style={{
            fontSize: "clamp(28px, 8vw, 42px)", fontWeight: 900,
            color: C.txt, letterSpacing: -1.5, lineHeight: 1.06, marginBottom: 10,
          }}>
            Is this weekend<br />worth it?
          </h1>
          <p style={{ fontSize: 14, color: C.mid, lineHeight: 1.7 }}>
            Your ski buddy with all the answers.
          </p>
        </div>

        {/* ── Form ── */}
        {!offSeason && (!result || error) && (
          <div style={{
            background: C.surf, border: `1px solid ${C.bdr}`,
            borderRadius: 14, overflow: "hidden", marginBottom: 16,
            boxShadow: "0 2px 12px rgba(12,30,48,.06)",
          }}>

            {/* City */}
            <div style={{ padding: "16px", borderBottom: `1px solid ${C.bdr}` }}>
              <label htmlFor="city" style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 8, letterSpacing: .5, textTransform: "uppercase" }}>
                Your city
              </label>
              <input
                ref={inputRef}
                id="city" name="city" type="text" maxLength={40}
                autoCapitalize="words" autoCorrect="off" spellCheck={false} enterKeyHint="done"
                aria-invalid={!!cityError}
                value={city}
                onChange={e => { setCity(e.target.value); setCityError(""); }}
                onBlur={validateCity}
                onKeyDown={e => e.key === "Enter" && e.target.blur()}
                autoComplete="address-level2"
                placeholder="Boston, NYC, Philly, Burlington…"
                style={{
                  width: "100%", padding: "11px 13px",
                  background: C.bg,
                  border: `1.5px solid ${cityError ? C.stop : cityOk ? C.accent : C.bdr}`,
                  borderRadius: 8, color: C.txt, fontSize: 16, fontWeight: 500,
                  transition: "border-color .15s",
                }}
              />
              {cityError && (
                <div style={{ fontSize: 11, color: C.stop, marginTop: 5 }}>{cityError}</div>
              )}
            </div>

            {/* Weekend */}
            <div style={{ padding: "16px", borderBottom: `1px solid ${C.bdr}` }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 8, letterSpacing: .5, textTransform: "uppercase" }}>
                Weekend
              </label>
              <div role="group" aria-label="Weekend" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                {weekends.map(w => {
                  const active = weekend === w.value;
                  return (
                    <button key={w.value} aria-pressed={active} onClick={() => { setWeekend(w.value); inputRef.current?.blur(); }} style={{
                      padding: "10px 8px", fontFamily: "inherit", fontSize: 13,
                      fontWeight: active ? 700 : 400, cursor: "pointer",
                      border: `1.5px solid ${active ? C.accent : C.bdr}`,
                      borderRadius: 8,
                      color: active ? C.accent : C.sub,
                      background: active ? C.accentLo : "transparent",
                      transition: "all .12s",
                    }}>{w.label}</button>
                  );
                })}
              </div>
            </div>

            {/* Pass */}
            <div style={{ padding: "16px", borderBottom: `1px solid ${C.bdr}` }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 8, letterSpacing: .5, textTransform: "uppercase" }}>
                Pass <span style={{ color: C.dim, fontWeight: 400 }}>(optional)</span>
              </label>
              <div role="group" aria-label="Pass" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                {Object.entries(PASSES).map(([k, p]) => {
                  const active = pass === k;
                  return (
                    <button key={k} aria-pressed={active} onClick={() => setPass(k)} style={{
                      padding: "9px 4px", fontFamily: "inherit", fontSize: 12,
                      fontWeight: active ? 700 : 500, cursor: "pointer",
                      border: `1.5px solid ${active ? p.color : C.bdr}`,
                      borderRadius: 8,
                      color: active ? p.color : C.mid,
                      background: active ? p.color + "12" : "transparent",
                      transition: "all .12s", textAlign: "center",
                    }}>{p.label}</button>
                  );
                })}
              </div>
              <div style={{ marginTop: 9, fontSize: 11, color: C.mid }}>
                {pass === "none"
                  ? `All ${RESORTS.length} mountains in play`
                  : `${passResorts.length} mountains on your pass`}
              </div>
            </div>

            {/* CTA */}
            <div style={{ padding: "14px 16px" }}>
              <button onClick={analyze} disabled={!ready || loading} style={{
                width: "100%", padding: "14px",
                background: ready && !loading ? C.accent : C.raise,
                color: ready && !loading ? "#fff" : C.dim,
                border: "none", borderRadius: 10,
                fontSize: 15, fontWeight: 700, letterSpacing: -.2,
                cursor: ready && !loading ? "pointer" : "not-allowed",
                transition: "background .18s, color .18s",
              }}>
                {loading ? "Reading conditions…"
                  : ready ? "Get the verdict →"
                  : !cityOk ? "Enter your city to continue"
                  : "Pick a weekend above"}
              </button>

              {loading && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span className="fadeup" role="status" aria-live="polite" style={{ fontSize: 11, color: C.mid }}>{LOAD_MSGS[loadIdx]}</span>
                    <span style={{ fontSize: 11, color: C.dim }}>{loadPct}%</span>
                  </div>
                  <div style={{ height: 3, background: C.raise, borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", background: C.accent, width: `${loadPct}%`, borderRadius: 2, transition: "width 1.6s ease" }} />
                  </div>
                  <div style={{ textAlign: "center", paddingTop: 16 }}>
                    <span style={{ fontSize: 26, display: "inline-block", animation: "sway 1.2s ease-in-out infinite", lineHeight: 1.4 }}>⛷</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div role="alert" style={{ background: C.stopBg, border: `1px solid ${C.stopBdr}`, borderRadius: 12, padding: "18px", textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⛔</div>
            <p style={{ fontSize: 13, color: C.stop, fontWeight: 500, marginBottom: 14, lineHeight: 1.6 }}>{error}</p>
            <button onClick={analyze} style={{
              background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 8,
              color: C.sub, fontSize: 13, fontWeight: 600, padding: "9px 20px",
              cursor: "pointer", fontFamily: "inherit",
            }}>Try again →</button>
          </div>
        )}

        {/* ── Result ── */}
        {result && vs && (
          <ResultBoundary onReset={reset}>
          <div ref={resultRef} className="result" style={{ scrollMarginTop: 72 }}>

            {/* Verdict card — lift ticket */}
            <div style={{
              background: vs.bg,
              border: `1.5px solid ${vs.bdr}`,
              borderRadius: 14,
              boxShadow: vs.shadow,
              overflow: "hidden",
              marginBottom: 12,
            }}>
              {/* Perforation top */}
              <div style={{
                height: 10,
                background: `radial-gradient(circle at 9px 10px, ${C.bg} 6px, transparent 6px)`,
                backgroundSize: "18px 18px", backgroundPosition: "center",
                borderBottom: `1px solid ${vs.bdr}`,
              }} />

              {/* Ticket meta */}
              <div style={{ padding: "10px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: C.mid, fontWeight: 600 }}>{ctx.label}</span>
                <span style={{ fontSize: 11, color: C.mid, fontWeight: 600 }}>
                  from {ctx.city}{ctx.pass !== "none" ? ` · ${pm.short}` : ""}
                </span>
              </div>

              {/* Verdict stamp */}
              <div style={{ padding: "16px 20px 4px", textAlign: "center" }}>
                <div style={{
                  fontSize: "clamp(68px, 18vw, 88px)",
                  fontWeight: 900, color: vs.color,
                  lineHeight: .88, letterSpacing: -3,
                  animation: stamped ? "stamp .42s cubic-bezier(.2,0,.2,1) both" : "none",
                  marginBottom: 10,
                }}>
                  {result.verdict}
                </div>

                <div style={{
                  fontSize: 17, fontWeight: 700, color: C.txt, letterSpacing: -.4,
                  lineHeight: 1.3, marginBottom: 12,
                  opacity: stamped ? 1 : 0, transform: stamped ? "none" : "translateY(6px)",
                  transition: "opacity .38s .22s, transform .38s .22s",
                }}>
                  {result.headline}
                </div>

                {result.quip && (
                  <div style={{
                    opacity: quipIn ? 1 : 0, transform: quipIn ? "none" : "translateY(5px)",
                    transition: "opacity .4s, transform .4s",
                    maxWidth: 300, margin: "0 auto 18px",
                    borderLeft: `3px solid ${vs.color}50`,
                    paddingLeft: 12, textAlign: "left",
                  }}>
                    <span style={{ fontSize: 13, color: C.sub, fontStyle: "italic", lineHeight: 1.6 }}>
                      "{result.quip}"
                    </span>
                  </div>
                )}
              </div>

              {/* Score */}
              <div style={{
                textAlign: "center", paddingBottom: 16,
                opacity: stamped ? 1 : 0, transition: "opacity .4s .4s",
              }}>
                <span style={{ color: vs.color, fontWeight: 800, fontSize: 20 }}>{result.score}</span>
                <span style={{ color: C.dim, fontSize: 12, fontWeight: 600 }}> / 100</span>
              </div>

              {/* Summary */}
              <div style={{ borderTop: `1px solid ${vs.bdr}`, padding: "14px 18px" }}>
                <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.8, margin: 0 }}>{result.summary}</p>
              </div>

              {/* Perforation bottom */}
              <div style={{
                height: 10,
                background: `radial-gradient(circle at 9px 0px, ${C.bg} 6px, transparent 6px)`,
                backgroundSize: "18px 18px", backgroundPosition: "center",
                borderTop: `1px solid ${vs.bdr}`,
              }} />
            </div>

            {/* Share */}
            <button onClick={share} style={{
              width: "100%", padding: "12px", background: C.surf,
              border: `1.5px solid ${copied ? C.goBdr : shareFailed ? C.stopBdr : C.bdr}`,
              borderRadius: 10, fontSize: 13, cursor: "pointer", marginBottom: 14,
              fontFamily: "inherit", fontWeight: 600,
              color: copied ? C.go : shareFailed ? C.stop : C.sub,
              transition: "all .2s",
              boxShadow: "0 1px 4px rgba(12,30,48,.06)",
            }}>
              {copied ? "✓ Copied to clipboard" : shareFailed ? "Couldn't copy — try again" : "Share this verdict  ↗"}
            </button>

            {/* Conditions */}
            <div style={{ background: C.surf, border: `1px solid ${C.bdr}`, borderRadius: 12, padding: "16px 16px 6px", marginBottom: 12, boxShadow: "0 1px 4px rgba(12,30,48,.04)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 14, textTransform: "uppercase", letterSpacing: .8 }}>Conditions</div>
              <ScoreBar label="🌨  Snow"    score={result.conditions.snow.score}    note={result.conditions.snow.note} />
              <ScoreBar label="🌤  Weather" score={result.conditions.weather.score} note={result.conditions.weather.note} />
              <ScoreBar label="👥  Crowds"  score={result.conditions.crowds.score}  note={result.conditions.crowds.note} />
              <ScoreBar label="🚗  Drive"   score={result.conditions.drive.score}   note={result.conditions.drive.note} />
            </div>

            {/* Resorts */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.mid, marginBottom: 12, textTransform: "uppercase", letterSpacing: .8 }}>Top picks this weekend</div>
              {result.resorts.map((r, i) => (
                <ResortCard key={r.name} name={r.name} rank={i+1} score={r.score}
                  why={r.why} insider={r.insider} tags={r.tags} stats={r.stats} passKey={ctx.pass} />
              ))}
            </div>

            {/* Before you go */}
            <div style={{ background: C.accentLo, border: `1.5px solid ${C.accentBdr}`, borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.accent, marginBottom: 7, textTransform: "uppercase", letterSpacing: .8 }}>Before you go</div>
              <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.75, margin: 0 }}>{result.tip}</p>
            </div>

            {/* Reset */}
            {!confirmReset ? (
              <button onClick={() => setConfirmReset(true)} style={{
                width: "100%", padding: "12px", background: C.surf,
                border: `1px solid ${C.bdr}`, borderRadius: 10,
                fontSize: 13, color: C.mid, cursor: "pointer",
                fontFamily: "inherit", fontWeight: 500,
                boxShadow: "0 1px 4px rgba(12,30,48,.04)",
              }}>← New search</button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={reset} style={{
                  flex: 1, padding: "12px",
                  background: C.stopBg, border: `1px solid ${C.stopBdr}`,
                  borderRadius: 10, fontSize: 13, color: C.stop,
                  cursor: "pointer", fontFamily: "inherit", fontWeight: 600,
                }}>Yes, start over</button>
                <button onClick={() => setConfirmReset(false)} style={{
                  flex: 1, padding: "12px",
                  background: C.surf, border: `1px solid ${C.bdr}`,
                  borderRadius: 10, fontSize: 13, color: C.mid,
                  cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                }}>Keep this result</button>
              </div>
            )}
            <p style={{ fontSize: 11, color: C.mid, textAlign: "center", lineHeight: 1.6, marginTop: 16 }}>
              Conditions come from live web sources and can be off. Check the mountain's snow report before you drive.
            </p>
          </div>
          </ResultBoundary>
        )}
      </div>

      {/* Footer */}
      {!result && !loading && (
        <div style={{ borderTop: `1px solid ${C.bdr}`, padding: "24px 20px 40px", textAlign: "center" }}>
          <p style={{ fontSize: 11, color: C.mid, lineHeight: 2 }}>
            Live snow data · Ikon · Epic · Indy
          </p>
          <p style={{ fontSize: 11, color: C.mid, marginTop: 4 }}>
            Data pulled live at search time.
          </p>
        </div>
      )}
    </div>
  );
}
