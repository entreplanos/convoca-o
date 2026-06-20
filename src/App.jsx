import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Dices, Crown, Check, X, HelpCircle, Copy, Users, Sparkles,
  ChevronLeft, ChevronRight, Swords, ScrollText, ArrowLeft, RefreshCw, Stamp, CalendarDays, CalendarPlus, Download, Flame
} from "lucide-react";
import { store } from "./store";

/* ============================ Identidade visual ============================
   Mesa de jogo à luz de vela: tinta da noite, âmbar de candeeiro, pergaminho.
   O vilão é o calendário; a "vitória" é fechar uma data.
*/
const C = {
  ink: "#16131f",
  inkSoft: "#211c2e",
  inkLine: "#352c47",
  parchment: "#ece3cf",
  parchmentDim: "#d8cdb3",
  gold: "#e0a458",
  goldDeep: "#b97f3c",
  arcane: "#8a78c2",
  yes: "#5fa46a",
  maybe: "#d99a3c",
  no: "#b5564f",
  text: "#f3ead7",
  muted: "#9a8fa8",
};

/* ============================ Utilidades ============================ */
const VOTE = { yes: "yes", maybe: "maybe", no: "no" };

const slugify = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "anon";

const genCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O/1/I
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

const isoOf = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const fromISO = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const humanDate = (iso) =>
  fromISO(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
const humanLong = (iso) =>
  fromISO(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

/* ---- horários e rótulos de slot ---- */
const TIME_PRESETS = ["14:00", "19:00", "20:00", "21:00"];
const slotLabel = (slot) =>
  humanDate(slot.date) + (slot.time ? ` · ${slot.time}` : " · a combinar");
const slotLong = (slot) =>
  humanLong(slot.date) + (slot.time ? ` às ${slot.time}` : " · horário a combinar");

/* ---- integração com calendário (Google Agenda + .ics) ---- */
const pad2 = (n) => String(n).padStart(2, "0");
const TZ = (() => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "America/Sao_Paulo"; }
})();
const slotStart = (slot) => {
  const [y, m, d] = slot.date.split("-").map(Number);
  if (slot.time) {
    const [hh, mm] = slot.time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  }
  return new Date(y, m - 1, d, 0, 0);
};
const calLocal = (dt) =>
  `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
const calDate = (dt) => `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;
const calUTC = (dt) =>
  `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}T${pad2(dt.getUTCHours())}${pad2(dt.getUTCMinutes())}00Z`;

const googleCalUrl = (meta, slot) => {
  const title = `RPG: ${meta.campaign}`;
  const details = `Sessão marcada na Convocação. Mestre: ${meta.gm}.`;
  const s = slotStart(slot);
  let dates, extra = "";
  if (slot.time) {
    const e = new Date(s.getTime() + (meta.durationHours || 3) * 3600000);
    dates = `${calLocal(s)}/${calLocal(e)}`;
    extra = `&ctz=${encodeURIComponent(TZ)}`;
  } else {
    const e = new Date(s.getTime() + 86400000);
    dates = `${calDate(s)}/${calDate(e)}`;
  }
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, details });
  return `https://calendar.google.com/calendar/render?${p.toString()}&dates=${dates}${extra}`;
};

const downloadIcs = (meta, slot) => {
  const s = slotStart(slot);
  let when;
  if (slot.time) {
    const e = new Date(s.getTime() + (meta.durationHours || 3) * 3600000);
    when = `DTSTART:${calUTC(s)}\r\nDTEND:${calUTC(e)}`;
  } else {
    const e = new Date(s.getTime() + 86400000);
    when = `DTSTART;VALUE=DATE:${calDate(s)}\r\nDTEND;VALUE=DATE:${calDate(e)}`;
  }
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Convocacao//PT-BR//EN",
    "BEGIN:VEVENT", `UID:${slot.id}-${Date.now()}@convocacao`, `DTSTAMP:${calUTC(new Date())}`,
    when, `SUMMARY:RPG: ${meta.campaign}`,
    `DESCRIPTION:Sessão marcada na Convocação. Mestre: ${meta.gm}.`,
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sessao-${slot.date}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const metaKey = (code) => `s:${code}:meta`;
const partKey = (code, slug) => `s:${code}:p:${slug}`;
const partPrefix = (code) => `s:${code}:p:`;

/* ---- memoria local: lembrar a ultima mesa (so no app publicado) ---- */
const LAST_KEY = "convocacao:last";
const recallSession = () => {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const rememberSession = (data) => {
  try { window.localStorage.setItem(LAST_KEY, JSON.stringify(data)); } catch {}
};
const forgetSession = () => {
  try { window.localStorage.removeItem(LAST_KEY); } catch {}
};

/* ============================ Componentes base ============================ */
function Brand({ small }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center" }}>
      <Dices size={small ? 22 : 30} style={{ color: C.gold }} />
      <h1
        style={{
          fontFamily: "Cinzel, serif",
          color: C.text,
          letterSpacing: "0.08em",
          fontSize: small ? 20 : 30,
          fontWeight: 700,
        }}
      >
        CONVOCAÇÃO
      </h1>
    </div>
  );
}

function Btn({ children, onClick, variant = "gold", disabled, full, style }) {
  const base = {
    fontFamily: "Inter, sans-serif",
    fontWeight: 600,
    fontSize: 14,
    padding: "12px 18px",
    borderRadius: 10,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    transition: "transform .08s ease, filter .15s ease",
    border: "1px solid transparent",
    width: full ? "100%" : undefined,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
  const variants = {
    gold: { background: C.gold, color: "#2a1d0e", boxShadow: "0 6px 18px -8px rgba(224,164,88,.7)" },
    ghost: { background: "transparent", color: C.text, borderColor: C.inkLine },
    arcane: { background: "transparent", color: C.arcane, borderColor: C.arcane },
  };
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...style }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(.97)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

function Field({ label, ...props }) {
  return (
    <label style={{ display: "block" }}>
      <span
        style={{
          fontFamily: "Inter, sans-serif",
          fontSize: 11,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.muted,
        }}
      >
        {label}
      </span>
      <input
        {...props}
        style={{
          marginTop: 6,
          width: "100%",
          background: C.ink,
          border: `1px solid ${C.inkLine}`,
          borderRadius: 10,
          padding: "11px 13px",
          color: C.text,
          fontFamily: "Spectral, serif",
          fontSize: 16,
          outline: "none",
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = C.gold)}
        onBlur={(e) => (e.currentTarget.style.borderColor = C.inkLine)}
      />
    </label>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: C.inkSoft,
        border: `1px solid ${C.inkLine}`,
        borderRadius: 16,
        padding: 22,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/* ============================ Calendário (escolha do mestre) ============================ */
function MonthPicker({ selected, onToggle }) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = view.getFullYear();
  const month = view.getMonth();
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = view.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <button onClick={() => setView(new Date(year, month - 1, 1))}
          style={{ color: C.muted, padding: 6 }}><ChevronLeft size={20} /></button>
        <span style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 15, textTransform: "capitalize" }}>
          {monthLabel}
        </span>
        <button onClick={() => setView(new Date(year, month + 1, 1))}
          style={{ color: C.muted, padding: 6 }}><ChevronRight size={20} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["D", "S", "T", "Q", "Q", "S", "S"].map((w, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: C.muted, fontFamily: "Inter" }}>{w}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={i} />;
          const iso = isoOf(date);
          const past = date < today;
          const on = selected.includes(iso);
          return (
            <button
              key={i}
              disabled={past}
              onClick={() => onToggle(iso)}
              style={{
                aspectRatio: "1",
                borderRadius: 8,
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: on ? 700 : 500,
                cursor: past ? "default" : "pointer",
                color: past ? "#4d445c" : on ? "#2a1d0e" : C.text,
                background: on ? C.gold : "transparent",
                border: `1px solid ${on ? C.gold : C.inkLine}`,
                opacity: past ? 0.4 : 1,
              }}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ Voto de três estados ============================ */
function VoteRow({ slot, value, onChange }) {
  const opts = [
    { v: VOTE.yes, label: "Vou", icon: Check, color: C.yes },
    { v: VOTE.maybe, label: "Talvez", icon: HelpCircle, color: C.maybe },
    { v: VOTE.no, label: "Não", icon: X, color: C.no },
  ];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 12,
        background: C.ink,
        border: `1px solid ${C.inkLine}`,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontFamily: "Spectral, serif", color: C.text, fontSize: 16, textTransform: "capitalize", minWidth: 130 }}>
        {slotLabel(slot)}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {opts.map((o) => {
          const active = value === o.v;
          const Icon = o.icon;
          return (
            <button
              key={o.v}
              onClick={() => onChange(active ? null : o.v)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "8px 12px",
                borderRadius: 9,
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                color: active ? "#16131f" : o.color,
                background: active ? o.color : "transparent",
                border: `1px solid ${active ? o.color : C.inkLine}`,
              }}
            >
              <Icon size={15} />
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ App ============================ */
export default function App() {
  const [screen, setScreen] = useState("home"); // home | create | join | respond | results
  const [me, setMe] = useState(null); // { slug, name }
  const [code, setCode] = useState("");
  const [meta, setMeta] = useState(null); // sessão atual
  const [participants, setParticipants] = useState([]);
  const [error, setError] = useState("");

  // criação
  const [campaign, setCampaign] = useState("");
  const [gmName, setGmName] = useState("");
  const [picked, setPicked] = useState([]);
  const [times, setTimes] = useState({}); // { "2026-06-25": ["20:00", ...] }
  const [durationHours, setDurationHours] = useState(3);
  const [customTime, setCustomTime] = useState({}); // { date: "HH:MM" }

  // entrada
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  // resposta
  const [votes, setVotes] = useState({});
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [recalled, setRecalled] = useState(() => recallSession());
  const syncDegraded = () => setDegraded(store.isDegraded());

  const pollRef = useRef(null);

  const loadParticipants = useCallback(async (c) => {
    const keys = await store.list(partPrefix(c));
    const list = [];
    for (const k of keys) {
      const p = await store.get(k);
      if (p) list.push(p);
    }
    setParticipants(list);
    return list;
  }, []);

  const refreshResults = useCallback(async () => {
    if (!code) return;
    const m = await store.get(metaKey(code));
    if (m) setMeta(m);
    await loadParticipants(code);
    syncDegraded();
  }, [code, loadParticipants]);

  /* polling enquanto vê resultados */
  useEffect(() => {
    if (screen === "results" && code) {
      refreshResults();
      pollRef.current = setInterval(refreshResults, 4000);
      return () => clearInterval(pollRef.current);
    }
  }, [screen, code, refreshResults]);

  /* ---- ações ---- */
  const createSession = async () => {
    setError("");
    if (!campaign.trim() || !gmName.trim() || picked.length === 0) {
      setError("Dê um nome à campanha, identifique-se e escolha ao menos uma data.");
      return;
    }
    let c = genCode();
    // evita colisão improvável
    if (await store.get(metaKey(c))) c = genCode();
    const slots = [];
    [...picked].sort().forEach((d) => {
      const ts = (times[d] || []).slice().sort();
      if (ts.length === 0) slots.push({ id: d, date: d, time: null });
      else ts.forEach((t) => slots.push({ id: `${d}T${t}`, date: d, time: t }));
    });
    const m = {
      code: c,
      campaign: campaign.trim(),
      gm: gmName.trim(),
      gmSlug: slugify(gmName),
      slots,
      durationHours,
      createdAt: Date.now(),
      confirmedSlot: null,
    };
    const ok = await store.set(metaKey(c), m);
    syncDegraded();
    if (!ok) {
      setError("Não consegui salvar a mesa. Tente novamente.");
      return;
    }
    setCode(c);
    setMeta(m);
    setMe({ slug: m.gmSlug, name: m.gm });
    rememberSession({ code: c, name: m.gm, isGM: true, campaign: m.campaign });
    setRecalled({ code: c, name: m.gm, isGM: true, campaign: m.campaign });
    setVotes({});
    setSaved(false);
    await loadParticipants(c);
    setScreen("respond");
  };

  const joinSession = async () => {
    setError("");
    const c = joinCode.trim().toUpperCase();
    if (!c || !joinName.trim()) {
      setError("Informe o código da mesa e seu nome.");
      return;
    }
    const m = await store.get(metaKey(c));
    syncDegraded();
    if (!m) {
      setError("Nenhuma mesa encontrada com esse código.");
      return;
    }
    const slug = slugify(joinName);
    const existing = await store.get(partKey(c, slug));
    setCode(c);
    setMeta(m);
    setMe({ slug, name: joinName.trim() });
    rememberSession({ code: c, name: joinName.trim(), isGM: slug === m.gmSlug, campaign: m.campaign });
    setRecalled({ code: c, name: joinName.trim(), isGM: slug === m.gmSlug, campaign: m.campaign });
    setVotes(existing?.votes || {});
    setSaved(!!existing);
    await loadParticipants(c);
    setScreen("respond");
  };

  const saveVotes = async () => {
    const isGM = me.slug === meta.gmSlug;
    const record = { slug: me.slug, name: me.name, isGM, votes, updatedAt: Date.now() };
    const ok = await store.set(partKey(code, me.slug), record);
    syncDegraded();
    if (ok) {
      setSaved(true);
      rememberSession({ code, name: me.name, isGM, campaign: meta.campaign });
      setRecalled({ code, name: me.name, isGM, campaign: meta.campaign });
      await loadParticipants(code);
      setScreen("results");
    } else {
      setError("Não consegui registrar sua disponibilidade.");
    }
  };

  const confirmSlot = async (slotId) => {
    const updated = { ...meta, confirmedSlot: meta.confirmedSlot === slotId ? null : slotId };
    await store.set(metaKey(code), updated);
    syncDegraded();
    setMeta(updated);
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const resumeSession = async (r) => {
    setError("");
    const m = await store.get(metaKey(r.code));
    syncDegraded();
    if (!m) {
      setError("Sua mesa anterior nao foi encontrada — pode ter sido removida.");
      return;
    }
    const slug = slugify(r.name);
    const existing = await store.get(partKey(r.code, slug));
    setCode(r.code);
    setMeta(m);
    setMe({ slug, name: r.name });
    setVotes(existing?.votes || {});
    setSaved(!!existing);
    await loadParticipants(r.code);
    setScreen("results");
  };

  const resetHome = () => {
    setScreen("home");
    setError("");
    setCampaign(""); setGmName(""); setPicked([]); setTimes({}); setDurationHours(3); setCustomTime({});
    setJoinCode(""); setJoinName("");
    setCode(""); setMeta(null); setParticipants([]); setMe(null); setVotes({});
  };

  /* ---- cálculo de resultados ---- */
  const computeRanking = () => {
    if (!meta) return { rows: [], total: 0 };
    const total = participants.length;
    const rows = (meta.slots || []).map((slot) => {
      let yes = 0, maybe = 0, no = 0;
      participants.forEach((p) => {
        const v = p.votes?.[slot.id];
        if (v === VOTE.yes) yes++;
        else if (v === VOTE.maybe) maybe++;
        else if (v === VOTE.no) no++;
      });
      const none = total - yes - maybe - no;
      const weighted = yes + 0.5 * maybe;
      const pct = total ? weighted / total : 0;
      const full = total > 0 && yes === total;
      return { slot, yes, maybe, no, none, weighted, pct, full };
    });
    rows.sort((a, b) =>
      b.yes - a.yes || b.weighted - a.weighted || a.slot.id.localeCompare(b.slot.id)
    );
    return { rows, total };
  };

  const isGM = me && meta && me.slug === meta.gmSlug;

  /* ============================ Render ============================ */
  const page = (children, { back } = {}) => (
    <div style={{ minHeight: "100vh", background: C.ink, padding: "28px 16px 60px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        {degraded && (
          <div style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 10, background: "rgba(217,154,60,.12)", border: `1px solid ${C.maybe}`, color: C.parchment, fontFamily: "Spectral, serif", fontSize: 13, lineHeight: 1.5 }}>
            {store.degradedReason()}
          </div>
        )}
        {back && (
          <button onClick={back} style={{ color: C.muted, display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 18, fontFamily: "Inter", fontSize: 13 }}>
            <ArrowLeft size={16} /> voltar
          </button>
        )}
        {children}
      </div>
    </div>
  );

  const errorBox = error && (
    <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 10, background: "rgba(181,86,79,.12)", border: `1px solid ${C.no}`, color: C.parchment, fontFamily: "Spectral, serif", fontSize: 14 }}>
      {error}
    </div>
  );

  /* ----- HOME ----- */
  if (screen === "home") {
    return page(
      <>
        <div style={{ textAlign: "center", marginTop: 24, marginBottom: 6 }}>
          <Brand />
        </div>
        <p style={{ textAlign: "center", color: C.muted, fontFamily: "Spectral, serif", fontStyle: "italic", fontSize: 16, lineHeight: 1.5, margin: "14px auto 30px", maxWidth: 420 }}>
          Os sinais de fogo estão acesos: o mestre convoca, e — como Gondor — a mesa responderá ao chamado. Resta o verdadeiro inimigo, que não é dragão nenhum: achar uma data livre na agenda de todos.
        </p>

        {recalled && (
          <div style={{ background: C.inkSoft, border: `1px solid ${C.gold}`, borderRadius: 16, padding: 18, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <Flame size={18} style={{ color: C.gold }} />
              <span style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold }}>
                {recalled.isGM ? "Sua mesa" : "Mesa que voce atendeu"}
              </span>
            </div>
            <div style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 18, marginBottom: 2 }}>
              {recalled.campaign}
            </div>
            <div style={{ fontFamily: "Spectral, serif", color: C.muted, fontSize: 13, marginBottom: 14 }}>
              codigo <strong style={{ color: C.gold, letterSpacing: "0.15em" }}>{recalled.code}</strong>
            </div>
            {error && (
              <p style={{ color: C.no, fontFamily: "Spectral, serif", fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            <Btn full onClick={() => resumeSession(recalled)}>
              <Flame size={16} /> Conferir os sinais
            </Btn>
            <button onClick={() => { forgetSession(); setRecalled(null); setError(""); }}
              style={{ display: "block", margin: "12px auto 0", color: C.muted, fontFamily: "Inter", fontSize: 12, cursor: "pointer" }}>
              esquecer esta mesa
            </button>
          </div>
        )}

        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Crown size={20} style={{ color: C.gold }} />
            <h2 style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 17 }}>Sou o mestre</h2>
          </div>
          <p style={{ color: C.muted, fontFamily: "Spectral, serif", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
            Crie a mesa, escolha as noites possíveis e receba um código para convocar o grupo.
          </p>
          <Btn full onClick={() => setScreen("create")}>
            <Swords size={16} /> Abrir nova mesa
          </Btn>
        </Card>

        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <Users size={20} style={{ color: C.arcane }} />
            <h2 style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 17 }}>Sou jogador</h2>
          </div>
          <p style={{ color: C.muted, fontFamily: "Spectral, serif", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
            Os sinais estão acesos. Com o código do mestre, responda ao chamado e marque as noites em que você comparece.
          </p>
          <Btn full variant="arcane" onClick={() => setScreen("join")}>
            <ScrollText size={16} /> Entrar com código
          </Btn>
        </Card>

        <p style={{ textAlign: "center", color: "#5d5470", fontFamily: "Inter", fontSize: 11, marginTop: 24, lineHeight: 1.5 }}>
          As respostas ficam visíveis para todos que entrarem na mesma mesa.
        </p>
      </>
    );
  }

  /* ----- CREATE ----- */
  if (screen === "create") {
    const togglePick = (iso) =>
      setPicked((p) => {
        if (p.includes(iso)) {
          setTimes((t) => { const n = { ...t }; delete n[iso]; return n; });
          return p.filter((x) => x !== iso);
        }
        return [...p, iso];
      });
    const toggleTime = (date, t) =>
      setTimes((prev) => {
        const cur = prev[date] || [];
        const next = cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t].sort();
        return { ...prev, [date]: next };
      });
    const addCustom = (date) => {
      const raw = (customTime[date] || "").trim();
      const mt = /^(\d{1,2}):(\d{2})$/.exec(raw);
      if (!mt) return;
      toggleTime(date, `${mt[1].padStart(2, "0")}:${mt[2]}`);
      setCustomTime((p) => ({ ...p, [date]: "" }));
    };
    return page(
      <>
        <Brand small />
        <h2 style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 22, margin: "26px 0 18px", textAlign: "center" }}>
          Convocar a mesa
        </h2>
        <Card>
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Nome da campanha" placeholder="A Maldição de Strahd" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
            <Field label="Seu nome (mestre)" placeholder="Mestre Lucas" value={gmName} onChange={(e) => setGmName(e.target.value)} />
            <div>
              <span style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                Noites possíveis · {picked.length} escolhida{picked.length === 1 ? "" : "s"}
              </span>
              <div style={{ marginTop: 10 }}>
                <MonthPicker selected={picked} onToggle={togglePick} />
              </div>
            </div>

            {picked.length > 0 && (
              <div>
                <span style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                  Horários por noite
                </span>
                <p style={{ fontFamily: "Spectral, serif", color: C.muted, fontSize: 13, margin: "4px 0 10px", lineHeight: 1.4 }}>
                  Toque para oferecer horários. Sem horário, a noite fica como "a combinar".
                </p>
                <div style={{ display: "grid", gap: 10 }}>
                  {[...picked].sort().map((d) => {
                    const opts = [...new Set([...TIME_PRESETS, ...(times[d] || [])])].sort();
                    return (
                      <div key={d} style={{ background: C.ink, border: `1px solid ${C.inkLine}`, borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontFamily: "Spectral, serif", color: C.text, fontSize: 15, textTransform: "capitalize", marginBottom: 8 }}>
                          {humanDate(d)}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {opts.map((t) => {
                            const on = (times[d] || []).includes(t);
                            return (
                              <button key={t} onClick={() => toggleTime(d, t)}
                                style={{
                                  padding: "5px 11px", borderRadius: 20, fontFamily: "Inter", fontSize: 13, fontWeight: 600,
                                  cursor: "pointer", color: on ? "#2a1d0e" : C.muted,
                                  background: on ? C.gold : "transparent", border: `1px solid ${on ? C.gold : C.inkLine}`,
                                }}>
                                {t}
                              </button>
                            );
                          })}
                          <span style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
                            <input
                              type="time"
                              value={customTime[d] || ""}
                              onChange={(e) => setCustomTime((p) => ({ ...p, [d]: e.target.value }))}
                              style={{ background: "transparent", border: `1px solid ${C.inkLine}`, borderRadius: 8, padding: "4px 6px", color: C.text, fontFamily: "Inter", fontSize: 13 }}
                            />
                            <button onClick={() => addCustom(d)} title="Adicionar horário"
                              style={{ padding: "5px 9px", borderRadius: 8, border: `1px solid ${C.arcane}`, color: C.arcane, fontFamily: "Inter", fontWeight: 700, cursor: "pointer" }}>+</button>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <span style={{ fontFamily: "Inter", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted }}>
                Duração da sessão (para o evento no calendário)
              </span>
              <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                {[2, 3, 4, 5].map((h) => {
                  const on = durationHours === h;
                  return (
                    <button key={h} onClick={() => setDurationHours(h)}
                      style={{
                        padding: "7px 14px", borderRadius: 9, fontFamily: "Inter", fontSize: 13, fontWeight: 600,
                        cursor: "pointer", color: on ? "#2a1d0e" : C.text,
                        background: on ? C.gold : "transparent", border: `1px solid ${on ? C.gold : C.inkLine}`,
                      }}>
                      {h}h
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          {errorBox}
          <div style={{ marginTop: 20 }}>
            <Btn full onClick={createSession}>Criar mesa e gerar código</Btn>
          </div>
        </Card>
      </>,
      { back: resetHome }
    );
  }

  /* ----- JOIN ----- */
  if (screen === "join") {
    return page(
      <>
        <Brand small />
        <h2 style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 22, margin: "26px 0 18px", textAlign: "center" }}>
          E Gondor responderá
        </h2>
        <p style={{ textAlign: "center", color: C.muted, fontFamily: "Spectral, serif", fontStyle: "italic", fontSize: 15, margin: "0 auto 18px", maxWidth: 360, lineHeight: 1.5 }}>
          Os sinais de fogo estão acesos. Informe o código da mesa para responder ao chamado.
        </p>
        <Card>
          <div style={{ display: "grid", gap: 16 }}>
            <Field label="Código da mesa" placeholder="K7QP" value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{ letterSpacing: "0.3em", fontFamily: "Inter", fontWeight: 700, fontSize: 20 }} maxLength={4} />
            <Field label="Seu nome" placeholder="Ana (a ladina)" value={joinName} onChange={(e) => setJoinName(e.target.value)} />
          </div>
          {errorBox}
          <div style={{ marginTop: 20 }}>
            <Btn full variant="arcane" onClick={joinSession}>Entrar na mesa</Btn>
          </div>
        </Card>
      </>,
      { back: resetHome }
    );
  }

  /* ----- RESPOND ----- */
  if (screen === "respond" && meta) {
    const allAnswered = (meta.slots || []).every((s) => votes[s.id]);
    return page(
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 20 }}>{meta.campaign}</div>
            <div style={{ fontFamily: "Spectral, serif", color: C.muted, fontSize: 14 }}>
              Olá, {me.name}{isGM ? " · mestre" : ""}
            </div>
          </div>
          <div
            onClick={copyCode}
            title="Copiar código"
            style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8, background: C.inkSoft, border: `1px solid ${C.inkLine}`, borderRadius: 10, padding: "8px 12px" }}
          >
            <span style={{ fontFamily: "Inter", fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>código</span>
            <span style={{ fontFamily: "Inter", fontWeight: 700, color: C.gold, letterSpacing: "0.2em", fontSize: 18 }}>{code}</span>
            <Copy size={14} style={{ color: copied ? C.yes : C.muted }} />
          </div>
        </div>

        <p style={{ color: C.muted, fontFamily: "Spectral, serif", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
          Marque sua disponibilidade em cada noite. Você pode voltar e mudar depois.
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          {(meta.slots || []).map((slot) => (
            <VoteRow key={slot.id} slot={slot} value={votes[slot.id] || null}
              onChange={(v) => setVotes((prev) => { const n = { ...prev }; if (v) n[slot.id] = v; else delete n[slot.id]; return n; })} />
          ))}
        </div>

        {errorBox}

        <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn onClick={saveVotes} style={{ flex: 1 }}>
            <Check size={16} /> {saved ? "Atualizar e ver resultados" : "Registrar e ver resultados"}
          </Btn>
          <Btn variant="ghost" onClick={() => setScreen("results")}>Só ver resultados</Btn>
        </div>
        {!allAnswered && (
          <p style={{ marginTop: 10, color: C.muted, fontFamily: "Spectral, serif", fontSize: 13, fontStyle: "italic" }}>
            Noites sem marcação contam como "sem resposta".
          </p>
        )}
      </>,
      { back: resetHome }
    );
  }

  /* ----- RESULTS ----- */
  if (screen === "results" && meta) {
    const { rows, total } = computeRanking();
    const best = rows[0];
    const fullMatches = rows.filter((r) => r.full);
    const confirmedId = meta.confirmedSlot;
    const confirmedSlot = (meta.slots || []).find((s) => s.id === confirmedId) || null;

    const tokenColor = (p, slotId) => {
      const v = p.votes?.[slotId];
      if (v === VOTE.yes) return C.yes;
      if (v === VOTE.maybe) return C.maybe;
      if (v === VOTE.no) return C.no;
      return "#4d445c";
    };

    const calButtons = (slot) => (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <a href={googleCalUrl(meta, slot)} target="_blank" rel="noopener noreferrer"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 16px", borderRadius: 10, background: C.gold, color: "#2a1d0e", fontFamily: "Inter", fontWeight: 600, fontSize: 14, textDecoration: "none" }}>
          <CalendarPlus size={16} /> Adicionar ao Google Agenda
        </a>
        <Btn variant="ghost" onClick={() => downloadIcs(meta, slot)} style={{ fontSize: 14 }}>
          <Download size={15} /> Baixar .ics
        </Btn>
      </div>
    );

    return page(
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 20 }}>{meta.campaign}</div>
          <button onClick={refreshResults} style={{ color: C.muted, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "Inter", fontSize: 12 }}>
            <RefreshCw size={14} /> atualizar
          </button>
        </div>
        <div style={{ fontFamily: "Spectral, serif", color: C.muted, fontSize: 14, marginBottom: 18 }}>
          <Users size={14} style={{ display: "inline", verticalAlign: "-2px", marginRight: 6 }} />
          {total} resposta{total === 1 ? "" : "s"} na mesa · código <strong style={{ color: C.gold, letterSpacing: "0.15em" }}>{code}</strong>
        </div>

        {/* Veredito */}
        {confirmedSlot ? (
          <div style={{ position: "relative", background: "rgba(95,164,106,.1)", border: `1px solid ${C.yes}`, borderRadius: 16, padding: 22, marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.yes, fontFamily: "Inter", fontWeight: 700, fontSize: 12, letterSpacing: "0.18em" }}>
              <Stamp size={16} /> SESSÃO MARCADA
            </div>
            <div style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 22, marginTop: 8, textTransform: "capitalize" }}>
              {slotLong(confirmedSlot)}
            </div>
            {calButtons(confirmedSlot)}
          </div>
        ) : best && total > 0 ? (
          <div style={{ background: C.inkSoft, border: `1px solid ${fullMatches.length ? C.yes : C.gold}`, borderRadius: 16, padding: 22, marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: fullMatches.length ? C.yes : C.gold, fontFamily: "Inter", fontWeight: 700, fontSize: 12, letterSpacing: "0.16em" }}>
              <Sparkles size={15} /> {fullMatches.length ? "TODOS DISPONÍVEIS" : "OPÇÃO MAIS PROVÁVEL"}
            </div>
            <div style={{ fontFamily: "Cinzel, serif", color: C.text, fontSize: 22, marginTop: 8, textTransform: "capitalize" }}>
              {slotLong(best.slot)}
            </div>
            <div style={{ fontFamily: "Spectral, serif", color: C.muted, fontSize: 14, marginTop: 4 }}>
              {best.yes} confirmado{best.yes === 1 ? "" : "s"}
              {best.maybe ? ` · ${best.maybe} talvez` : ""}
              {best.no ? ` · ${best.no} fora` : ""}
              {!fullMatches.length && " — nada fechou com todos, decisão do mestre."}
            </div>
          </div>
        ) : (
          <Card style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: "Spectral, serif", color: C.muted, fontSize: 15 }}>
              Ainda não há respostas. Compartilhe o código <strong style={{ color: C.gold }}>{code}</strong> com o grupo.
            </p>
          </Card>
        )}

        {/* Ranking de horários */}
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((r, idx) => {
            const isConfirmed = confirmedId === r.slot.id;
            return (
              <div key={r.slot.id} style={{
                background: C.inkSoft,
                border: `1px solid ${isConfirmed ? C.yes : idx === 0 && !confirmedId ? C.goldDeep : C.inkLine}`,
                borderRadius: 14, padding: "14px 16px",
              }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontFamily: "Spectral, serif", color: C.text, fontSize: 16, textTransform: "capitalize" }}>
                    {slotLabel(r.slot)}
                    {r.full && <span style={{ color: C.yes, fontSize: 13, marginLeft: 8 }}>✦ cheio</span>}
                  </div>
                  <div style={{ fontFamily: "Inter", fontSize: 13, color: C.muted }}>
                    {Math.round(r.pct * 100)}% · {r.yes}/{total || 0}
                  </div>
                </div>

                {/* barra */}
                <div style={{ height: 8, background: C.ink, borderRadius: 6, overflow: "hidden", marginTop: 10, display: "flex" }}>
                  {total > 0 && <>
                    <div style={{ width: `${(r.yes / total) * 100}%`, background: C.yes }} />
                    <div style={{ width: `${(r.maybe / total) * 100}%`, background: C.maybe }} />
                  </>}
                </div>

                {/* fichas dos participantes */}
                {participants.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 12 }}>
                    {participants.map((p) => (
                      <span key={p.slug} title={p.name} style={{
                        fontFamily: "Inter", fontSize: 11, fontWeight: 600,
                        padding: "3px 9px", borderRadius: 20,
                        color: tokenColor(p, r.slot.id),
                        border: `1px solid ${tokenColor(p, r.slot.id)}`,
                        opacity: p.votes?.[r.slot.id] ? 1 : 0.5,
                      }}>
                        {p.isGM ? "♛ " : ""}{p.name}
                      </span>
                    ))}
                  </div>
                )}

                {isGM && (
                  <div style={{ marginTop: 12 }}>
                    <Btn variant={isConfirmed ? "gold" : "ghost"} onClick={() => confirmSlot(r.slot.id)} style={{ padding: "8px 14px", fontSize: 13 }}>
                      <Stamp size={14} /> {isConfirmed ? "Marcada — desfazer" : "Marcar esta opção"}
                    </Btn>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: 22, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Btn variant="ghost" onClick={() => setScreen("respond")}>
            <CalendarDays size={15} /> Editar minha disponibilidade
          </Btn>
          <Btn variant="ghost" onClick={resetHome}>Sair</Btn>
        </div>
        {!isGM && (
          <p style={{ marginTop: 12, color: C.muted, fontFamily: "Spectral, serif", fontSize: 13, fontStyle: "italic" }}>
            A palavra final sobre a data é do mestre.
          </p>
        )}
      </>
    );
  }

  return page(<Btn onClick={resetHome}>Voltar ao início</Btn>);
}
