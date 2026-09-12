/**
 * DRISHTI-PAT MK-IV — FSOC PAT Ground Station Console
 * ---------------------------------------------------------------------------
 * Zero-build vanilla HTML + CSS + JS, hosted in a single module so it compiles
 * in this preview. To deploy standalone, split the three constants below:
 *   CONSOLE_CSS  -> style.css
 *   CONSOLE_HTML -> <body> of index.html
 *   mountConsole -> app.js  (wrap in an IIFE, call on DOMContentLoaded)
 *
 * Backend contract is unchanged: /ws/simulation, all command actions, all
 * /api/* routes and all server message types are preserved verbatim.
 */
import React, { useEffect, useRef } from 'react';

/* =========================================================================
   STYLESHEET  (style.css)
   ========================================================================= */
const CONSOLE_CSS = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap");

:root {
  --bg-0:#070b12; --bg-1:#0b111b; --bg-2:#101a28; --bg-3:#152235; --bg-inset:#060a10;
  --line:#1d2b3d; --line-strong:#2b4058;
  --text:#e7eef7; --text-muted:#a3b4c8; --text-dim:#7387a0;
  --cyan:#48c8f7; --cyan-dim:rgba(72,200,247,.16);
  --green:#32d583; --green-dim:rgba(50,213,131,.14);
  --amber:#f5b54a; --amber-dim:rgba(245,181,74,.14);
  --red:#ff6b6b;   --red-dim:rgba(255,107,107,.14);
  --purple:#b18cff;
  --font-ui:"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-mono:"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --s6:32px;
  --r-sm:4px; --r-md:6px;
  --shadow:0 8px 24px rgba(0,0,0,.45);
  --ease:cubic-bezier(.23,1,.32,1); --t-fast:120ms; --t-mid:180ms;
  --transport-h:52px;
}

/* ---- reset (scoped) ---- */
.console-root *, .console-root *::before, .console-root *::after { box-sizing:border-box; }
.console-root {
  background:var(--bg-0); color:var(--text); font-family:var(--font-ui);
  font-size:13px; line-height:1.45; -webkit-font-smoothing:antialiased;
  overflow-x:hidden; min-height:100vh;
}
.console-root h1,.console-root h2,.console-root h3,.console-root h4,
.console-root p,.console-root dl,.console-root dd,.console-root ol,.console-root ul{margin:0}
.console-root ol,.console-root ul{padding:0;list-style:none}
.console-root button{font:inherit;color:inherit}
.console-root img{display:block;max-width:100%}
.console-root sub{font-size:.75em}
.console-root abbr[title]{text-decoration:underline dotted rgba(163,180,200,.55);text-underline-offset:3px;cursor:help}
.console-root :focus-visible{outline:2px solid var(--cyan);outline-offset:2px;border-radius:var(--r-sm)}
.num,.num *{font-family:var(--font-mono);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.skip-link{position:absolute;left:var(--s3);top:-48px;z-index:100;background:var(--bg-3);color:var(--text);
  border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:var(--s2) var(--s3);
  text-decoration:none;font-size:12px;transition:top var(--t-fast) var(--ease)}
.skip-link:focus{top:var(--s3)}

.console{min-height:100vh;display:grid;grid-template-rows:auto auto auto 1fr auto;
  grid-template-areas:"cmdbar" "banner" "nav" "work" "transport";background:var(--bg-0)}

/* ================= 1 · COMMAND HEADER ================= */
.cmdbar{grid-area:cmdbar;display:grid;
  grid-template-columns:minmax(190px,auto) minmax(0,1fr) auto auto auto;
  grid-template-areas:"identity mission state readouts actions";
  align-items:center;gap:var(--s4);min-height:56px;padding:var(--s2) var(--s4);
  background:var(--bg-1);border-bottom:1px solid var(--line)}
.cmdbar__identity{grid-area:identity;display:flex;align-items:center;gap:var(--s3);min-width:0}
.brandmark{width:26px;height:26px;color:var(--cyan);flex:none}
.identity__name{font-size:14px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.identity__rev{font-size:10px;font-weight:600;letter-spacing:.1em;color:var(--cyan);
  border:1px solid var(--line-strong);border-radius:var(--r-sm);padding:1px 5px;margin-left:var(--s1);vertical-align:2px}
.identity__sub{font-size:10.5px;color:var(--text-dim);letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmdbar__mission{grid-area:mission;display:flex;flex-direction:column;gap:1px;min-width:0;
  padding-left:var(--s4);border-left:1px solid var(--line)}
.mission__label{font-size:9.5px;letter-spacing:.14em;color:var(--text-dim)}
.mission__name{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cmdbar__state{grid-area:state;display:flex;align-items:center;gap:var(--s2)}
.link-chip,.run-chip{display:inline-flex;align-items:center;gap:var(--s2);height:28px;padding:0 var(--s3);
  border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--bg-2);
  font-size:10px;letter-spacing:.1em;white-space:nowrap}
.link-chip__label,.run-chip__label{color:var(--text-dim)}
.link-chip__value,.run-chip__value{font-family:var(--font-mono);font-weight:600}
.link-chip__dot{width:7px;height:7px;border-radius:50%;background:var(--text-dim);flex:none}
.link-chip[data-state="online"]{border-color:rgba(50,213,131,.45);background:var(--green-dim)}
.link-chip[data-state="online"] .link-chip__dot{background:var(--green)}
.link-chip[data-state="online"] .link-chip__value{color:var(--green)}
.link-chip[data-state="connecting"],.link-chip[data-state="reconnecting"]{border-color:rgba(245,181,74,.45);background:var(--amber-dim)}
.link-chip[data-state="connecting"] .link-chip__dot,.link-chip[data-state="reconnecting"] .link-chip__dot{
  background:var(--amber);animation:blink 1.6s steps(2,jump-none) infinite}
.link-chip[data-state="connecting"] .link-chip__value,.link-chip[data-state="reconnecting"] .link-chip__value{color:var(--amber)}
.link-chip[data-state="offline"]{border-color:rgba(255,107,107,.5);background:var(--red-dim)}
.link-chip[data-state="offline"] .link-chip__dot{background:var(--red)}
.link-chip[data-state="offline"] .link-chip__value{color:var(--red)}
.run-chip[data-state="live"]{border-color:rgba(72,200,247,.45)}
.run-chip[data-state="live"] .run-chip__value{color:var(--cyan)}
.run-chip[data-state="paused"] .run-chip__value{color:var(--amber)}
.run-chip[data-state="idle"] .run-chip__value{color:var(--text-dim)}
@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:.3}}
.cmdbar__readouts{grid-area:readouts;display:flex;align-items:stretch;border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-2);overflow:hidden}
.readout{display:flex;flex-direction:column;justify-content:center;gap:1px;padding:var(--s1) var(--s3);
  min-width:80px;border-right:1px solid var(--line)}
.readout:last-child{border-right:0}
.readout__key{font-size:9px;letter-spacing:.14em;color:var(--text-dim)}
.readout__val{font-size:12.5px;font-weight:600;white-space:nowrap}
.readout__unit{font-size:9.5px;color:var(--text-dim);margin-left:3px}
.cmdbar__actions{grid-area:actions;display:flex;align-items:center;gap:var(--s2)}

.link-banner{grid-area:banner;display:flex;align-items:center;gap:var(--s3);padding:var(--s2) var(--s4);
  background:var(--amber-dim);border-bottom:1px solid rgba(245,181,74,.35);color:var(--amber);font-size:12px}
.link-banner[hidden]{display:none}
.link-banner .icon{width:15px;height:15px;flex:none}
.link-banner[data-tone="error"]{background:var(--red-dim);border-bottom-color:rgba(255,107,107,.4);color:var(--red)}
.link-banner__text{min-width:0}
.link-banner .btn{margin-left:auto;flex:none}

/* ================= 2 · NAV ================= */
.worknav{grid-area:nav;display:flex;align-items:stretch;justify-content:space-between;gap:var(--s4);
  background:var(--bg-1);border-bottom:1px solid var(--line);padding:0 var(--s4);min-height:48px}
.worknav__tabs{display:flex;align-items:stretch;gap:2px;overflow-x:auto;scrollbar-width:none}
.worknav__tabs::-webkit-scrollbar{display:none}
.worktab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;
  padding:var(--s2) var(--s4);display:flex;flex-direction:column;gap:1px;text-align:left;
  cursor:pointer;white-space:nowrap;
  transition:color var(--t-fast) var(--ease),background-color var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease)}
.worktab__name{font-size:12.5px;font-weight:600;color:var(--text-muted)}
.worktab__sub{font-size:9.5px;color:var(--text-dim);letter-spacing:.06em;text-transform:uppercase}
.worktab:hover{background:var(--bg-2)}
.worktab:hover .worktab__name{color:var(--text)}
.worktab.is-active{border-bottom-color:var(--cyan);background:var(--bg-2)}
.worktab.is-active .worktab__name{color:var(--cyan)}
.worktab:focus-visible{outline-offset:-2px}
.worknav__note{align-self:center;font-size:10px;letter-spacing:.1em;color:var(--text-dim);
  text-transform:uppercase;white-space:nowrap}

/* ================= 3 · WORKSPACES ================= */
.workspace{grid-area:work;min-width:0;padding:var(--s4)}
.panel-view[hidden]{display:none}
.panel{background:var(--bg-1);border:1px solid var(--line);border-radius:var(--r-md);
  display:flex;flex-direction:column;min-width:0}
.panel__cap{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);
  padding:var(--s2) var(--s3);border-bottom:1px solid var(--line);background:var(--bg-2);
  border-radius:var(--r-md) var(--r-md) 0 0;min-height:38px}
.panel__cap-actions{display:flex;align-items:center;gap:var(--s2)}
.panel__cap-note{font-size:10px;color:var(--text-dim);letter-spacing:.06em}
.panel__title{font-size:11px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  display:flex;align-items:center;gap:var(--s2)}
.panel__title--lg{font-size:14px;letter-spacing:.02em;text-transform:none}
.panel__body{padding:var(--s3)}
.stack{display:flex;flex-direction:column;gap:var(--s4)}
.prose{font-size:11.5px;color:var(--text-muted);line-height:1.55;max-width:70ch}
.hint{color:var(--text-dim)}
.dot{width:7px;height:7px;border-radius:50%;background:var(--text-dim);flex:none}
.dot--cyan{background:var(--cyan)}
.dot--amber{background:var(--amber)}
.dot--green{background:var(--green)}
.dot--red{background:var(--red)}
.chip{display:inline-flex;align-items:center;gap:var(--s1);font-family:var(--font-mono);
  font-size:9.5px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;padding:3px var(--s2);
  border:1px solid var(--line-strong);border-radius:var(--r-sm);background:var(--bg-3);
  color:var(--text-muted);white-space:nowrap}
.chip[data-tone="ok"]{color:var(--green);border-color:rgba(50,213,131,.4);background:var(--green-dim)}
.chip[data-tone="warn"]{color:var(--amber);border-color:rgba(245,181,74,.4);background:var(--amber-dim)}
.chip[data-tone="crit"]{color:var(--red);border-color:rgba(255,107,107,.4);background:var(--red-dim)}
.chip[data-tone="info"]{color:var(--cyan);border-color:rgba(72,200,247,.4);background:var(--cyan-dim)}
.chip[data-tone="neutral"]{color:var(--text-dim)}

.btn{appearance:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;
  gap:var(--s2);height:32px;padding:0 var(--s3);border:1px solid var(--line-strong);
  border-radius:var(--r-sm);background:var(--bg-3);color:var(--text);font-size:11px;font-weight:600;
  letter-spacing:.06em;white-space:nowrap;
  transition:background-color var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
.btn:hover:not(:disabled){background:#1b2b41;border-color:#3a5271}
.btn:active:not(:disabled){background:#16243a}
.btn:disabled{opacity:.42;cursor:not-allowed}
.btn .icon{width:14px;height:14px;flex:none}
.btn--ghost{background:transparent;color:var(--text-muted)}
.btn--ghost:hover:not(:disabled){background:var(--bg-3);color:var(--text)}
.btn--primary{background:var(--cyan-dim);border-color:rgba(72,200,247,.55);color:var(--cyan)}
.btn--primary:hover:not(:disabled){background:rgba(72,200,247,.26);border-color:var(--cyan)}
.btn--danger{background:var(--red-dim);border-color:rgba(255,107,107,.5);color:var(--red)}
.btn--danger:hover:not(:disabled){background:rgba(255,107,107,.24);border-color:var(--red)}
.btn--sm{height:28px;padding:0 var(--s2);font-size:10.5px}
.btn--xs{height:22px;padding:0 var(--s2);font-size:10px}
.btn--icon{width:32px;padding:0}
.btn.is-ok{border-color:rgba(50,213,131,.6);color:var(--green);background:var(--green-dim)}
.btn-sound .icon--audio-off{display:none}
.btn-sound[aria-pressed="false"] .icon--audio-on{display:none}
.btn-sound[aria-pressed="false"] .icon--audio-off{display:block}
.btn-sound[aria-pressed="false"]{color:var(--text-dim)}
.btn-play .icon--pause{display:none}
.btn-play[data-mode="pause"] .icon--play{display:none}
.btn-play[data-mode="pause"] .icon--pause{display:block}
.btn-play[data-mode="pause"]{background:var(--amber-dim);border-color:rgba(245,181,74,.55);color:var(--amber)}
.btn-play[data-mode="pause"]:hover:not(:disabled){background:rgba(245,181,74,.26);border-color:var(--amber)}

.select{appearance:none;height:28px;padding:0 26px 0 var(--s2);
  background:var(--bg-2) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%237387a0' stroke-width='1.4' stroke-linecap='round'/%3E%3C/svg%3E") no-repeat right 8px center/9px 6px;
  border:1px solid var(--line-strong);border-radius:var(--r-sm);color:var(--text);
  font-size:11.5px;font-family:var(--font-ui);max-width:240px;cursor:pointer}
.select:hover{border-color:#3a5271}
.select--sm{height:26px;font-size:11px;max-width:140px}
.select--block{width:100%;max-width:none;height:32px}
.select option{background:var(--bg-2);color:var(--text)}
.select optgroup{background:var(--bg-1);color:var(--text-dim)}
.select-field{display:inline-flex;align-items:center;gap:var(--s2)}
.select-field__label{font-size:9px;letter-spacing:.14em;color:var(--text-dim)}

.field{display:flex;flex-direction:column;gap:var(--s2);min-width:0}
.field__head{display:flex;align-items:baseline;justify-content:space-between;gap:var(--s3)}
.field__label{font-size:11.5px;color:var(--text-muted);font-weight:500}
.field__value{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:12px;
  font-weight:600;color:var(--cyan);background:var(--bg-inset);border:1px solid var(--line);
  border-radius:var(--r-sm);padding:1px var(--s2);white-space:nowrap}
.field.is-invalid .field__value{color:var(--red);border-color:rgba(255,107,107,.55)}
.field__error{font-size:10.5px;color:var(--red)}
.field__error[hidden]{display:none}
.factlist{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:var(--s2)}
.factlist>div{display:flex;flex-direction:column;gap:2px;padding:var(--s2);background:var(--bg-2);
  border:1px solid var(--line);border-radius:var(--r-sm)}
.factlist dt{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);font-family:var(--font-ui)}
.factlist dd{font-size:12px}

.slider{appearance:none;width:100%;height:18px;background:transparent;cursor:pointer}
.slider::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:var(--bg-3);border:1px solid var(--line)}
.slider::-moz-range-track{height:4px;border-radius:2px;background:var(--bg-3);border:1px solid var(--line)}
.slider::-webkit-slider-thumb{appearance:none;width:14px;height:14px;margin-top:-6px;border-radius:50%;
  background:var(--cyan);border:2px solid var(--bg-0);transition:transform var(--t-fast) var(--ease)}
.slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--cyan);border:2px solid var(--bg-0)}
.slider:hover::-webkit-slider-thumb{transform:scale(1.12)}
.slider:focus-visible{outline:none}
.slider:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px rgba(72,200,247,.35)}
.slider:focus-visible::-moz-range-thumb{box-shadow:0 0 0 3px rgba(72,200,247,.35)}
.slider--sm{width:110px}

.check{display:inline-flex;align-items:flex-start;gap:var(--s2);font-size:11.5px;
  color:var(--text-muted);cursor:pointer;line-height:1.4}
.check input[type="checkbox"]{appearance:none;width:15px;height:15px;flex:none;margin:1px 0 0;
  border:1px solid var(--line-strong);border-radius:3px;background:var(--bg-2);cursor:pointer;position:relative;
  transition:background-color var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease)}
.check input[type="checkbox"]:checked{background:var(--cyan-dim);border-color:var(--cyan)}
.check input[type="checkbox"]:checked::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;
  border:solid var(--cyan);border-width:0 1.8px 1.8px 0;transform:rotate(42deg)}
.check:hover{color:var(--text)}
.check--inline{font-size:10px;letter-spacing:.06em;color:var(--text-dim)}
.check--inline input[type="checkbox"]{width:13px;height:13px}
.check--inline input[type="checkbox"]:checked::after{left:3px;top:0;height:7px}
.checkrow{display:flex;flex-wrap:wrap;gap:var(--s4)}

/* ---- tracking workspace ---- */
.ops-grid{display:grid;grid-template-columns:minmax(0,1fr) 320px;
  grid-template-areas:"summary summary" "instruments rail";gap:var(--s3);align-items:start}
.summary-strip{grid-area:summary;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:var(--s2)}
.instruments{grid-area:instruments;display:flex;flex-direction:column;gap:var(--s3);min-width:0}
.rail{grid-area:rail;display:flex;flex-direction:column;gap:var(--s3);min-width:0}
.metric{background:var(--bg-1);border:1px solid var(--line);border-radius:var(--r-md);
  padding:var(--s2) var(--s3) var(--s3);display:flex;flex-direction:column;gap:var(--s1);min-width:0}
.metric--lead{border-color:var(--line-strong);background:var(--bg-2)}
.metric__label{font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
  color:var(--text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.metric__value{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:21px;
  font-weight:600;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.metric__value--sm{font-size:14px}
.metric__unit{font-size:10.5px;color:var(--text-dim);margin-left:3px;font-weight:500}
.metric__foot{font-size:10px;color:var(--text-dim);margin-top:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.metric--compact .metric__value{font-size:16px}
.metric__value[data-state="tracking"],.metric__value[data-state="locked"]{color:var(--green)}
.metric__value[data-state="searching"],.metric__value[data-state="coast"],.metric__value[data-state="reacquire"]{color:var(--amber)}
.metric__value[data-state="lost"]{color:var(--red)}
.metric__value[data-state="acquiring"]{color:var(--cyan)}
.metric__value[data-state="unknown"]{color:var(--text-dim)}
.metric__value[data-mode="kf"]{color:var(--cyan)}
.metric__value[data-mode="pf"]{color:var(--purple)}
.metric__value[data-mode="coast"]{color:var(--amber)}
.metric__value[data-mode="lost"]{color:var(--red)}
.metric__value[data-mode="none"]{color:var(--text-dim)}
.metric__foot[data-state="locked"]{color:var(--green)}
.metric__foot[data-state="unlocked"]{color:var(--amber)}
.metric__foot[data-state="unknown"]{color:var(--text-dim)}
.meter{position:relative;height:4px;border-radius:2px;background:var(--bg-3);
  border:1px solid var(--line);margin:var(--s1) 0 2px}
.meter__fill{height:100%;width:0%;max-width:100%;border-radius:2px;background:var(--cyan);
  transition:width var(--t-mid) var(--ease)}
.meter__fill--green{background:var(--green)}
.meter__fill--amber{background:var(--amber)}
.meter__fill--red{background:var(--red)}
.meter__pip{position:absolute;top:-3px;width:1px;height:10px;background:var(--text-dim)}
.meter__pip--red{background:var(--red)}

.instrument-shell{overflow:hidden}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);flex-wrap:wrap;
  padding:var(--s2) var(--s3);background:var(--bg-2);border-bottom:1px solid var(--line)}
.toolbar__right{display:flex;align-items:center;gap:var(--s2);flex-wrap:wrap}
.segmented{display:inline-flex;border:1px solid var(--line-strong);border-radius:var(--r-sm);
  overflow:hidden;background:var(--bg-1)}
.segmented__btn{appearance:none;border:0;background:transparent;cursor:pointer;padding:0 var(--s3);
  height:26px;font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--text-dim);border-right:1px solid var(--line);
  transition:background-color var(--t-fast) var(--ease),color var(--t-fast) var(--ease)}
.segmented__btn:last-child{border-right:0}
.segmented__btn:hover{color:var(--text);background:var(--bg-3)}
.segmented__btn.is-active{background:var(--cyan-dim);color:var(--cyan)}
.segmented__btn:focus-visible{outline-offset:-2px}
.viewport-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:1px;background:var(--line)}
.viewport-grid[data-view="radar"]{grid-template-columns:minmax(0,1fr)}
.viewport-grid[data-view="radar"] .viewport--camera{display:none}
.viewport-grid[data-view="camera"]{grid-template-columns:minmax(0,1fr)}
.viewport-grid[data-view="camera"] .viewport--radar{display:none}
.viewport{display:flex;flex-direction:column;background:var(--bg-1);min-width:0}
.viewport__head{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);
  padding:var(--s2) var(--s3);border-bottom:1px solid var(--line);min-height:34px}
.viewport__title{display:flex;align-items:center;gap:var(--s2);font-size:10.5px;font-weight:600;
  letter-spacing:.1em;text-transform:uppercase;color:var(--text-muted);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.viewport__readout{font-size:10.5px;color:var(--cyan);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.canvas-stage{position:relative;background:var(--bg-inset);aspect-ratio:16/10;min-height:240px}
.canvas-stage canvas{display:block;width:100%;height:100%}
.radar-legend{position:absolute;left:var(--s2);bottom:var(--s2);display:flex;flex-wrap:wrap;
  gap:2px var(--s3);padding:var(--s1) var(--s2);background:rgba(6,10,16,.84);
  border:1px solid var(--line);border-radius:var(--r-sm);font-size:9px;letter-spacing:.06em;
  text-transform:uppercase;color:var(--text-dim);max-width:calc(100% - var(--s4))}
.radar-legend li{display:flex;align-items:center;gap:var(--s1);white-space:nowrap}
.key{width:10px;height:2px;flex:none}
.key--primary{background:var(--green);height:6px;width:6px;border-radius:50%}
.key--secondary{background:var(--cyan);height:5px;width:5px;border-radius:50%;opacity:.6}
.key--pf{background:var(--purple);height:5px;width:5px;border-radius:50%}
.key--fov{background:transparent;border:1px solid var(--cyan);height:7px;width:10px}
.key--reticle{background:var(--cyan)}
.key--reacq{background:transparent;border:1px dashed var(--amber);height:7px;width:10px}

.camera-stage{position:relative;background:var(--bg-inset);aspect-ratio:4/3;min-height:200px;
  display:flex;align-items:center;justify-content:center;overflow:hidden}
.camera-stage__img{max-width:100%;max-height:100%;object-fit:contain;display:none}
.camera-stage[data-state="live"] .camera-stage__img{display:block}
.camera-stage[data-state="live"] .camera-empty{display:none}
.camera-empty{display:flex;flex-direction:column;align-items:center;gap:var(--s2);padding:var(--s4);
  text-align:center;color:var(--text-dim);max-width:320px}
.camera-empty__icon{width:40px;height:40px;opacity:.7}
.camera-empty__title{font-family:var(--font-mono);font-size:11px;font-weight:600;letter-spacing:.1em;color:var(--text-muted)}
.camera-empty__desc{font-size:11px;line-height:1.5}
.camera-stage[data-state="error"] .camera-empty__title,.camera-stage[data-state="error"] .camera-empty__icon{color:var(--red)}
.camera-stage[data-state="lost"] .camera-empty__title,.camera-stage[data-state="lost"] .camera-empty__icon,
.camera-stage[data-state="nodetect"] .camera-empty__title,.camera-stage[data-state="nodetect"] .camera-empty__icon{color:var(--amber)}
.camera-hud{position:absolute;inset:var(--s2);pointer-events:none}
.bracket{position:absolute;width:14px;height:14px;border:0 solid rgba(72,200,247,.45)}
.bracket--tl{top:0;left:0;border-top-width:1px;border-left-width:1px}
.bracket--tr{top:0;right:0;border-top-width:1px;border-right-width:1px}
.bracket--bl{bottom:0;left:0;border-bottom-width:1px;border-left-width:1px}
.bracket--br{bottom:0;right:0;border-bottom-width:1px;border-right-width:1px}
.camera-stamp{position:absolute;right:var(--s2);bottom:var(--s2);display:flex;flex-direction:column;gap:1px;
  padding:var(--s1) var(--s2);background:rgba(6,10,16,.84);border:1px solid var(--line);
  border-radius:var(--r-sm);font-size:9.5px;color:var(--text-muted)}
.camera-stamp>div{display:flex;gap:var(--s2);justify-content:space-between}
.camera-stamp dt{color:var(--text-dim);letter-spacing:.1em}

.scope__head{display:flex;align-items:center;justify-content:space-between;gap:var(--s3);flex-wrap:wrap;
  padding:var(--s2) var(--s3);border-bottom:1px solid var(--line);background:var(--bg-2);
  border-radius:var(--r-md) var(--r-md) 0 0}
.scope__legend{display:flex;gap:var(--s4);flex-wrap:wrap;font-size:10.5px;color:var(--text-dim)}
.scope__legend li{display:flex;align-items:center;gap:var(--s1);white-space:nowrap}
.scope__legend strong{color:var(--text);font-weight:600}
.trace{width:12px;height:2px;flex:none}
.trace--cyan{background:var(--cyan)}
.trace--green{background:var(--green)}
.trace--amber{background:var(--amber)}
.scope__plot{height:132px;background:var(--bg-inset);border-radius:0 0 var(--r-md) var(--r-md);overflow:hidden}
.scope__plot canvas{display:block;width:100%;height:100%}

.pillrow{display:flex;flex-wrap:wrap;gap:var(--s1)}
.pill{font-family:var(--font-mono);font-size:9.5px;padding:2px var(--s2);border:1px solid var(--line);
  border-radius:var(--r-sm);background:var(--bg-2);color:var(--text-dim);white-space:nowrap}
.pill strong{color:var(--text);font-weight:600}
.pill--regime[data-regime="clear"]{color:var(--green);border-color:rgba(50,213,131,.4)}
.pill--regime[data-regime="moderate"]{color:var(--amber);border-color:rgba(245,181,74,.4)}
.pill--regime[data-regime="severe"]{color:var(--red);border-color:rgba(255,107,107,.4)}

.panel--log{flex:1}
.log{flex:1;overflow-y:auto;padding:var(--s2);font-size:10.5px;line-height:1.6;max-height:300px;scrollbar-width:thin}
.log__line{display:grid;grid-template-columns:58px 70px minmax(0,1fr);gap:var(--s2);
  padding:2px var(--s1);border-left:2px solid transparent}
.log__line+.log__line{border-top:1px solid rgba(29,43,61,.55)}
.log__time{color:var(--text-dim)}
.log__tag{color:var(--text-muted);overflow:hidden;text-overflow:ellipsis}
.log__msg{color:var(--text-muted);word-break:break-word}
.log__count{color:var(--text-dim);border:1px solid var(--line);border-radius:8px;padding:0 5px;margin-left:var(--s1);font-size:9px}
.log__line[data-sev="info"] .log__tag{color:var(--cyan)}
.log__line[data-sev="lock"]{border-left-color:var(--green)}
.log__line[data-sev="lock"] .log__tag{color:var(--green)}
.log__line[data-sev="warn"],.log__line[data-sev="reacq"]{border-left-color:var(--amber)}
.log__line[data-sev="warn"] .log__tag,.log__line[data-sev="reacq"] .log__tag{color:var(--amber)}
.log__line[data-sev="warn"] .log__msg{color:var(--amber)}
.log__line[data-sev="switch"]{border-left-color:var(--purple)}
.log__line[data-sev="switch"] .log__tag{color:var(--purple)}
.log__line[data-sev="loss"]{border-left-color:var(--red)}
.log__line[data-sev="loss"] .log__tag,.log__line[data-sev="loss"] .log__msg{color:var(--red)}
.log__empty{padding:var(--s3);color:var(--text-dim);font-size:10.5px;font-family:var(--font-ui)}

/* ---- config workspaces ---- */
.config-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:var(--s3);align-items:start}
.panel--wide{grid-column:1/-1}
.turbgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:var(--s2);margin-top:var(--s3)}
.turbcell{display:flex;flex-direction:column;gap:2px;padding:var(--s2) var(--s3);background:var(--bg-2);
  border:1px solid var(--line);border-radius:var(--r-sm);min-width:0}
.turbcell__k{font-family:var(--font-ui);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-dim)}
.turbcell__v{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.turbcell__v--cyan{color:var(--cyan)}
.turbcell__v--amber{color:var(--amber)}
.turbcell__v--green{color:var(--green)}
.turbcell__u{font-family:var(--font-ui);font-size:10px;color:var(--text-dim)}

/* ---- performance workspace ---- */
.report{display:flex;flex-direction:column;gap:var(--s3)}
.report__head{flex-direction:row;align-items:center;justify-content:space-between;gap:var(--s4);
  flex-wrap:wrap;padding:var(--s3)}
.report__sub{font-size:11px;color:var(--text-dim);margin-top:2px}
.report__actions{display:flex;gap:var(--s2)}
.kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(196px,1fr));gap:var(--s2)}
.kpi{background:var(--bg-1);border:1px solid var(--line);border-radius:var(--r-md);padding:var(--s3);
  display:flex;flex-direction:column;gap:var(--s1)}
.kpi__label{font-size:9.5px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim)}
.kpi__value{font-family:var(--font-mono);font-variant-numeric:tabular-nums;font-size:24px;font-weight:600;line-height:1.15}
.kpi__value[data-tone="ok"]{color:var(--green)}
.kpi__value[data-tone="warn"]{color:var(--amber)}
.kpi__value[data-tone="crit"]{color:var(--red)}
.kpi__value[data-tone="none"]{color:var(--text-dim)}
.kpi__foot{font-size:10.5px;color:var(--text-dim);margin-top:auto}
.table-wrap{overflow-x:auto}
.table{width:100%;border-collapse:collapse;font-size:11.5px;min-width:600px}
.table th,.table td{text-align:left;padding:var(--s2) var(--s3);border-bottom:1px solid var(--line)}
.table thead th{font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-dim);
  font-weight:600;background:var(--bg-2)}
.table tbody th{font-weight:500;color:var(--text-muted)}
.table tbody tr:last-child th,.table tbody tr:last-child td{border-bottom:0}
.table tbody tr:hover{background:rgba(21,34,53,.5)}
.table__num{text-align:right;white-space:nowrap;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.diagnosis{padding:var(--s3);border-radius:var(--r-sm);background:var(--bg-2);
  border:1px solid var(--line);border-left:3px solid var(--line-strong)}
.diagnosis[data-tone="ok"]{border-left-color:var(--green)}
.diagnosis[data-tone="warn"]{border-left-color:var(--amber)}
.diagnosis__headline{font-family:var(--font-mono);font-size:11.5px;font-weight:600;color:var(--text-muted)}
.diagnosis[data-tone="ok"] .diagnosis__headline{color:var(--green)}
.diagnosis[data-tone="warn"] .diagnosis__headline{color:var(--amber)}
.diagnosis__body{font-size:11.5px;color:var(--text-muted);line-height:1.6;margin-top:var(--s2);max-width:90ch}

/* ================= 4 · TRANSPORT ================= */
.transport{grid-area:transport;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;
  grid-template-areas:"controls speed timeline exports";align-items:center;gap:var(--s4);
  padding:var(--s2) var(--s4);min-height:var(--transport-h);background:var(--bg-1);
  border-top:1px solid var(--line);position:sticky;bottom:0;z-index:30}
.transport__group{display:flex;align-items:center;gap:var(--s2)}
.transport__group--main{grid-area:controls}
.transport__group--end{grid-area:exports;justify-self:end}
.transport__play{min-width:94px}
.transport__speed{grid-area:speed;display:flex;align-items:center;gap:var(--s2)}
.transport__speed-label{font-size:9px;letter-spacing:.14em;color:var(--text-dim)}
.transport__speed-val{font-family:var(--font-mono);font-size:11.5px;color:var(--cyan);min-width:38px}
.transport__timeline{grid-area:timeline;min-width:0}
.timeline{height:6px;border-radius:3px;background:var(--bg-3);border:1px solid var(--line);overflow:hidden}
.timeline__fill{height:100%;width:0%;background:var(--cyan);transition:width var(--t-mid) var(--ease)}

/* ================= 5 · MODAL ================= */
.modal{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:var(--s4)}
.modal[hidden]{display:none}
.modal__backdrop{position:absolute;inset:0;background:rgba(4,7,12,.78)}
.modal__dialog{position:relative;z-index:1;width:min(740px,100%);max-height:min(84vh,700px);
  display:flex;flex-direction:column;background:var(--bg-1);border:1px solid var(--line-strong);
  border-radius:var(--r-md);box-shadow:var(--shadow);animation:modal-in var(--t-mid) var(--ease)}
@keyframes modal-in{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}
.modal__head{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--s4);
  padding:var(--s3) var(--s4);border-bottom:1px solid var(--line);background:var(--bg-2);
  border-radius:var(--r-md) var(--r-md) 0 0}
.modal__title{font-size:14px;font-weight:600}
.modal__sub{font-size:11px;color:var(--text-dim);margin-top:2px}
.modal__tabs{display:flex;gap:2px;padding:0 var(--s4);border-bottom:1px solid var(--line);background:var(--bg-2)}
.modal__tab{appearance:none;background:transparent;border:0;border-bottom:2px solid transparent;
  padding:var(--s2) var(--s3);cursor:pointer;font-size:11.5px;font-weight:600;color:var(--text-dim);
  transition:color var(--t-fast) var(--ease),border-color var(--t-fast) var(--ease)}
.modal__tab:hover{color:var(--text)}
.modal__tab.is-active{color:var(--cyan);border-bottom-color:var(--cyan)}
.modal__body{padding:var(--s4);overflow-y:auto;flex:1}
.modal__pane{display:flex;flex-direction:column;gap:var(--s3)}
.modal__pane[hidden]{display:none}
.modal__foot{padding:var(--s3) var(--s4);border-top:1px solid var(--line);display:flex;
  justify-content:flex-end;background:var(--bg-2);border-radius:0 0 var(--r-md) var(--r-md)}
.benchmarks{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:var(--s2)}
.benchmark{appearance:none;text-align:left;cursor:pointer;background:var(--bg-2);
  border:1px solid var(--line);border-radius:var(--r-sm);padding:var(--s3);display:flex;
  flex-direction:column;gap:var(--s2);
  transition:border-color var(--t-fast) var(--ease),background-color var(--t-fast) var(--ease)}
.benchmark:hover{border-color:var(--cyan);background:var(--bg-3)}
.benchmark__title{font-size:12px;font-weight:600}
.benchmark__meta{font-family:var(--font-mono);font-size:10px;color:var(--text-dim);display:flex;flex-wrap:wrap;gap:var(--s2)}
.benchmark__desc{font-size:10.5px;color:var(--text-dim);line-height:1.5}
.benchmarks__msg{padding:var(--s3);font-size:11.5px;color:var(--text-dim)}
.benchmarks__msg[data-tone="error"]{color:var(--red)}
.dropzone{display:flex;flex-direction:column;align-items:center;gap:var(--s2);padding:var(--s6) var(--s4);
  text-align:center;cursor:pointer;border:1px dashed var(--line-strong);border-radius:var(--r-md);
  background:var(--bg-2);color:var(--text-dim);
  transition:border-color var(--t-fast) var(--ease),background-color var(--t-fast) var(--ease)}
.dropzone:hover,.dropzone.is-dragover{border-color:var(--cyan);background:var(--bg-3)}
.dropzone__icon{width:36px;height:36px;opacity:.75}
.dropzone__title{font-size:12.5px;font-weight:600;color:var(--text)}
.dropzone__hint{font-size:10.5px}
.upload{display:flex;flex-direction:column;gap:var(--s2);padding:var(--s3);background:var(--bg-2);
  border:1px solid var(--line);border-radius:var(--r-sm)}
.upload[hidden]{display:none}
.upload__row{display:flex;justify-content:space-between;gap:var(--s3);font-size:11px}
.upload__name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.upload__state{color:var(--cyan);white-space:nowrap}
.upload[data-state="error"] .upload__state,.upload[data-state="error"] .upload__detail{color:var(--red)}
.upload[data-state="done"] .upload__state,.upload[data-state="done"] .upload__detail{color:var(--green)}
.upload__detail{font-size:10.5px;color:var(--text-dim);line-height:1.5}
.progress{height:4px;border-radius:2px;background:var(--bg-3);border:1px solid var(--line);overflow:hidden}
.progress__fill{height:100%;width:0%;background:var(--cyan);transition:width var(--t-mid) var(--ease)}
.upload[data-state="error"] .progress__fill{background:var(--red)}
.upload[data-state="done"] .progress__fill{background:var(--green)}

/* ================= 6 · TOASTS ================= */
.toasts{position:absolute;right:var(--s4);bottom:calc(var(--transport-h) + var(--s3));z-index:90;
  display:flex;flex-direction:column;gap:var(--s2);pointer-events:none;max-width:min(340px,calc(100% - 32px))}
.toast{padding:var(--s2) var(--s3);background:var(--bg-3);border:1px solid var(--line-strong);
  border-left:3px solid var(--cyan);border-radius:var(--r-sm);box-shadow:var(--shadow);
  font-size:11.5px;color:var(--text);animation:toast-in 170ms var(--ease)}
.toast[data-tone="ok"]{border-left-color:var(--green)}
.toast[data-tone="warn"]{border-left-color:var(--amber)}
.toast[data-tone="error"]{border-left-color:var(--red)}
.toast.is-leaving{animation:toast-out 150ms var(--ease) forwards}
@keyframes toast-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes toast-out{to{opacity:0;transform:translateY(4px)}}

/* ================= 7 · RESPONSIVE ================= */
@media (max-width:1600px){.ops-grid{grid-template-columns:minmax(0,1fr) 296px}}
@media (max-width:1440px){.identity__sub{display:none}.worknav__note{display:none}}
@media (max-width:1280px){
  .cmdbar{grid-template-columns:minmax(0,1fr) auto;
    grid-template-areas:"identity actions" "mission state" "readouts readouts";row-gap:var(--s2)}
  .cmdbar__mission{padding-left:0;border-left:0}
  .cmdbar__state{justify-content:flex-end}
  .ops-grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"summary" "instruments" "rail"}
  .rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start}
  .config-grid{grid-template-columns:repeat(auto-fit,minmax(320px,1fr))}
}
@media (max-width:1024px){
  .viewport-grid{grid-template-columns:minmax(0,1fr)}
  .canvas-stage{aspect-ratio:16/9}
  .transport{grid-template-columns:auto minmax(0,1fr);
    grid-template-areas:"controls speed" "timeline timeline";row-gap:var(--s2)}
  .transport__speed{justify-content:flex-end}
  .transport__group--end{display:none}
}
@media (max-width:768px){
  .workspace{padding:var(--s2)}
  .cmdbar{grid-template-columns:minmax(0,1fr);
    grid-template-areas:"identity" "mission" "state" "readouts" "actions";padding:var(--s3)}
  .cmdbar__state{justify-content:flex-start;flex-wrap:wrap}
  .cmdbar__actions,.cmdbar__readouts{flex-wrap:wrap}
  .readout{flex:1 1 44%;border-bottom:1px solid var(--line)}
  .summary-strip{grid-template-columns:repeat(auto-fit,minmax(142px,1fr))}
  .worknav{padding:0 var(--s2)}
  .worktab{padding:var(--s2) var(--s3)}
  .worktab__sub{display:none}
  .btn{height:36px;padding:0 var(--s3)}
  .btn--sm,.btn--xs{height:32px}
  .btn--icon{width:36px}
  .segmented__btn{height:32px}
  .select,.select--sm{height:34px}
  .rail,.config-grid{grid-template-columns:minmax(0,1fr)}
  .canvas-stage,.camera-stage{min-height:190px}
  .scope__plot{height:108px}
  .radar-legend{position:static;max-width:none;border:0;border-top:1px solid var(--line);
    border-radius:0;background:var(--bg-1)}
  .toasts{right:var(--s2);left:var(--s2);bottom:calc(var(--transport-h) + var(--s5));max-width:none}
  .modal{padding:0;align-items:flex-end}
  .modal__dialog{width:100%;max-height:92vh;border-radius:var(--r-md) var(--r-md) 0 0}
  .log{max-height:240px}
}

/* ================= 8 · REDUCED MOTION ================= */
@media (prefers-reduced-motion:reduce){
  .console-root *,.console-root *::before,.console-root *::after{
    animation-duration:.01ms !important;animation-iteration-count:1 !important;
    transition-duration:.01ms !important}
  .link-chip__dot{animation:none !important;opacity:1 !important}
}

/* ================= 9 · SCROLLBARS ================= */
.log::-webkit-scrollbar,.modal__body::-webkit-scrollbar,.table-wrap::-webkit-scrollbar{width:8px;height:8px}
.log::-webkit-scrollbar-track,.modal__body::-webkit-scrollbar-track,.table-wrap::-webkit-scrollbar-track{background:var(--bg-inset)}
.log::-webkit-scrollbar-thumb,.modal__body::-webkit-scrollbar-thumb,.table-wrap::-webkit-scrollbar-thumb{background:var(--line-strong);border-radius:4px}
`;

/* =========================================================================
   MARKUP  (body of index.html)
   ========================================================================= */
const CONSOLE_HTML = `
<a class="skip-link" href="#workspace">Skip to workspace</a>
<div class="console">

  <!-- 1 · COMMAND HEADER -->
  <header class="cmdbar">
    <div class="cmdbar__identity">
      <svg class="brandmark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".55"/>
        <circle cx="16" cy="16" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4" opacity=".8"/>
        <circle cx="16" cy="16" r="2" fill="currentColor"/>
        <path d="M16 1.5v6M16 24.5v6M1.5 16h6M24.5 16h6" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      <div>
        <h1 class="identity__name">DRISHTI&#8209;PAT <span class="identity__rev">MK-IV</span></h1>
        <p class="identity__sub">FSOC Pointing · Acquisition · Tracking — Ground Terminal Simulator</p>
      </div>
    </div>

    <div class="cmdbar__mission">
      <span class="mission__label">SCENARIO</span>
      <span class="mission__name" id="active-scenario-name">NOT LOADED</span>
    </div>

    <div class="cmdbar__state">
      <div class="link-chip" id="conn-chip" data-state="connecting" role="status" aria-live="polite">
        <span class="link-chip__dot" aria-hidden="true"></span>
        <span class="link-chip__label">TRANSPORT</span>
        <span class="link-chip__value" id="sys-status-val">CONNECTING</span>
      </div>
      <div class="run-chip" id="run-state-chip" data-state="idle">
        <span class="run-chip__label">STREAM</span>
        <span class="run-chip__value" id="run-state-val">IDLE</span>
      </div>
    </div>

    <dl class="cmdbar__readouts">
      <div class="readout"><dt class="readout__key">FRAME</dt>
        <dd class="readout__val num" id="frame-counter">-- / --</dd></div>
      <div class="readout"><dt class="readout__key">STREAM</dt>
        <dd class="readout__val num" id="stream-fps">--<span class="readout__unit">fps</span></dd></div>
      <div class="readout"><dt class="readout__key" title="Backend processing time per frame">LOOP</dt>
        <dd class="readout__val num" id="algo-latency">--<span class="readout__unit">ms</span></dd></div>
      <div class="readout"><dt class="readout__key">SIM T+</dt>
        <dd class="readout__val num" id="sim-time">--<span class="readout__unit">s</span></dd></div>
    </dl>

    <div class="cmdbar__actions">
      <label class="select-field">
        <span class="select-field__label">SOURCE</span>
        <select id="scenario-select" class="select" aria-label="Select simulation scenario">
          <option value="" disabled selected>Waiting for scenario list…</option>
        </select>
      </label>
      <button type="button" class="btn btn--ghost" id="btn-open-video-modal" aria-haspopup="dialog">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.5 4.5h5l1.2 1.5h6.8v7a1 1 0 0 1-1 1h-12a1 1 0 0 1-1-1v-8.5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
        <span>Video Source</span>
      </button>
      <button type="button" class="btn btn--ghost btn--icon btn-sound" id="btn-sound-toggle" aria-pressed="true" aria-label="Audio telemetry cues: on" title="Audio telemetry cues">
        <svg class="icon icon--audio-on" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8.5 2.5 5 5.5H2.5v5H5l3.5 3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M11 5.6a3.4 3.4 0 0 1 0 4.8M13 3.6a6.2 6.2 0 0 1 0 8.8" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        <svg class="icon icon--audio-off" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8.5 2.5 5 5.5H2.5v5H5l3.5 3z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="m11 6 4 4M15 6l-4 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
      </button>
    </div>
  </header>

  <div class="link-banner" id="link-banner" role="alert" hidden>
    <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.8 15 14H1z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="M8 6v3.4M8 11.3v.8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>
    <span class="link-banner__text" id="link-banner-text">Telemetry transport offline.</span>
    <button type="button" class="btn btn--xs" id="btn-retry-link">Retry now</button>
  </div>

  <!-- 2 · NAVIGATION -->
  <nav class="worknav" aria-label="Workspaces">
    <div class="worknav__tabs" role="tablist" aria-label="Console workspaces">
      <button class="worktab is-active" role="tab" id="tab-flight-ops" aria-selected="true" aria-controls="panel-flight-ops" data-panel="flight-ops" tabindex="0">
        <span class="worktab__name">Tracking</span><span class="worktab__sub">Radar · Optics · Telemetry</span></button>
      <button class="worktab" role="tab" id="tab-hardware-control" aria-selected="false" aria-controls="panel-hardware-control" data-panel="hardware-control" tabindex="-1">
        <span class="worktab__name">Gimbal &amp; Controls</span><span class="worktab__sub">PID · Slew · Reacquisition</span></button>
      <button class="worktab" role="tab" id="tab-target-optics" aria-selected="false" aria-controls="panel-target-optics" data-panel="target-optics" tabindex="-1">
        <span class="worktab__name">Targets &amp; Optics</span><span class="worktab__sub">Kinematics · Noise · Atmosphere</span></button>
      <button class="worktab" role="tab" id="tab-performance-metrics" aria-selected="false" aria-controls="panel-performance-metrics" data-panel="performance-metrics" tabindex="-1">
        <span class="worktab__name">Performance</span><span class="worktab__sub">Verification · Profiling · Export</span></button>
    </div>
    <p class="worknav__note">Closed-loop coarse PAT engine · engineering simulation</p>
  </nav>

  <!-- 3 · WORKSPACES -->
  <main class="workspace" id="workspace">

    <!-- PANEL 1 · TRACKING -->
    <section class="panel-view" id="panel-flight-ops" role="tabpanel" aria-labelledby="tab-flight-ops" tabindex="0">
      <div class="ops-grid">

        <div class="summary-strip">
          <article class="metric metric--lead">
            <h3 class="metric__label">Tracking State</h3>
            <p class="metric__value" id="fsm-badge" data-state="unknown">--</p>
            <p class="metric__foot" id="fsm-note">No telemetry</p>
          </article>
          <article class="metric metric--lead">
            <h3 class="metric__label">Estimator</h3>
            <p class="metric__value num" id="tracker-mode-val" data-mode="none">--</p>
            <p class="metric__foot" id="tracker-mode-sub">No telemetry</p>
          </article>
          <article class="metric">
            <h3 class="metric__label">Lock Retention</h3>
            <p class="metric__value num" id="lock-retention-val">--<span class="metric__unit">%</span></p>
            <p class="metric__foot" id="lock-state-sub" data-state="unknown">No telemetry</p>
          </article>
          <article class="metric">
            <h3 class="metric__label"><abbr title="Radial angular distance between gimbal boresight and the designated beacon">Radial Error</abbr></h3>
            <p class="metric__value num" id="err-mrad-val">--<span class="metric__unit">mrad</span></p>
            <div class="meter" role="img" aria-label="Radial tracking error against 4 mrad full scale">
              <div class="meter__fill" id="err-mrad-bar"></div>
              <span class="meter__pip" style="left:50%" title="2.00 mrad engineering tolerance reference"></span>
            </div>
            <p class="metric__foot">Tolerance ref 2.00 mrad</p>
          </article>
          <article class="metric">
            <h3 class="metric__label">Focal-Plane Deviation</h3>
            <p class="metric__value num" id="err-px-val">--<span class="metric__unit">px</span></p>
            <div class="meter" role="img" aria-label="Focal plane deviation against 50 pixel full scale">
              <div class="meter__fill" id="err-px-bar"></div>
            </div>
            <p class="metric__foot">Full scale 50 px</p>
          </article>
          <article class="metric">
            <h3 class="metric__label"><abbr title="Detector confidence score from the optical detection stage (0–1). This is not a signal-to-noise ratio.">Detector Confidence</abbr></h3>
            <p class="metric__value num" id="confidence-val">--</p>
            <div class="meter" role="img" aria-label="Detector confidence, detection gate at 0.40">
              <div class="meter__fill meter__fill--green" id="conf-bar"></div>
              <span class="meter__pip" style="left:40%" title="0.40 detection gate"></span>
            </div>
            <p class="metric__foot">Detection gate 0.40</p>
          </article>
          <article class="metric">
            <h3 class="metric__label"><abbr title="Normalised atmospheric turbulence severity used to arbitrate Kalman vs Particle filter">Turbulence Severity</abbr></h3>
            <p class="metric__value num" id="severity-val">--</p>
            <div class="meter" role="img" aria-label="Turbulence severity, filter switch boundary at 0.55">
              <div class="meter__fill meter__fill--amber" id="sev-bar"></div>
              <span class="meter__pip meter__pip--red" style="left:55%" title="0.55 KF/PF switch boundary"></span>
            </div>
            <p class="metric__foot">Switch boundary 0.55</p>
          </article>
          <article class="metric metric--compact">
            <h3 class="metric__label"><abbr title="Fried coherence length — atmospheric coherence diameter">Fried r₀</abbr></h3>
            <p class="metric__value num" id="fried-r0-val">--<span class="metric__unit">mm</span></p>
            <p class="metric__foot">λ 1550 nm</p>
          </article>
          <article class="metric metric--compact">
            <h3 class="metric__label">Acquisition Time</h3>
            <p class="metric__value num" id="acq-time-val">--<span class="metric__unit">s</span></p>
            <p class="metric__foot">To first lock</p>
          </article>
          <article class="metric metric--compact">
            <h3 class="metric__label">Reacq Tier</h3>
            <p class="metric__value num metric__value--sm" id="reacq-tier-val">--</p>
            <p class="metric__foot">Search law stage</p>
          </article>
          <article class="metric metric--compact">
            <h3 class="metric__label">Gimbal Pan / Tilt</h3>
            <p class="metric__value num metric__value--sm" id="gimbal-pt-val">-- / --</p>
            <p class="metric__foot">mrad, boresight frame</p>
          </article>
        </div>

        <div class="instruments">
          <div class="panel instrument-shell">
            <div class="toolbar">
              <div class="segmented" role="group" aria-label="Instrument view mode">
                <button type="button" class="segmented__btn is-active" id="tab-both-btn" data-view="both" aria-pressed="true">Dual</button>
                <button type="button" class="segmented__btn" id="tab-radar-btn" data-view="radar" aria-pressed="false">Radar</button>
                <button type="button" class="segmented__btn" id="tab-camera-btn" data-view="camera" aria-pressed="false">Optical</button>
              </div>
              <div class="toolbar__right">
                <label class="select-field">
                  <span class="select-field__label">PALETTE</span>
                  <select id="colormap-select" class="select select--sm" aria-label="Sensor colour palette">
                    <option value="turbo" selected>Turbo</option>
                    <option value="inferno">Inferno</option>
                    <option value="viridis">Viridis</option>
                    <option value="green">Phosphor</option>
                    <option value="grayscale">Grayscale</option>
                  </select>
                </label>
                <button type="button" class="btn btn--ghost btn--sm" id="radar-reset-btn">
                  <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M8 .8v3.4M8 11.8v3.4M.8 8h3.4M11.8 8h3.4" stroke="currentColor" stroke-width="1.2"/></svg>
                  <span>Re-centre</span>
                </button>
              </div>
            </div>

            <div class="viewport-grid" id="displays-container" data-view="both">
              <section class="viewport viewport--radar" id="radar-card" aria-label="2D angular tracking radar">
                <header class="viewport__head">
                  <h2 class="viewport__title"><span class="dot dot--cyan" aria-hidden="true"></span>2D Angular Field &amp; Gimbal FOV</h2>
                  <p class="viewport__readout num" id="radar-coords">PAN -- · TILT --</p>
                </header>
                <div class="canvas-stage">
                  <canvas id="radar-canvas" role="img" aria-label="Angular tracking radar showing boresight, targets and detector field of view"></canvas>
                  <ul class="radar-legend">
                    <li><span class="key key--primary"></span>Primary beacon</li>
                    <li><span class="key key--secondary"></span>Secondary</li>
                    <li><span class="key key--pf"></span>PF dispersion</li>
                    <li><span class="key key--fov"></span>Detector FOV</li>
                    <li><span class="key key--reticle"></span>Boresight</li>
                    <li><span class="key key--reacq"></span>Tier-1 search</li>
                  </ul>
                </div>
              </section>

              <section class="viewport viewport--camera" id="camera-card" aria-label="Optical sensor feed">
                <header class="viewport__head">
                  <h2 class="viewport__title"><span class="dot dot--amber" id="cam-indicator" aria-hidden="true"></span><span id="camera-title-text">CMOS Optical Sensor</span></h2>
                  <p class="viewport__readout num" id="camera-snr">CONF -- · GAIN --</p>
                </header>
                <div class="camera-stage" id="camera-stage" data-state="waiting">
                  <img id="camera-frame-img" class="camera-stage__img" alt="Optical sensor frame" />
                  <div class="camera-empty" id="camera-empty">
                    <svg class="camera-empty__icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
                      <rect x="4.5" y="9.5" width="31" height="21" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"/>
                      <circle cx="20" cy="20" r="6" fill="none" stroke="currentColor" stroke-width="1.4"/>
                      <path d="M20 11v3M20 26v3M11 20h3M26 20h3" stroke="currentColor" stroke-width="1.2"/>
                    </svg>
                    <p class="camera-empty__title" id="camera-empty-title">WAITING FOR OPTICAL SENSOR FRAME</p>
                    <p class="camera-empty__desc" id="camera-empty-desc">No image frame received from the telemetry stream.</p>
                  </div>
                  <div class="camera-hud" aria-hidden="true">
                    <span class="bracket bracket--tl"></span><span class="bracket bracket--tr"></span>
                    <span class="bracket bracket--bl"></span><span class="bracket bracket--br"></span>
                  </div>
                  <dl class="camera-stamp num">
                    <div><dt>PEAK</dt><dd id="cam-peak-counts">--</dd></div>
                    <div><dt>SPOT</dt><dd id="cam-spot-pos">--</dd></div>
                    <div><dt>AGC</dt><dd id="cam-gain-stat">--</dd></div>
                  </dl>
                </div>
              </section>
            </div>
          </div>

          <section class="panel" aria-label="Closed-loop telemetry history">
            <header class="scope__head">
              <h2 class="panel__title">Closed-Loop History</h2>
              <ul class="scope__legend num">
                <li><span class="trace trace--cyan"></span>Error <strong id="scope-ch1-val">--</strong> mrad</li>
                <li><span class="trace trace--green"></span>Conf <strong id="scope-ch2-val">--</strong></li>
                <li><span class="trace trace--amber"></span>Sev <strong id="scope-ch3-val">--</strong></li>
              </ul>
            </header>
            <div class="scope__plot">
              <canvas id="telemetry-chart-canvas" role="img" aria-label="Rolling history of tracking error, detector confidence and turbulence severity"></canvas>
            </div>
          </section>
        </div>

        <aside class="rail" aria-label="Diagnostics and disturbance controls">
          <section class="panel">
            <header class="panel__cap">
              <h2 class="panel__title">Disturbance Injection</h2>
              <button type="button" class="btn btn--danger btn--sm" id="btn-inject-occ">
                <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M9 1.5 3.5 9H7.5l-.5 5.5L12.5 7H8.5z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>
                <span>Inject Occluder</span>
              </button>
            </header>
            <div class="panel__body stack">
              <div class="field">
                <div class="field__head">
                  <label class="field__label" for="slider-cn2">Kolmogorov turbulence C<sub>n</sub>²</label>
                  <output class="field__value num" id="cn2-disp" for="slider-cn2">1.0e-14</output>
                </div>
                <input type="range" id="slider-cn2" min="-16" max="-12" step="0.1" value="-14" class="slider" aria-describedby="turb-compact-strip" />
                <div class="pillrow" id="turb-compact-strip">
                  <span class="pill">r₀ <strong id="turb-mini-r0">--</strong></span>
                  <span class="pill">σ<sub>R</sub>² <strong id="turb-mini-rytov">--</strong></span>
                  <span class="pill">fade <strong id="turb-mini-fade">--</strong></span>
                  <span class="pill">strehl <strong id="turb-mini-strehl">--</strong></span>
                  <span class="pill pill--regime" id="turb-mini-regime" data-regime="unknown">--</span>
                </div>
              </div>
              <div class="field">
                <div class="field__head">
                  <label class="field__label" for="slider-vib-amp">Platform jitter amplitude</label>
                  <output class="field__value num" id="vib-amp-disp" for="slider-vib-amp">0.30 mrad</output>
                </div>
                <input type="range" id="slider-vib-amp" min="0" max="1.5" step="0.05" value="0.30" class="slider" />
              </div>
              <div class="field">
                <div class="field__head">
                  <label class="field__label" for="slider-vib-freq">Jitter frequency</label>
                  <output class="field__value num" id="vib-freq-disp" for="slider-vib-freq">10 Hz</output>
                </div>
                <input type="range" id="slider-vib-freq" min="1" max="50" step="1" value="10" class="slider" />
              </div>
            </div>
          </section>

          <section class="panel panel--log">
            <header class="panel__cap">
              <h2 class="panel__title">Event Log</h2>
              <div class="panel__cap-actions">
                <label class="check check--inline"><input type="checkbox" id="chk-log-autoscroll" checked /><span>Follow</span></label>
                <button type="button" class="btn btn--ghost btn--xs" id="btn-clear-log">Clear</button>
              </div>
            </header>
            <ol class="log num" id="event-log-terminal" role="log" aria-label="Mission event log" aria-live="polite"></ol>
          </section>
        </aside>
      </div>
    </section>

    <!-- PANEL 2 · GIMBAL & CONTROLS -->
    <section class="panel-view" id="panel-hardware-control" role="tabpanel" aria-labelledby="tab-hardware-control" tabindex="0" hidden>
      <div class="config-grid">
        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">2-Axis Gimbal PID Servo Loop</h2>
            <button type="button" class="btn btn--primary btn--sm" id="btn-apply-pid">Apply Servo Gains</button>
          </header>
          <div class="panel__body stack">
            <p class="prose">Proportional, integral and derivative servo gains with velocity feed-forward compensation for the pan/tilt actuator loops.</p>
            <div class="field">
              <div class="field__head"><label class="field__label" for="pid-kp">Proportional gain K<sub>p</sub></label>
                <output class="field__value num" id="pid-kp-disp" for="pid-kp">0.35</output></div>
              <input type="range" id="pid-kp" min="0.05" max="1.5" step="0.05" value="0.35" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="pid-ki">Integral gain K<sub>i</sub></label>
                <output class="field__value num" id="pid-ki-disp" for="pid-ki">0.00</output></div>
              <input type="range" id="pid-ki" min="0.0" max="0.5" step="0.02" value="0.0" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="pid-kd">Derivative gain K<sub>d</sub></label>
                <output class="field__value num" id="pid-kd-disp" for="pid-kd">0.15</output></div>
              <input type="range" id="pid-kd" min="0.01" max="0.5" step="0.01" value="0.15" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="pid-kff">Velocity feed-forward K<sub>ff</sub></label>
                <output class="field__value num" id="pid-kff-disp" for="pid-kff">1.00</output></div>
              <input type="range" id="pid-kff" min="0.0" max="1.5" step="0.05" value="1.0" class="slider" />
            </div>
            <label class="check"><input type="checkbox" id="chk-feedforward" checked /><span>Enable target-velocity feed-forward compensation</span></label>
          </div>
        </section>

        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">Actuator Slew Limits &amp; Command Latency</h2>
            <button type="button" class="btn btn--primary btn--sm" id="btn-apply-hw">Apply Actuator Limits</button>
          </header>
          <div class="panel__body stack">
            <p class="prose">Electro-mechanical slew rate ceilings and discrete command delay modelling the hardware driver pipeline.</p>
            <div class="field">
              <div class="field__head"><label class="field__label" for="hw-max-vel">Max slew velocity</label>
                <output class="field__value num" id="hw-max-vel-disp" for="hw-max-vel">0.50 rad/s</output></div>
              <input type="range" id="hw-max-vel" min="0.05" max="1.5" step="0.05" value="0.50" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="hw-max-acc">Max slew acceleration</label>
                <output class="field__value num" id="hw-max-acc-disp" for="hw-max-acc">1.00 rad/s²</output></div>
              <input type="range" id="hw-max-acc" min="0.1" max="3.0" step="0.1" value="1.0" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="hw-latency">Command delay queue</label>
                <output class="field__value num" id="hw-latency-disp" for="hw-latency">2 frames (~66 ms)</output></div>
              <input type="range" id="hw-latency" min="0" max="6" step="1" value="2" class="slider" />
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">Reacquisition Search Controller</h2>
            <button type="button" class="btn btn--primary btn--sm" id="btn-apply-reacq">Apply Search Law</button>
          </header>
          <div class="panel__body stack">
            <p class="prose">Hierarchical search on line-of-sight loss: Tier 1 forward-projected uncertainty ellipse, Tier 2 expanding spiral.</p>
            <label class="check"><input type="checkbox" id="chk-pred-search" checked /><span>Tier 1 localised predictive search <span class="hint">(A/B comparison toggle)</span></span></label>
            <div class="field">
              <div class="field__head"><label class="field__label" for="reacq-budget">Tier 1 search budget</label>
                <output class="field__value num" id="reacq-budget-disp" for="reacq-budget">25 frames</output></div>
              <input type="range" id="reacq-budget" min="5" max="50" step="5" value="25" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="reacq-rate">Gimbal scan rate</label>
                <output class="field__value num" id="reacq-rate-disp" for="reacq-rate">0.12 rad/s</output></div>
              <input type="range" id="reacq-rate" min="0.04" max="0.30" step="0.02" value="0.12" class="slider" />
            </div>
          </div>
        </section>

        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">CMOS Auto-Exposure / AGC</h2>
            <span class="chip" id="agc-chip" data-tone="ok">ENABLED</span>
          </header>
          <div class="panel__body stack">
            <p class="prose">Automated exposure and gain adaptation keeps the beacon spot inside the detector's optimal dynamic range across range variations.</p>
            <label class="check"><input type="checkbox" id="chk-auto-exposure" checked /><span>Enable autonomous sensor exposure &amp; gain control</span></label>
            <dl class="factlist num">
              <div><dt>Target peak</dt><dd>200 counts</dd></div>
              <div><dt>Gain range</dt><dd>0.02× – 50.0×</dd></div>
              <div><dt>Live gain</dt><dd id="agc-live-gain">--</dd></div>
            </dl>
          </div>
        </section>
      </div>
    </section>

    <!-- PANEL 3 · TARGETS & OPTICS -->
    <section class="panel-view" id="panel-target-optics" role="tabpanel" aria-labelledby="tab-target-optics" tabindex="0" hidden>
      <div class="config-grid">
        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">Target Trajectory &amp; Kinematics</h2>
            <button type="button" class="btn btn--primary btn--sm" id="btn-apply-motion">Set Trajectory</button>
          </header>
          <div class="panel__body stack">
            <p class="prose">Switch the kinematic motion pattern of optical beacon terminals within the 2D angular field.</p>
            <div class="field">
              <label class="field__label" for="motion-type-select">Kinematic motion profile</label>
              <select id="motion-type-select" class="select select--block">
                <option value="straight_line" selected>Rectilinear (constant velocity)</option>
                <option value="circular">Circular orbit</option>
                <option value="figure_eight">Lissajous lemniscate (figure eight)</option>
                <option value="spiral">Archimedean expanding spiral</option>
                <option value="sinusoidal">Transverse harmonic oscillation</option>
                <option value="random">Stochastic bounded random walk</option>
              </select>
            </div>
            <div class="field">
              <label class="field__label" for="target-switch-select">Designated tracking beacon</label>
              <select id="target-switch-select" class="select select--block">
                <option value="">No targets reported</option>
              </select>
            </div>
            <label class="check"><input type="checkbox" id="chk-signature-verif" /><span>Temporal blinking signature verification <span class="hint">(rejects clutter and decoys)</span></span></label>
          </div>
        </section>

        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">Optical Sensor Noise Models</h2>
            <button type="button" class="btn btn--primary btn--sm" id="btn-apply-noise">Apply Noise Models</button>
          </header>
          <div class="panel__body stack">
            <p class="prose">Gaussian readout noise, Poisson photon shot noise and impulse hot/dead pixel defects.</p>
            <div class="checkrow">
              <label class="check"><input type="checkbox" id="noise-chk-gaussian" checked /><span>Gaussian readout</span></label>
              <label class="check"><input type="checkbox" id="noise-chk-poisson" /><span>Poisson shot</span></label>
              <label class="check"><input type="checkbox" id="noise-chk-saltpepper" /><span>Salt &amp; pepper</span></label>
            </div>
            <div class="field" id="field-noise-std">
              <div class="field__head"><label class="field__label" for="noise-std-input">Gaussian readout σ</label>
                <output class="field__value num" id="noise-std-disp" for="noise-std-input">4.0 counts</output></div>
              <input type="range" id="noise-std-input" min="0" max="15" step="0.5" value="4.0" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="noise-poisson-input">Photon conversion scale</label>
                <output class="field__value num" id="noise-poisson-disp" for="noise-poisson-input">1.00</output></div>
              <input type="range" id="noise-poisson-input" min="0.1" max="5.0" step="0.1" value="1.0" class="slider" />
            </div>
            <div class="field">
              <div class="field__head"><label class="field__label" for="noise-sp-input">Impulse defect probability</label>
                <output class="field__value num" id="noise-sp-disp" for="noise-sp-input">0.05%</output></div>
              <input type="range" id="noise-sp-input" min="0.0" max="0.005" step="0.0005" value="0.0005" class="slider" />
            </div>
            <p class="field__error" id="noise-error" hidden>Select at least one noise model before applying.</p>
          </div>
        </section>

        <section class="panel panel--wide">
          <header class="panel__cap">
            <h2 class="panel__title">Atmospheric Turbulence &amp; Wave Propagation</h2>
            <span class="chip" id="turb-regime-badge" data-tone="neutral">NO TELEMETRY</span>
          </header>
          <div class="panel__body">
            <p class="prose">Kolmogorov phase-screen propagation: Fried parameter, Rytov variance, scintillation fading, PSF broadening, Strehl ratio and beam wander.</p>
            <div class="turbgrid num">
              <div class="turbcell"><span class="turbcell__k">Refractive structure constant C<sub>n</sub>²</span><span class="turbcell__v" id="turb-cn2-val">--</span><span class="turbcell__u">m⁻²ᐟ³</span></div>
              <div class="turbcell"><span class="turbcell__k">Fried coherence length r₀</span><span class="turbcell__v turbcell__v--cyan" id="turb-r0-val">--</span><span class="turbcell__u">λ 1550 nm @ 5.0 km</span></div>
              <div class="turbcell"><span class="turbcell__k">Rytov log-amplitude variance</span><span class="turbcell__v" id="turb-rytov-val">--</span><span class="turbcell__u">Plane wave</span></div>
              <div class="turbcell"><span class="turbcell__k">Scintillation index</span><span class="turbcell__v" id="turb-scint-val">--</span><span class="turbcell__u">Aperture averaged</span></div>
              <div class="turbcell"><span class="turbcell__k">Intensity attenuation / fade</span><span class="turbcell__v turbcell__v--amber" id="turb-fade-val">--</span><span class="turbcell__u">Deep-fade estimate</span></div>
              <div class="turbcell"><span class="turbcell__k">PSF spot broadening σ</span><span class="turbcell__v" id="turb-blur-val">--</span><span class="turbcell__u">D / r₀ Gaussian</span></div>
              <div class="turbcell"><span class="turbcell__k">Telescope Strehl ratio</span><span class="turbcell__v turbcell__v--cyan" id="turb-strehl-val">--</span><span class="turbcell__u">10 cm aperture</span></div>
              <div class="turbcell"><span class="turbcell__k">Angular beam wander</span><span class="turbcell__v" id="turb-wander-val">--</span><span class="turbcell__u">Tilt random walk, 1σ</span></div>
              <div class="turbcell"><span class="turbcell__k">Turbulence severity score</span><span class="turbcell__v turbcell__v--amber" id="turb-sev-val">--</span><span class="turbcell__u">KF ↔ PF transition metric</span></div>
              <div class="turbcell"><span class="turbcell__k">Phase screen FFT latency</span><span class="turbcell__v turbcell__v--green" id="turb-time-val">--</span><span class="turbcell__u">Spectral synthesis</span></div>
            </div>
          </div>
        </section>
      </div>
    </section>

    <!-- PANEL 4 · PERFORMANCE -->
    <section class="panel-view" id="panel-performance-metrics" role="tabpanel" aria-labelledby="tab-performance-metrics" tabindex="0" hidden>
      <div class="report">
        <section class="panel report__head">
          <div>
            <h2 class="panel__title panel__title--lg">Simulation Verification Report</h2>
            <p class="report__sub">Reference Evaluation Profile · PS-26169 reference scenario · generated from simulated telemetry</p>
          </div>
          <div class="report__actions">
            <button type="button" class="btn btn--ghost btn--sm" id="btn-download-csv">
              <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.8v8.6M4.8 7.4 8 10.6l3.2-3.2M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Export CSV</span>
            </button>
            <button type="button" class="btn btn--ghost btn--sm" id="btn-download-json">
              <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 1.8v8.6M4.8 7.4 8 10.6l3.2-3.2M2.5 13.5h11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>Export JSON</span>
            </button>
          </div>
        </section>

        <div class="kpi-grid">
          <article class="kpi"><h3 class="kpi__label">Initial Acquisition</h3>
            <p class="kpi__value num" id="kpi-acq-time" data-tone="none">--</p>
            <p class="kpi__foot">Engineering reference: &lt; 1.0 s to first lock</p></article>
          <article class="kpi"><h3 class="kpi__label">Mean Tracking Error</h3>
            <p class="kpi__value num" id="kpi-mean-err" data-tone="none">--</p>
            <p class="kpi__foot">Radial boresight offset, run average</p></article>
          <article class="kpi"><h3 class="kpi__label">Peak Tracking Error</h3>
            <p class="kpi__value num" id="kpi-max-err" data-tone="none">--</p>
            <p class="kpi__foot">Worst excursion during the run</p></article>
          <article class="kpi"><h3 class="kpi__label">RMSE</h3>
            <p class="kpi__value num" id="kpi-rmse-err" data-tone="none">--</p>
            <p class="kpi__foot">Engineering tolerance reference: 2.0 mrad</p></article>
          <article class="kpi"><h3 class="kpi__label">Lock Retention</h3>
            <p class="kpi__value num" id="kpi-lock-rate" data-tone="none">--</p>
            <p class="kpi__foot">Share of simulated frames in lock</p></article>
          <article class="kpi"><h3 class="kpi__label">Processing Rate</h3>
            <p class="kpi__value num" id="kpi-algo-fps" data-tone="none">--</p>
            <p class="kpi__foot">Backend pipeline throughput</p></article>
        </div>

        <section class="panel">
          <header class="panel__cap">
            <h2 class="panel__title">Pipeline Stage Profiling</h2>
            <span class="panel__cap-note num">per-frame, backend reported</span>
          </header>
          <div class="table-wrap">
            <table class="table">
              <caption class="sr-only">Per-frame latency of each closed-loop pipeline stage</caption>
              <thead><tr><th scope="col">Pipeline stage</th><th scope="col" class="table__num">Latency</th><th scope="col">Subsystem</th><th scope="col">Status</th></tr></thead>
              <tbody>
                <tr><th scope="row">1 · Frame rendering &amp; Gaussian PSF optics</th><td class="table__num" id="prof-render">--</td><td>Optics engine</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">2 · Kolmogorov turbulence phase screen</th><td class="table__num" id="prof-turb">--</td><td>Atmospheric sim</td><td><span class="chip" id="prof-turb-chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">3 · Sensor noise suite</th><td class="table__num" id="prof-noise">--</td><td>Detector model</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">4 · Platform vibration &amp; angular jitter</th><td class="table__num" id="prof-vib">--</td><td>Mechanical sim</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">5 · Occlusion geometry &amp; shadowing</th><td class="table__num" id="prof-occ">--</td><td>LOS geometry</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">6 · Detection (top-hat + centroiding)</th><td class="table__num" id="prof-detect">--</td><td>Computer vision</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">7 · State estimation (Kalman / particle)</th><td class="table__num" id="prof-track">--</td><td>Estimation engine</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
                <tr><th scope="row">8 · Gimbal control laws + slew limiter</th><td class="table__num" id="prof-control">--</td><td>Control law</td><td><span class="chip" data-tone="neutral">AWAITING</span></td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="panel">
          <header class="panel__cap"><h2 class="panel__title">Track-Loss Diagnosis</h2></header>
          <div class="panel__body">
            <div class="diagnosis" id="diagnosis-content" data-tone="neutral">
              <p class="diagnosis__headline">NO TELEMETRY — diagnosis unavailable</p>
            </div>
          </div>
        </section>
      </div>
    </section>
  </main>

  <!-- 4 · TRANSPORT -->
  <footer class="transport">
    <div class="transport__group transport__group--main" role="group" aria-label="Playback transport">
      <button type="button" class="btn btn--primary transport__play btn-play" id="btn-play" data-mode="play">
        <svg class="icon icon--play" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 2.8 13 8l-8.5 5.2z" fill="currentColor"/></svg>
        <svg class="icon icon--pause" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/></svg>
        <span id="btn-play-label">PLAY</span>
      </button>
      <button type="button" class="btn btn--ghost" id="btn-pause">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.5 3h2.6v10H4.5zM8.9 3h2.6v10H8.9z" fill="currentColor"/></svg><span>PAUSE</span>
      </button>
      <button type="button" class="btn btn--ghost" id="btn-step">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 3l6 5-6 5z" fill="currentColor"/><path d="M11.6 3v10" stroke="currentColor" stroke-width="1.6"/></svg><span>STEP</span>
      </button>
      <button type="button" class="btn btn--ghost" id="btn-reset">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3 8a5 5 0 1 0 1.6-3.7" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2.6 2.6v3.2h3.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg><span>RESET</span>
      </button>
    </div>

    <div class="transport__speed">
      <label class="transport__speed-label" for="slider-speed">SPEED</label>
      <input type="range" id="slider-speed" min="0.2" max="3.0" step="0.1" value="1.0" class="slider slider--sm" />
      <output class="transport__speed-val" id="speed-label" for="slider-speed">1.0×</output>
    </div>

    <div class="transport__timeline">
      <div class="timeline" id="sim-progress" role="progressbar" aria-label="Scenario progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="timeline__fill" id="sim-progress-bar"></div>
      </div>
    </div>

    <div class="transport__group transport__group--end">
      <button type="button" class="btn btn--ghost btn--sm" id="btn-export-csv-quick">CSV</button>
      <button type="button" class="btn btn--ghost btn--sm" id="btn-export-json-quick">JSON</button>
    </div>
  </footer>
</div>

<!-- 5 · VIDEO SOURCE MODAL -->
<div class="modal" id="video-modal" hidden>
  <div class="modal__backdrop" data-modal-dismiss></div>
  <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="video-modal-title" aria-describedby="video-modal-desc">
    <header class="modal__head">
      <div>
        <h2 class="modal__title" id="video-modal-title">Optical Video Source</h2>
        <p class="modal__sub" id="video-modal-desc">Run the PAT pipeline against a recorded optical video instead of synthetic frames.</p>
      </div>
      <button type="button" class="btn btn--ghost btn--icon" id="btn-close-video-modal" aria-label="Close dialog">
        <svg class="icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
      </button>
    </header>

    <div class="modal__tabs" role="tablist" aria-label="Video source">
      <button type="button" class="modal__tab is-active" role="tab" id="tab-benchmarks-btn" aria-selected="true" aria-controls="modal-tab-benchmarks">Benchmark videos</button>
      <button type="button" class="modal__tab" role="tab" id="tab-upload-btn" aria-selected="false" aria-controls="modal-tab-upload" tabindex="-1">Upload video</button>
    </div>

    <div class="modal__body">
      <div class="modal__pane" id="modal-tab-benchmarks" role="tabpanel" aria-labelledby="tab-benchmarks-btn" tabindex="0">
        <p class="prose">Select a recorded laser/beacon video stream to execute closed-loop PAT tracking and error analysis.</p>
        <div class="benchmarks" id="benchmark-video-list"></div>
      </div>
      <div class="modal__pane" id="modal-tab-upload" role="tabpanel" aria-labelledby="tab-upload-btn" tabindex="0" hidden>
        <div class="dropzone" id="upload-dropzone" tabindex="0" role="button" aria-label="Upload an optical video file">
          <input type="file" id="video-file-input" accept=".mp4,.avi,.ogv,.webm,.mkv" class="sr-only" />
          <svg class="dropzone__icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 27V9M13.5 15.5 20 9l6.5 6.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 25v5a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2v-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
          <p class="dropzone__title">Drag &amp; drop an optical video file</p>
          <p class="dropzone__hint">MP4 · AVI · WEBM · OGV · MKV — decoded server-side</p>
          <button type="button" class="btn btn--primary btn--sm" id="btn-browse-file">Browse files</button>
        </div>
        <div class="upload" id="upload-status-box" data-state="idle" hidden>
          <div class="upload__row">
            <span class="upload__name num" id="upload-filename-txt">--</span>
            <span class="upload__state num" id="upload-progress-txt">--</span>
          </div>
          <div class="progress"><div class="progress__fill" id="upload-progress-bar"></div></div>
          <p class="upload__detail" id="upload-details-txt"></p>
        </div>
      </div>
    </div>

    <footer class="modal__foot">
      <button type="button" class="btn btn--ghost btn--sm" id="btn-cancel-video-modal">Close</button>
    </footer>
  </div>
</div>

<div class="toasts" id="toast-region" role="status" aria-live="polite"></div>
`;

/* =========================================================================
   RUNTIME  (app.js)
   ========================================================================= */
type Telemetry = Record<string, any>;

/** Resolved canvas colours. Canvas2D cannot consume CSS custom properties. */
const C = {
  cyan: '#48c8f7',
  green: '#32d583',
  amber: '#f5b54a',
  red: '#ff6b6b',
  purple: '#b18cff',
  text: '#e7eef7',
  muted: 'rgba(231,238,247,.72)',
  dim: 'rgba(115,135,160,.85)',
  grid: 'rgba(255,255,255,.045)',
  axis: 'rgba(255,255,255,.09)',
  ring: 'rgba(72,200,247,.10)',
  ringTxt: 'rgba(72,200,247,.38)',
  fid: 'rgba(255,255,255,.12)',
  plate0: '#0a1018',
  plate1: '#060a10'
} as const;

const MONO = '10px "JetBrains Mono", monospace';

function mountConsole(root: HTMLElement): () => void {
  const disposers: Array<() => void> = [];
  const on = <K extends keyof HTMLElementEventMap,>(
  node: EventTarget | null,
  type: K | string,
  fn: (ev: any) => void,
  opts?: AddEventListenerOptions) =>
  {
    if (!node) return;
    node.addEventListener(type as string, fn, opts);
    disposers.push(() => node.removeEventListener(type as string, fn, opts));
  };
  const q = <T extends HTMLElement = HTMLElement,>(id: string): T | null =>
  root.querySelector<T>('#' + id);
  const qa = <T extends HTMLElement = HTMLElement,>(sel: string): T[] =>
  Array.from(root.querySelectorAll<T>(sel));

  /* ------------------------------------------------------------- state */
  let ws: WebSocket | null = null;
  let wsRetry = 0;
  let retryTimer: number | null = null;
  let disposed = false;
  let isPlaying = false;
  let currentFrame = 0;
  let totalFrames = 0;
  let playbackSpeed = 1.0;
  let framesThisSecond = 0;
  let fpsTimer = performance.now();
  let soundEnabled = true;
  let prevMode = '';
  let prevLocked: boolean | null = null;
  let latest: Telemetry | null = null;
  let activeScenario: Telemetry | null = null;
  let hasTelemetry = false;

  const MAX_HISTORY = 120;
  const history = { errors: [] as number[], conf: [] as number[], sev: [] as number[] };
  const MAX_TRAIL = 45;
  const targetTrail: Array<{pan: number;tilt: number;}> = [];

  const viewport = { centerPan: 0.012, centerTilt: -0.004, spanPan: 0.065, spanTilt: 0.045 };
  const DEFAULT_CENTER = { pan: 0.012, tilt: -0.004 };

  /* ------------------------------------------------------------- audio */
  let audioCtx: AudioContext | null = null;
  function initAudio() {
    try {
      if (!audioCtx) {
        const Ctor: typeof AudioContext | undefined =
        (window as any).AudioContext || (window as any).webkitAudioContext;
        if (Ctor) audioCtx = new Ctor();
      }
      if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    } catch {
      audioCtx = null;
    }
  }
  function tone(freq: number, type: OscillatorType, dur: number, gainVal: number) {
    if (!soundEnabled || !audioCtx) return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(gainVal, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + dur);
    } catch {

      /* autoplay policy */}
  }
  const chirpLock = () => {
    tone(880, 'sine', 0.1, 0.06);
    window.setTimeout(() => tone(1320, 'sine', 0.14, 0.06), 80);
  };
  const chirpSwitch = () => {
    tone(520, 'triangle', 0.12, 0.05);
    window.setTimeout(() => tone(780, 'triangle', 0.12, 0.05), 90);
  };
  const alarmLoss = () => tone(280, 'sawtooth', 0.24, 0.07);

  /* ------------------------------------------------------------- toasts */
  const toastRegion = q('toast-region');
  function toast(msg: string, tone2: 'info' | 'ok' | 'warn' | 'error' = 'info') {
    if (!toastRegion) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.dataset.tone = tone2;
    node.textContent = msg;
    toastRegion.appendChild(node);
    window.setTimeout(() => {
      node.classList.add('is-leaving');
      window.setTimeout(() => node.remove(), 200);
    }, 2600);
  }
  function flashOk(btn: HTMLElement | null, label = 'Applied') {
    if (!btn) return;
    const span = btn.querySelector('span');
    const prev = span ? span.textContent : btn.textContent;
    btn.classList.add('is-ok');
    if (span) span.textContent = label;else
    btn.textContent = label;
    window.setTimeout(() => {
      btn.classList.remove('is-ok');
      if (span) span.textContent = prev || '';else
      btn.textContent = prev || '';
    }, 1200);
  }

  /* ------------------------------------------------------------- log */
  const logEl = q<HTMLOListElement>('event-log-terminal');
  const autoscrollChk = q<HTMLInputElement>('chk-log-autoscroll');
  let lastLogKey = '';
  let lastLogNode: HTMLElement | null = null;
  let lastLogCount = 1;

  function renderLogEmpty() {
    if (!logEl) return;
    if (logEl.children.length === 0) {
      const li = document.createElement('li');
      li.className = 'log__empty';
      li.textContent = 'No events recorded.';
      logEl.appendChild(li);
    }
  }
  function log(tag: string, msg: string, sev = 'info') {
    if (!logEl) return;
    const empty = logEl.querySelector('.log__empty');
    if (empty) empty.remove();

    const key = sev + '|' + tag + '|' + msg;
    if (key === lastLogKey && lastLogNode) {
      lastLogCount += 1;
      let badge = lastLogNode.querySelector<HTMLElement>('.log__count');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'log__count';
        lastLogNode.querySelector('.log__msg')?.appendChild(badge);
      }
      badge.textContent = '×' + lastLogCount;
      return;
    }

    const now = new Date();
    const stamp =
    String(now.getMinutes()).padStart(2, '0') +
    ':' +
    String(now.getSeconds()).padStart(2, '0') +
    '.' +
    String(now.getMilliseconds()).padStart(3, '0');

    const li = document.createElement('li');
    li.className = 'log__line';
    li.dataset.sev = sev;
    const t = document.createElement('span');
    t.className = 'log__time';
    t.textContent = stamp;
    const g = document.createElement('span');
    g.className = 'log__tag';
    g.textContent = tag;
    const m = document.createElement('span');
    m.className = 'log__msg';
    m.textContent = msg;
    li.append(t, g, m);
    logEl.appendChild(li);

    lastLogKey = key;
    lastLogNode = li;
    lastLogCount = 1;

    while (logEl.children.length > 120) logEl.removeChild(logEl.firstChild as Node);
    if (!autoscrollChk || autoscrollChk.checked) logEl.scrollTop = logEl.scrollHeight;
  }
  renderLogEmpty();

  /* ---------------------------------------------------------- transport link */
  const connChip = q('conn-chip');
  const connVal = q('sys-status-val');
  const banner = q('link-banner');
  const bannerTxt = q('link-banner-text');
  let connState = '';

  function setConn(state: 'connecting' | 'online' | 'offline' | 'reconnecting', note?: string) {
    if (connChip) connChip.dataset.state = state;
    if (connVal) connVal.textContent = state.toUpperCase();
    const degraded = state === 'offline' || state === 'reconnecting';
    if (banner) {
      banner.hidden = !degraded;
      banner.dataset.tone = state === 'offline' ? 'error' : 'warn';
    }
    if (bannerTxt && note) bannerTxt.textContent = note;
    if (state !== connState) {
      connState = state;
      if (state === 'online') log('TRANSPORT', 'Telemetry transport connected.', 'lock');else
      if (state === 'offline') log('TRANSPORT', note || 'Telemetry transport offline.', 'loss');else
      if (state === 'reconnecting') log('TRANSPORT', 'Reconnecting to telemetry transport…', 'warn');
    }
    setRunState(isPlaying ? 'live' : hasTelemetry ? 'paused' : 'idle');
  }

  const runChip = q('run-state-chip');
  const runVal = q('run-state-val');
  function setRunState(state: 'live' | 'paused' | 'idle') {
    const offline = connState === 'offline' || connState === 'reconnecting';
    const effective = offline ? 'idle' : state;
    if (runChip) runChip.dataset.state = effective;
    if (runVal) {
      runVal.textContent = offline ?
      'NO STREAM' :
      effective === 'live' ?
      'LIVE' :
      effective === 'paused' ?
      'PAUSED' :
      'IDLE';
    }
  }

  function connect() {
    if (disposed) return;
    const proto = window.location.protocol;
    if (proto !== 'http:' && proto !== 'https:') {
      setConn(
        'offline',
        'No telemetry transport in this context. Serve the console from the simulator backend to stream live data.'
      );
      return;
    }
    const scheme = proto === 'https:' ? 'wss:' : 'ws:';
    setConn(wsRetry === 0 ? 'connecting' : 'reconnecting');
    let sock: WebSocket;
    try {
      sock = new WebSocket(scheme + '//' + window.location.host + '/ws/simulation');
    } catch {
      scheduleRetry();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      wsRetry = 0;
      setConn('online');
    };
    sock.onmessage = (ev) => {
      try {
        handleServerMessage(JSON.parse(ev.data));
      } catch {
        log('TRANSPORT', 'Malformed telemetry frame discarded.', 'warn');
      }
    };
    sock.onerror = () => {

      /* close handler owns recovery; swallow to keep the console clean */};
    sock.onclose = () => {
      if (disposed) return;
      ws = null;
      scheduleRetry();
    };
  }
  function scheduleRetry() {
    if (disposed) return;
    wsRetry += 1;
    const delay = Math.min(15000, 1000 * Math.pow(1.6, Math.min(wsRetry, 6)));
    setConn(
      wsRetry > 4 ? 'offline' : 'reconnecting',
      wsRetry > 4 ?
      'Telemetry transport offline. Values shown are the last received, or unavailable.' :
      'Telemetry transport interrupted. Reattempting…'
    );
    if (retryTimer) window.clearTimeout(retryTimer);
    retryTimer = window.setTimeout(connect, delay);
  }
  function send(cmd: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(cmd));
      return true;
    }
    toast('Command not sent — telemetry transport offline.', 'error');
    return false;
  }

  /* ------------------------------------------------------- server messages */
  const scenarioSelect = q<HTMLSelectElement>('scenario-select');
  const scenarioName = q('active-scenario-name');
  const colormapSelect = q<HTMLSelectElement>('colormap-select');

  function handleServerMessage(msg: Telemetry) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'init') {
      activeScenario = {
        scenario_name: msg.scenario_name,
        category: msg.category || 'General',
        frame_source: msg.frame_source || 'synthetic'
      };
      populateScenarios(msg.scenarios);
      totalFrames = msg.num_frames || 0;
      currentFrame = msg.frame_id || 0;
      setPlayback(!!msg.is_running);
      if (msg.colormap && colormapSelect) colormapSelect.value = msg.colormap;
      if (scenarioName) scenarioName.textContent = String(msg.scenario_name || 'UNNAMED');
      log('INIT', 'Scenario "' + msg.scenario_name + '" · ' + totalFrames + ' frames', 'info');
      resetView();
    } else if (msg.type === 'telemetry') {
      onTelemetry(msg.data);
    } else if (msg.type === 'scenario_loaded') {
      const sc = msg.scenario || {};
      activeScenario = sc;
      totalFrames = sc.num_frames || 0;
      currentFrame = 0;
      clearSeries();
      setPlayback(false);
      if (scenarioName) scenarioName.textContent = String(sc.scenario_name || 'UNNAMED');
      log('SCENARIO', 'Loaded "' + sc.scenario_name + '" · ' + totalFrames + ' frames', 'info');
      resetView();
    } else if (msg.type === 'scenario_complete') {
      setPlayback(false);
      log('SCENARIO', 'Run complete at frame ' + msg.frame_id + '.', 'lock');
      chirpLock();
    } else if (msg.type === 'reset') {
      currentFrame = 0;
      clearSeries();
      setPlayback(false);
      resetView();
      log('COMMAND', 'Simulation reset to frame 0.', 'info');
    }
  }

  function clearSeries() {
    targetTrail.length = 0;
    history.errors.length = 0;
    history.conf.length = 0;
    history.sev.length = 0;
  }

  function populateScenarios(list: Telemetry[]) {
    if (!scenarioSelect || !Array.isArray(list) || !list.length) return;
    scenarioSelect.textContent = '';
    const synth = document.createElement('optgroup');
    synth.label = 'Synthetic PAT scenarios';
    const video = document.createElement('optgroup');
    video.label = 'Recorded optical video';
    list.forEach((s, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = String(s.name) + ' (' + s.num_frames + 'f)';
      const isVideo =
      s.category === 'video_evaluation' || typeof s.name === 'string' && s.name.startsWith('[VIDEO]');
      (isVideo ? video : synth).appendChild(opt);
    });
    if (synth.children.length) scenarioSelect.appendChild(synth);
    if (video.children.length) scenarioSelect.appendChild(video);
  }

  /* ---------------------------------------------------------- element cache */
  const el = {
    streamFps: q('stream-fps'),
    algoLatency: q('algo-latency'),
    frameCounter: q('frame-counter'),
    simTime: q('sim-time'),
    fsm: q('fsm-badge'),
    fsmNote: q('fsm-note'),
    mode: q('tracker-mode-val'),
    modeSub: q('tracker-mode-sub'),
    lockVal: q('lock-retention-val'),
    lockSub: q('lock-state-sub'),
    errMrad: q('err-mrad-val'),
    errMradBar: q('err-mrad-bar'),
    errPx: q('err-px-val'),
    errPxBar: q('err-px-bar'),
    conf: q('confidence-val'),
    confBar: q('conf-bar'),
    sev: q('severity-val'),
    sevBar: q('sev-bar'),
    fried: q('fried-r0-val'),
    acq: q('acq-time-val'),
    reacq: q('reacq-tier-val'),
    gimbalPt: q('gimbal-pt-val'),
    radarCoords: q('radar-coords'),
    cameraImg: q<HTMLImageElement>('camera-frame-img'),
    cameraStage: q('camera-stage'),
    cameraTitle: q('camera-title-text'),
    cameraEmptyTitle: q('camera-empty-title'),
    cameraEmptyDesc: q('camera-empty-desc'),
    camIndicator: q('cam-indicator'),
    camSnr: q('camera-snr'),
    camPeak: q('cam-peak-counts'),
    camSpot: q('cam-spot-pos'),
    camGain: q('cam-gain-stat'),
    agcLiveGain: q('agc-live-gain'),
    ch1: q('scope-ch1-val'),
    ch2: q('scope-ch2-val'),
    ch3: q('scope-ch3-val'),
    progress: q('sim-progress'),
    progressBar: q('sim-progress-bar'),
    targetSelect: q<HTMLSelectElement>('target-switch-select')
  };

  const dash = (v: number | null | undefined, digits: number, unit = '') =>
  v === null || v === undefined || Number.isNaN(v) ? '--' : v.toFixed(digits) + unit;

  function setValueWithUnit(node: HTMLElement | null, value: string, unit?: string) {
    if (!node) return;
    node.textContent = value;
    if (unit) {
      const u = document.createElement('span');
      u.className = 'metric__unit';
      u.textContent = unit;
      node.appendChild(u);
    }
  }

  /* ------------------------------------------------------- camera states */
  function setCameraState(state: string, title?: string, desc?: string) {
    if (el.cameraStage) el.cameraStage.dataset.state = state;
    if (title && el.cameraEmptyTitle) el.cameraEmptyTitle.textContent = title;
    if (desc && el.cameraEmptyDesc) el.cameraEmptyDesc.textContent = desc;
  }
  if (el.cameraImg) {
    on(el.cameraImg, 'error', () => {
      if (el.cameraImg) el.cameraImg.removeAttribute('src');
      setCameraState(
        'error',
        'OPTICAL FRAME DECODE ERROR',
        'The frame received from the telemetry stream could not be decoded.'
      );
    });
    on(el.cameraImg, 'load', () => setCameraState('live'));
  }

  function isVideoScenario(t?: Telemetry | null) {
    const sc = activeScenario;
    if (sc && (sc.frame_source === 'video_file' || sc.category === 'video_evaluation')) return true;
    return !!(t && t.all_targets && t.all_targets[0] && t.all_targets[0].motion_type === 'VIDEO_OPTICAL_SPOT');
  }

  function resetView() {
    if (el.frameCounter) el.frameCounter.textContent = '0 / ' + (totalFrames || '--');
    setUnitReadout(el.simTime, '0.000', 's');
    if (el.progressBar) el.progressBar.style.width = '0%';
    if (el.progress) el.progress.setAttribute('aria-valuenow', '0');
    if (el.ch1) el.ch1.textContent = '--';
    if (el.ch2) el.ch2.textContent = '--';
    if (el.ch3) el.ch3.textContent = '--';

    const video = isVideoScenario();
    if (el.cameraTitle) el.cameraTitle.textContent = video ? 'Optical Feed — Video Benchmark' : 'CMOS Optical Sensor';
    if (el.camIndicator) el.camIndicator.className = 'dot ' + (video ? 'dot--cyan' : 'dot--amber');
    if (el.cameraImg) el.cameraImg.removeAttribute('src');
    setCameraState(
      'waiting',
      'WAITING FOR OPTICAL SENSOR FRAME',
      'No image frame received from the telemetry stream.'
    );
    drawRadar(null);
    drawScope();
  }

  function setUnitReadout(node: HTMLElement | null, value: string, unit: string) {
    if (!node) return;
    node.textContent = value;
    const u = document.createElement('span');
    u.className = 'readout__unit';
    u.textContent = unit;
    node.appendChild(u);
  }

  /* ------------------------------------------------------------ telemetry */
  function onTelemetry(t: Telemetry) {
    if (!t) return;
    latest = t;
    hasTelemetry = true;
    currentFrame = t.frame_id;

    framesThisSecond += 1;
    const now = performance.now();
    if (now - fpsTimer >= 1000) {
      setUnitReadout(el.streamFps, (framesThisSecond * 1000 / (now - fpsTimer)).toFixed(1), 'fps');
      framesThisSecond = 0;
      fpsTimer = now;
    }
    if (t.profiling && typeof t.profiling.total_frame_ms === 'number') {
      setUnitReadout(el.algoLatency, t.profiling.total_frame_ms.toFixed(1), 'ms');
    }

    if (el.frameCounter) el.frameCounter.textContent = t.frame_id + ' / ' + (totalFrames || '--');
    if (typeof t.sim_time === 'number') setUnitReadout(el.simTime, t.sim_time.toFixed(3), 's');
    const pct = totalFrames ? Math.min(100, t.frame_id / Math.max(1, totalFrames) * 100) : 0;
    if (el.progressBar) el.progressBar.style.width = pct + '%';
    if (el.progress) el.progress.setAttribute('aria-valuenow', String(Math.round(pct)));

    if (t.is_locked && prevLocked === false) chirpLock();else
    if (!t.is_locked && prevLocked === true) alarmLoss();
    if (t.tracker_mode !== prevMode && (t.tracker_mode === 'KF' || t.tracker_mode === 'PF')) {
      if (prevMode) chirpSwitch();
    }
    prevLocked = !!t.is_locked;
    prevMode = t.tracker_mode;

    updateSummary(t);
    updateCamera(t);
    updateTurbulence(t);
    updateReport(t);

    const err = typeof t.tracking_error_mrad === 'number' ? t.tracking_error_mrad : 0;
    history.errors.push(err);
    history.conf.push(t.confidence || 0);
    history.sev.push(t.severity || 0);
    if (history.errors.length > MAX_HISTORY) {
      history.errors.shift();
      history.conf.shift();
      history.sev.shift();
    }
    if (el.ch1) el.ch1.textContent = dash(t.tracking_error_mrad, 3);
    if (el.ch2) el.ch2.textContent = Math.round((t.confidence || 0) * 100) + '%';
    if (el.ch3) el.ch3.textContent = Math.round((t.severity || 0) * 100) + '%';

    if (t.target_pos) {
      targetTrail.push({ pan: t.target_pos[0], tilt: t.target_pos[1] });
      if (targetTrail.length > MAX_TRAIL) targetTrail.shift();
    }

    if (el.targetSelect && Array.isArray(t.all_targets) && t.all_targets.length &&
    el.targetSelect.options.length !== t.all_targets.length) {
      el.targetSelect.textContent = '';
      t.all_targets.forEach((tgt: Telemetry) => {
        const opt = document.createElement('option');
        opt.value = String(tgt.target_id);
        opt.textContent = String(tgt.target_id) + (tgt.is_primary ? ' [primary]' : '') +
        ' — ' + String(tgt.motion_type || 'unknown');
        opt.selected = !!tgt.is_primary;
        el.targetSelect!.appendChild(opt);
      });
    }

    drawRadar(t);
    drawScope();

    if (t.event_message) {
      const sev =
      t.event_type === 'MODE_SWITCH' ? 'switch' :
      t.event_type === 'LOSS' ? 'loss' :
      t.event_type === 'REACQ' ? 'reacq' : 'info';
      log(String(t.event_type || 'EVENT'), String(t.event_message), sev);
    }
  }

  function updateSummary(t: Telemetry) {
    const fsm = String(t.supervisor_state || 'UNKNOWN');
    if (el.fsm) {
      el.fsm.textContent = fsm;
      el.fsm.dataset.state = fsm.toLowerCase();
    }
    if (el.fsmNote) {
      el.fsmNote.textContent = t.is_locked ?
      'Boresight within tolerance' :
      fsm === 'SEARCHING' ?
      'Executing reacquisition search' :
      'Outside lock tolerance';
    }

    const mode = String(t.tracker_mode || 'LOST');
    if (el.mode) {
      el.mode.textContent = mode;
      el.mode.dataset.mode = mode.toLowerCase();
    }
    if (el.modeSub) {
      el.modeSub.textContent =
      mode === 'KF' ? 'Kalman filter — clear air' :
      mode === 'PF' ? 'Particle filter — turbulent' :
      mode === 'COAST' ? 'Predictive inertial coast' : 'Target lost / searching';
    }

    setValueWithUnit(el.lockVal, dash(t.lock_retention_rate, 1), '%');
    if (el.lockSub) {
      el.lockSub.textContent = t.is_locked ? 'BORESIGHT LOCKED' : 'OFFSET / RECOVERING';
      el.lockSub.dataset.state = t.is_locked ? 'locked' : 'unlocked';
    }

    const errM = typeof t.tracking_error_mrad === 'number' ? t.tracking_error_mrad : null;
    setValueWithUnit(el.errMrad, dash(errM, 3), 'mrad');
    if (el.errMradBar) {
      el.errMradBar.style.width = Math.min(100, (errM || 0) / 4.0 * 100) + '%';
      el.errMradBar.className = 'meter__fill' + (errM !== null && errM > 2.0 ? ' meter__fill--red' : '');
    }

    const errP = typeof t.tracking_error_px === 'number' ? t.tracking_error_px : null;
    setValueWithUnit(el.errPx, dash(errP, 1), 'px');
    if (el.errPxBar) el.errPxBar.style.width = Math.min(100, (errP || 0) / 50.0 * 100) + '%';

    const conf = typeof t.confidence === 'number' ? t.confidence : null;
    if (el.conf) el.conf.textContent = dash(conf, 2);
    if (el.confBar) {
      el.confBar.style.width = Math.min(100, (conf || 0) * 100) + '%';
      el.confBar.className = 'meter__fill ' + ((conf || 0) >= 0.4 ? 'meter__fill--green' : 'meter__fill--amber');
    }

    const sev = typeof t.severity === 'number' ? t.severity : null;
    if (el.sev) el.sev.textContent = dash(sev, 2);
    if (el.sevBar) {
      el.sevBar.style.width = Math.min(100, (sev || 0) * 100) + '%';
      el.sevBar.className = 'meter__fill ' + ((sev || 0) > 0.55 ? 'meter__fill--red' : 'meter__fill--amber');
    }

    if (el.reacq) el.reacq.textContent = String(t.reacquisition_tier || 'INACTIVE');
    if (el.acq) {
      const a = t.metrics && typeof t.metrics.acquisition_time_s === 'number' ? t.metrics.acquisition_time_s : null;
      setValueWithUnit(el.acq, dash(a, 3), 's');
    }

    if (Array.isArray(t.camera_pan_tilt)) {
      const p = (t.camera_pan_tilt[0] * 1e3).toFixed(2);
      const q2 = (t.camera_pan_tilt[1] * 1e3).toFixed(2);
      if (el.gimbalPt) el.gimbalPt.textContent = p + ' / ' + q2;
      if (el.radarCoords) el.radarCoords.textContent = 'PAN ' + p + ' · TILT ' + q2 + ' mrad';
    }
  }

  function updateCamera(t: Telemetry) {
    const gain = t.hardware && typeof t.hardware.camera_gain === 'number' ? t.hardware.camera_gain.toFixed(2) : null;
    if (el.camSnr) {
      el.camSnr.textContent =
      'CONF ' + dash(t.confidence, 3) + ' · GAIN ' + (gain ? gain + '×' : '--');
    }
    if (el.camGain) el.camGain.textContent = gain ? gain + '×' : '--';
    if (el.agcLiveGain) el.agcLiveGain.textContent = gain ? gain + '×' : '--';

    const detected = t.detected_spot && t.detected_spot.x !== null && t.detected_spot.x !== undefined;
    if (el.camSpot) {
      el.camSpot.textContent = detected ?
      '(' + t.detected_spot.x.toFixed(1) + ', ' + t.detected_spot.y.toFixed(1) + ') px' :
      'NO DETECTION';
    }
    if (el.camPeak) {
      el.camPeak.textContent = detected && typeof t.detected_spot.peak === 'number' ?
      t.detected_spot.peak.toFixed(0) + ' cts' :
      '--';
    }

    const video = isVideoScenario(t);
    if (el.cameraTitle) el.cameraTitle.textContent = video ? 'Optical Feed — Video Benchmark' : 'CMOS Optical Sensor';
    if (el.camIndicator) el.camIndicator.className = 'dot ' + (video ? 'dot--cyan' : 'dot--amber');

    if (typeof t.camera_frame === 'string' && t.camera_frame.length > 0) {
      if (el.cameraImg && el.cameraImg.getAttribute('src') !== t.camera_frame) {
        el.cameraImg.src = t.camera_frame;
      }
      if (el.cameraStage && el.cameraStage.dataset.state !== 'live') setCameraState('live');
    } else if (t.tracker_mode === 'LOST') {
      if (el.cameraImg) el.cameraImg.removeAttribute('src');
      setCameraState('lost', 'TRACK LOST', 'No optical frame while the search law is running.');
    } else if (!detected) {
      if (el.cameraImg) el.cameraImg.removeAttribute('src');
      setCameraState('nodetect', 'NO DETECTION IN FRAME', 'Detector returned no valid beacon centroid.');
    } else {
      setCameraState('waiting', 'WAITING FOR OPTICAL SENSOR FRAME', 'No image frame received from the telemetry stream.');
    }
  }

  /* ----------------------------------------------------------- turbulence */
  const tb = {
    miniR0: q('turb-mini-r0'),
    miniRytov: q('turb-mini-rytov'),
    miniFade: q('turb-mini-fade'),
    miniStrehl: q('turb-mini-strehl'),
    miniRegime: q('turb-mini-regime'),
    cn2: q('turb-cn2-val'),
    r0: q('turb-r0-val'),
    rytov: q('turb-rytov-val'),
    scint: q('turb-scint-val'),
    fade: q('turb-fade-val'),
    blur: q('turb-blur-val'),
    strehl: q('turb-strehl-val'),
    wander: q('turb-wander-val'),
    sev: q('turb-sev-val'),
    time: q('turb-time-val'),
    badge: q('turb-regime-badge')
  };
  const regimeKey = (r: string) =>
  r.includes('SEVERE') ? 'severe' : r.includes('MODERATE') ? 'moderate' : 'clear';

  function updateTurbulence(t: Telemetry) {
    const d = t.turbulence;
    if (!d) return;
    const regime = String(d.regime || 'UNKNOWN');
    const key = regimeKey(regime);

    if (tb.miniR0) tb.miniR0.textContent = dash(d.fried_r0_mm, 1) + 'mm';
    if (tb.miniRytov) tb.miniRytov.textContent = dash(d.rytov_variance, 3);
    if (tb.miniFade) tb.miniFade.textContent = d.fade_loss_pct != null ? '-' + d.fade_loss_pct.toFixed(0) + '%' : '--';
    if (tb.miniStrehl) tb.miniStrehl.textContent = dash(d.strehl_ratio, 2);
    if (tb.miniRegime) {
      tb.miniRegime.textContent = regime;
      tb.miniRegime.dataset.regime = key;
    }
    if (el.fried) setValueWithUnit(el.fried, dash(d.fried_r0_mm, 1), 'mm');

    if (tb.cn2) tb.cn2.textContent = typeof d.cn2 === 'number' ? d.cn2.toExponential(2) : '--';
    if (tb.r0) tb.r0.textContent = dash(d.fried_r0_mm, 2, ' mm');
    if (tb.rytov) tb.rytov.textContent = dash(d.rytov_variance, 4);
    if (tb.scint) tb.scint.textContent = dash(d.scintillation_index, 4);
    if (tb.fade) {
      tb.fade.textContent = d.fade_loss_pct != null ?
      '-' + d.fade_loss_pct.toFixed(1) + '% (' + ((d.attenuation_factor ?? 1) * 100).toFixed(1) + '% transm.)' :
      '--';
    }
    if (tb.blur) tb.blur.textContent = dash(d.blur_sigma_px, 2, ' px');
    if (tb.strehl) tb.strehl.textContent = dash(d.strehl_ratio, 3);
    if (tb.wander) tb.wander.textContent = dash(d.beam_wander_mrad, 3, ' mrad');
    if (tb.sev) {
      tb.sev.textContent = d.turbulence_severity != null ?
      d.turbulence_severity.toFixed(3) + ' (' + Math.round(d.turbulence_severity * 100) + '%)' :
      '--';
    }
    if (tb.time) tb.time.textContent = dash(d.calc_time_ms, 3, ' ms');
    if (tb.badge) {
      tb.badge.textContent = regime;
      tb.badge.dataset.tone = key === 'severe' ? 'crit' : key === 'moderate' ? 'warn' : 'ok';
    }
  }

  /* --------------------------------------------------------------- report */
  const rp = {
    acq: q('kpi-acq-time'),
    mean: q('kpi-mean-err'),
    max: q('kpi-max-err'),
    rmse: q('kpi-rmse-err'),
    lock: q('kpi-lock-rate'),
    fps: q('kpi-algo-fps'),
    render: q('prof-render'),
    turb: q('prof-turb'),
    turbChip: q('prof-turb-chip'),
    noise: q('prof-noise'),
    vib: q('prof-vib'),
    occ: q('prof-occ'),
    detect: q('prof-detect'),
    track: q('prof-track'),
    control: q('prof-control'),
    diagnosis: q('diagnosis-content')
  };
  const setKpi = (node: HTMLElement | null, text: string, tone2: string) => {
    if (!node) return;
    node.textContent = text;
    node.dataset.tone = tone2;
  };

  function updateReport(t: Telemetry) {
    const m = t.metrics;
    if (m) {
      if (typeof m.acquisition_time_s === 'number') {
        setKpi(rp.acq, m.acquisition_time_s.toFixed(3) + ' s', m.acquisition_time_s < 1.0 ? 'ok' : 'warn');
      }
      if (typeof m.avg_error_mrad === 'number') {
        setKpi(rp.mean, m.avg_error_mrad.toFixed(3) + ' mrad', m.avg_error_mrad <= 2.0 ? 'ok' : 'warn');
      }
      if (typeof m.max_error_mrad === 'number') {
        setKpi(rp.max, m.max_error_mrad.toFixed(3) + ' mrad', m.max_error_mrad <= 2.0 ? 'ok' : 'warn');
      }
      if (typeof m.rmse_error_mrad === 'number') {
        setKpi(rp.rmse, m.rmse_error_mrad.toFixed(3) + ' mrad', m.rmse_error_mrad <= 2.0 ? 'ok' : 'crit');
      }
      if (typeof m.lock_retention_pct === 'number') {
        setKpi(rp.lock, m.lock_retention_pct.toFixed(1) + ' %', m.lock_retention_pct >= 90 ? 'ok' : 'warn');
      }
    }

    const p = t.profiling;
    if (p) {
      if (p.instantaneous_fps != null) {
        const fps = Number(p.instantaneous_fps);
        setKpi(rp.fps, fps.toFixed(1) + ' FPS', fps >= 30 ? 'ok' : 'warn');
      }
      const ms = (v: unknown, d = 2) => typeof v === 'number' ? v.toFixed(d) + ' ms' : '--';
      if (rp.render) rp.render.textContent = ms(p.rendering_ms ?? p.render_disturb_ms);
      if (rp.turb) rp.turb.textContent = ms(p.disturb_turbulence_ms, 3);
      if (rp.noise) rp.noise.textContent = ms(p.disturb_noise_ms, 3);
      if (rp.vib) rp.vib.textContent = ms(p.disturb_vibration_ms, 3);
      if (rp.occ) rp.occ.textContent = ms(p.disturb_occlusion_ms, 3);
      if (rp.detect) rp.detect.textContent = ms(p.detect_ms);
      if (rp.track) rp.track.textContent = ms(p.track_ms);
      if (rp.control) rp.control.textContent = ms(p.control_ms);
      if (rp.turbChip) {
        const active = !!(t.turbulence && t.turbulence.cn2 > 0);
        rp.turbChip.textContent = active ? 'ACTIVE' : 'IDLE';
        rp.turbChip.dataset.tone = active ? 'ok' : 'neutral';
      }
      qa('.table .chip[data-tone="neutral"]').forEach((chip) => {
        if (chip.id === 'prof-turb-chip') return;
        chip.textContent = 'NOMINAL';
        chip.dataset.tone = 'ok';
      });
    }

    if (rp.diagnosis) {
      const rc = t.root_cause_diagnosis;
      rp.diagnosis.textContent = '';
      const head = document.createElement('p');
      head.className = 'diagnosis__headline';
      if (rc) {
        rp.diagnosis.dataset.tone = 'warn';
        head.textContent =
        'TRACK LOSS — ' + String(rc.cause) +
        ' (confidence ' + Math.round((rc.confidence || 0) * 100) + '%)';
        rp.diagnosis.appendChild(head);
        const body = document.createElement('p');
        body.className = 'diagnosis__body';
        body.textContent = String(rc.rationale || '');
        rp.diagnosis.appendChild(body);
      } else {
        rp.diagnosis.dataset.tone = t.is_locked ? 'ok' : 'neutral';
        head.textContent = t.is_locked ?
        'NOMINAL CLOSED-LOOP TRACKING — NO TRACK LOSS DETECTED' :
        'NO TRACK-LOSS EVENT DIAGNOSED';
        rp.diagnosis.appendChild(head);
      }
    }
  }

  /* -------------------------------------------------------------- canvases */
  const radarCanvas = q<HTMLCanvasElement>('radar-canvas');
  const scopeCanvas = q<HTMLCanvasElement>('telemetry-chart-canvas');
  const radarCtx = radarCanvas ? radarCanvas.getContext('2d') : null;
  const scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;
  const dims = { rw: 0, rh: 0, sw: 0, sh: 0 };

  function sizeCanvas(canvas: HTMLCanvasElement | null, ctx: CanvasRenderingContext2D | null) {
    if (!canvas || !ctx) return { w: 0, h: 0 };
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { w, h };
  }

  function resizeAll() {
    const r = sizeCanvas(radarCanvas, radarCtx);
    dims.rw = r.w;
    dims.rh = r.h;
    const s = sizeCanvas(scopeCanvas, scopeCtx);
    dims.sw = s.w;
    dims.sh = s.h;
    drawRadar(latest);
    drawScope();
  }

  const world = (pan: number, tilt: number, w: number, h: number): [number, number] => [
  w / 2 + (pan - viewport.centerPan) * (w / viewport.spanPan),
  h / 2 - (tilt - viewport.centerTilt) * (h / viewport.spanTilt)];


  function drawGrid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const cx = w / 2;
    const cy = h / 2;
    const sx = w / viewport.spanPan;
    ctx.fillStyle = C.plate1;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = C.fid;
    ctx.lineWidth = 1;
    [[16, 16], [w - 16, 16], [16, h - 16], [w - 16, h - 16]].forEach(([fx, fy]) => {
      ctx.beginPath();
      ctx.moveTo(fx - 7, fy);ctx.lineTo(fx + 7, fy);
      ctx.moveTo(fx, fy - 7);ctx.lineTo(fx, fy + 7);
      ctx.stroke();
    });

    const step = 0.01;
    const minPan = viewport.centerPan - viewport.spanPan / 2;
    const maxPan = viewport.centerPan + viewport.spanPan / 2;
    const minTilt = viewport.centerTilt - viewport.spanTilt / 2;
    const maxTilt = viewport.centerTilt + viewport.spanTilt / 2;
    const p0 = Math.floor(minPan / step) * step;
    const t0 = Math.floor(minTilt / step) * step;

    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    for (let p = p0; p <= maxPan; p += step) {
      const [x] = world(p, 0, w, h);
      ctx.moveTo(x, 0);ctx.lineTo(x, h);
    }
    for (let tt = t0; tt <= maxTilt; tt += step) {
      const [, y] = world(0, tt, w, h);
      ctx.moveTo(0, y);ctx.lineTo(w, y);
    }
    ctx.stroke();

    ctx.font = MONO;
    ctx.fillStyle = C.dim;
    for (let p = p0; p <= maxPan; p += step) {
      const [x] = world(p, 0, w, h);
      const v = Math.round(p * 1e3);
      if (x > 42 && x < w - 42) ctx.fillText((v > 0 ? '+' : '') + v, x - 10, h - 6);
    }
    for (let tt = t0; tt <= maxTilt; tt += step) {
      const [, y] = world(0, tt, w, h);
      const v = Math.round(tt * 1e3);
      if (y > 26 && y < h - 26) ctx.fillText((v > 0 ? '+' : '') + v, 6, y + 3);
    }

    [0.01, 0.02, 0.03].forEach((ring) => {
      const rpx = ring * sx;
      ctx.strokeStyle = C.ring;
      ctx.beginPath();
      ctx.arc(cx, cy, rpx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = C.ringTxt;
      ctx.fillText(Math.round(ring * 1e3) + ' mrad', cx + rpx * 0.707 + 4, cy - rpx * 0.707 - 3);
    });

    ctx.strokeStyle = C.axis;
    ctx.beginPath();
    ctx.moveTo(cx, 0);ctx.lineTo(cx, h);
    ctx.moveTo(0, cy);ctx.lineTo(w, cy);
    ctx.stroke();
  }

  function drawRadar(t: Telemetry | null) {
    if (!radarCtx) return;
    const w = dims.rw;
    const h = dims.rh;
    if (!w || !h) return;
    const ctx = radarCtx;
    const sx = w / viewport.spanPan;

    ctx.clearRect(0, 0, w, h);
    drawGrid(ctx, w, h);

    if (!t) {
      ctx.fillStyle = C.dim;
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.fillText('NO TELEMETRY — AWAITING ANGULAR TRACK DATA', 16, 22);
      return;
    }

    if (Array.isArray(t.fov_bounds) && t.fov_bounds.length === 4) {
      const [pMin, pMax, tMin, tMax] = t.fov_bounds;
      const [x1, y1] = world(pMin, tMax, w, h);
      const [x2, y2] = world(pMax, tMin, w, h);
      ctx.strokeStyle = 'rgba(72,200,247,.32)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const b = 10;
      ctx.strokeStyle = 'rgba(72,200,247,.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + b);ctx.lineTo(x1, y1);ctx.lineTo(x1 + b, y1);
      ctx.moveTo(x2 - b, y1);ctx.lineTo(x2, y1);ctx.lineTo(x2, y1 + b);
      ctx.moveTo(x1, y2 - b);ctx.lineTo(x1, y2);ctx.lineTo(x1 + b, y2);
      ctx.moveTo(x2 - b, y2);ctx.lineTo(x2, y2);ctx.lineTo(x2, y2 - b);
      ctx.stroke();
      ctx.fillStyle = 'rgba(72,200,247,.72)';
      ctx.font = MONO;
      ctx.fillText('DETECTOR ACTIVE APERTURE', x1 + 6, y1 + 14);
    }

    if (t.active_occluder) {
      const [ox, oy] = world(t.active_occluder.x, t.active_occluder.y, w, h);
      const orad = t.active_occluder.radius_rad * sx;
      ctx.fillStyle = 'rgba(245,181,74,.10)';
      ctx.beginPath();
      ctx.arc(ox, oy, orad, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(245,181,74,.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(ox, oy, orad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.amber;
      ctx.font = MONO;
      ctx.fillText('LOS OCCLUDER ' + (t.active_occluder.radius_rad * 1e3).toFixed(1) + ' mrad', ox - 46, oy - orad - 5);
    }

    if (t.reacq_zone && t.supervisor_state === 'SEARCHING') {
      const [zx, zy] = world(t.reacq_zone.center[0], t.reacq_zone.center[1], w, h);
      ctx.save();
      ctx.translate(zx, zy);
      ctx.rotate(-(t.reacq_zone.orientation_rad || 0));
      ctx.strokeStyle = 'rgba(245,181,74,.85)';
      ctx.fillStyle = 'rgba(245,181,74,.07)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.ellipse(0, 0, t.reacq_zone.semi_major * sx, t.reacq_zone.semi_minor * sx, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.fillStyle = C.amber;
      ctx.font = MONO;
      ctx.fillText('TIER-1 SEARCH ZONE', zx - 56, zy - t.reacq_zone.semi_minor * sx - 6);
    }

    if (t.tracker_mode === 'PF' && Array.isArray(t.particle_cloud)) {
      ctx.fillStyle = 'rgba(177,140,255,.55)';
      t.particle_cloud.forEach((pt: number[]) => {
        const [px, py] = world(pt[0], pt[1], w, h);
        ctx.beginPath();
        ctx.arc(px, py, 1.6, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    if (t.kalman_cov && (t.tracker_mode === 'KF' || t.tracker_mode === 'COAST') && Array.isArray(t.camera_pan_tilt)) {
      const [kx, ky] = world(t.camera_pan_tilt[0], t.camera_pan_tilt[1], w, h);
      ctx.strokeStyle = 'rgba(72,200,247,.45)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.ellipse(kx, ky,
      Math.max(6, t.kalman_cov.sigma_x * 2 * sx),
      Math.max(6, t.kalman_cov.sigma_y * 2 * sx), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    for (let i = 1; i < targetTrail.length; i++) {
      const [x1, y1] = world(targetTrail[i - 1].pan, targetTrail[i - 1].tilt, w, h);
      const [x2, y2] = world(targetTrail[i].pan, targetTrail[i].tilt, w, h);
      ctx.strokeStyle = 'rgba(50,213,131,' + (i / targetTrail.length * 0.6).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x1, y1);ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    if (Array.isArray(t.all_targets)) {
      t.all_targets.forEach((tgt: Telemetry) => {
        const [tx, ty] = world(tgt.pos[0], tgt.pos[1], w, h);
        ctx.font = MONO;
        if (tgt.is_primary) {
          const col = t.is_locked ? C.green : t.is_valid_det ? C.cyan : C.amber;
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(tx, ty, 8, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(tx - 12, ty);ctx.lineTo(tx - 8, ty);
          ctx.moveTo(tx + 8, ty);ctx.lineTo(tx + 12, ty);
          ctx.moveTo(tx, ty - 12);ctx.lineTo(tx, ty - 8);
          ctx.moveTo(tx, ty + 8);ctx.lineTo(tx, ty + 12);
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(tx, ty, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.fillText(String(tgt.target_id) + ' [PRI]', tx + 14, ty - 2);
          ctx.fillStyle = col;
          ctx.fillText(t.is_locked ? 'LOCKED' : t.is_valid_det ? 'TRACK' : 'COAST', tx + 14, ty + 10);
        } else {
          ctx.strokeStyle = 'rgba(72,200,247,.45)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.arc(tx, ty, 5.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(72,200,247,.6)';
          ctx.beginPath();
          ctx.arc(tx, ty, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.muted;
          ctx.fillText(String(tgt.target_id), tx + 9, ty + 3);
        }
        if (Array.isArray(tgt.vel)) {
          ctx.strokeStyle = tgt.is_primary ? 'rgba(50,213,131,.7)' : 'rgba(72,200,247,.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx + tgt.vel[0] * 1.5 * sx, ty - tgt.vel[1] * 1.5 * sx);
          ctx.stroke();
        }
      });
    }

    if (Array.isArray(t.camera_pan_tilt)) {
      const [bx, by] = world(t.camera_pan_tilt[0], t.camera_pan_tilt[1], w, h);
      ctx.strokeStyle = t.is_locked ? 'rgba(50,213,131,.38)' : 'rgba(245,181,74,.38)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.arc(bx, by, 0.002 * sx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = t.is_locked ? C.cyan : C.amber;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(bx - 14, by);ctx.lineTo(bx - 5, by);
      ctx.moveTo(bx + 5, by);ctx.lineTo(bx + 14, by);
      ctx.moveTo(bx, by - 14);ctx.lineTo(bx, by - 5);
      ctx.moveTo(bx, by + 5);ctx.lineTo(bx, by + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(bx, by, 9, 0, Math.PI * 2);
      ctx.stroke();

      if (Array.isArray(t.target_pos)) {
        const [tx, ty] = world(t.target_pos[0], t.target_pos[1], w, h);
        if (Math.hypot(tx - bx, ty - by) > 3) {
          ctx.strokeStyle = t.is_locked ? 'rgba(72,200,247,.4)' : 'rgba(245,181,74,.4)';
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          ctx.beginPath();
          ctx.moveTo(bx, by);ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    }

    ctx.font = MONO;
    ctx.fillStyle = C.muted;
    const az = (t.camera_pan_tilt && t.camera_pan_tilt[0] || 0) * 1e3;
    const elv = (t.camera_pan_tilt && t.camera_pan_tilt[1] || 0) * 1e3;
    ctx.fillText(
      'GIMBAL AZ ' + (az > 0 ? '+' : '') + az.toFixed(2) + '  EL ' + (elv > 0 ? '+' : '') + elv.toFixed(2) + ' mrad',
      14, 18
    );
    const label = t.is_locked ? 'LOCKED  ≤ 2.0 mrad' : 'ACQUIRING / SCANNING';
    ctx.fillStyle = t.is_locked ? C.green : C.amber;
    ctx.textAlign = 'right';
    ctx.fillText(label, w - 14, 18);
    ctx.textAlign = 'left';
  }

  function drawScope() {
    if (!scopeCtx) return;
    const w = dims.sw;
    const h = dims.sh;
    if (!w || !h) return;
    const ctx = scopeCtx;
    const pad = 14;
    const usable = h - pad * 2;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = C.plate1;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= 5; i++) {
      const y = h - pad - i / 5 * usable;
      ctx.moveTo(0, y);ctx.lineTo(w, y);
    }
    for (let x = 0; x < w; x += 48) {
      ctx.moveTo(x, 0);ctx.lineTo(x, h);
    }
    ctx.stroke();

    const threshY = h - pad - 2.0 / 6.0 * usable;
    ctx.strokeStyle = 'rgba(255,107,107,.6)';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(0, threshY);ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,107,107,.85)';
    ctx.font = MONO;
    ctx.fillText('2.00 mrad ENGINEERING TOLERANCE REFERENCE', 10, threshY - 5);

    const zeroY = h - pad;
    ctx.strokeStyle = C.axis;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);ctx.lineTo(w, zeroY);
    ctx.stroke();

    if (history.errors.length < 2) {
      ctx.fillStyle = C.dim;
      ctx.fillText('NO TELEMETRY HISTORY', 10, 18);
      return;
    }

    const stepX = w / (MAX_HISTORY - 1);
    const yErr = (v: number) => h - pad - Math.min(1, v / 6) * usable;
    const yUnit = (v: number) => h - pad - Math.min(1, Math.max(0, v)) * usable;

    ctx.fillStyle = 'rgba(72,200,247,.06)';
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    history.errors.forEach((v, i) => ctx.lineTo(i * stepX, yErr(v)));
    ctx.lineTo((history.errors.length - 1) * stepX, zeroY);
    ctx.closePath();
    ctx.fill();

    const trace = (data: number[], color: string, width: number, map: (v: number) => number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      data.forEach((v, i) => i === 0 ? ctx.moveTo(0, map(v)) : ctx.lineTo(i * stepX, map(v)));
      ctx.stroke();
    };
    trace(history.errors, C.cyan, 1.8, yErr);
    trace(history.conf, C.green, 1.2, yUnit);
    trace(history.sev, C.amber, 1.2, yUnit);
  }

  /* ------------------------------------------------------- workspace tabs */
  const tabs = qa<HTMLButtonElement>('.worktab');
  function selectTab(tab: HTMLButtonElement) {
    tabs.forEach((other) => {
      const active = other === tab;
      other.classList.toggle('is-active', active);
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
      const panel = q('panel-' + other.dataset.panel);
      if (panel) panel.hidden = !active;
    });
    window.requestAnimationFrame(resizeAll);
  }
  tabs.forEach((tab, idx) => {
    on(tab, 'click', () => selectTab(tab));
    on(tab, 'keydown', (ev: KeyboardEvent) => {
      let next = -1;
      if (ev.key === 'ArrowRight') next = (idx + 1) % tabs.length;else
      if (ev.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;else
      if (ev.key === 'Home') next = 0;else
      if (ev.key === 'End') next = tabs.length - 1;
      if (next >= 0) {
        ev.preventDefault();
        selectTab(tabs[next]);
        tabs[next].focus();
      }
    });
  });
  if (tabs.length) selectTab(tabs[0]);

  /* --------------------------------------------------------- view switching */
  const viewGrid = q('displays-container');
  const viewBtns = [q<HTMLButtonElement>('tab-both-btn'), q<HTMLButtonElement>('tab-radar-btn'), q<HTMLButtonElement>('tab-camera-btn')];
  viewBtns.forEach((btn) => {
    on(btn, 'click', () => {
      if (!btn) return;
      viewBtns.forEach((other) => {
        if (!other) return;
        const active = other === btn;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      if (viewGrid) viewGrid.dataset.view = btn.dataset.view || 'both';
      window.requestAnimationFrame(resizeAll);
    });
  });

  /* ------------------------------------------------------------- transport */
  const btnPlay = q<HTMLButtonElement>('btn-play');
  const btnPlayLabel = q('btn-play-label');
  function setPlayback(running: boolean) {
    isPlaying = running;
    if (btnPlay) btnPlay.dataset.mode = running ? 'pause' : 'play';
    if (btnPlayLabel) btnPlayLabel.textContent = running ? 'PAUSE' : 'PLAY';
    if (btnPlay) btnPlay.setAttribute('aria-label', running ? 'Pause simulation' : 'Play simulation');
    setRunState(running ? 'live' : hasTelemetry ? 'paused' : 'idle');
  }
  setPlayback(false);

  on(btnPlay, 'click', () => {
    initAudio();
    if (isPlaying) {
      if (send({ action: 'pause' })) setPlayback(false);
    } else if (send({ action: 'play', speed: playbackSpeed })) {
      setPlayback(true);
    }
  });
  on(q('btn-pause'), 'click', () => {
    if (send({ action: 'pause' })) setPlayback(false);
  });
  on(q('btn-step'), 'click', () => {
    initAudio();
    if (send({ action: 'step' })) setPlayback(false);
  });
  on(q('btn-reset'), 'click', () => {
    if (send({ action: 'reset' })) setPlayback(false);
  });

  const speedSlider = q<HTMLInputElement>('slider-speed');
  const speedLabel = q('speed-label');
  on(speedSlider, 'input', (ev: Event) => {
    playbackSpeed = parseFloat((ev.target as HTMLInputElement).value);
    if (speedLabel) speedLabel.textContent = playbackSpeed.toFixed(1) + '×';
    send({ action: 'set_speed', speed: playbackSpeed });
  });

  on(scenarioSelect, 'change', (ev: Event) => {
    const idx = parseInt((ev.target as HTMLSelectElement).value, 10);
    if (!Number.isNaN(idx)) send({ action: 'select_scenario', index: idx });
  });
  on(colormapSelect, 'change', (ev: Event) => {
    const cm = (ev.target as HTMLSelectElement).value;
    if (send({ action: 'set_colormap', colormap: cm })) log('OPTICS', 'Sensor palette set to "' + cm + '".', 'info');
  });
  on(q('radar-reset-btn'), 'click', () => {
    viewport.centerPan = DEFAULT_CENTER.pan;
    viewport.centerTilt = DEFAULT_CENTER.tilt;
    drawRadar(latest);
    log('RADAR', 'Viewport re-centred to nominal boresight.', 'info');
  });

  /* ----------------------------------------------------------- audio toggle */
  const btnSound = q<HTMLButtonElement>('btn-sound-toggle');
  on(btnSound, 'click', () => {
    initAudio();
    soundEnabled = !soundEnabled;
    if (btnSound) {
      btnSound.setAttribute('aria-pressed', String(soundEnabled));
      btnSound.setAttribute('aria-label', 'Audio telemetry cues: ' + (soundEnabled ? 'on' : 'off'));
    }
  });

  /* ------------------------------------------------------ disturbance rail */
  const cn2Slider = q<HTMLInputElement>('slider-cn2');
  const cn2Disp = q('cn2-disp');
  on(cn2Slider, 'input', (ev: Event) => {
    const cn2 = Math.pow(10, parseFloat((ev.target as HTMLInputElement).value));
    if (cn2Disp) cn2Disp.textContent = cn2.toExponential(1);
    const k = 2 * Math.PI / 1550e-9;
    const L = 5000;
    const r0 = Math.min(2000, Math.max(5, Math.pow(0.423 * k * k * cn2 * L, -0.6) * 1000));
    const rytov = 1.23 * cn2 * Math.pow(k, 7 / 6) * Math.pow(L, 11 / 6);
    const atten = Math.min(1, Math.max(0.4, 1 - 0.45 * Math.log10(Math.max(1e-16, cn2) / 1e-16) / 3.5));
    const strehl = 1 / (1 + Math.pow(100 / Math.max(0.1, r0), 5 / 3));
    const regime = cn2 >= 1e-13 ? 'SEVERE' : cn2 >= 1e-15 ? 'MODERATE' : 'CLEAR';
    if (tb.miniR0) tb.miniR0.textContent = r0.toFixed(1) + 'mm';
    if (tb.miniRytov) tb.miniRytov.textContent = rytov.toFixed(3);
    if (tb.miniFade) tb.miniFade.textContent = '-' + ((1 - atten) * 100).toFixed(0) + '%';
    if (tb.miniStrehl) tb.miniStrehl.textContent = strehl.toFixed(2);
    if (tb.miniRegime) {
      tb.miniRegime.textContent = regime;
      tb.miniRegime.dataset.regime = regime.toLowerCase();
    }
    send({ action: 'update_disturbances', cn2: cn2 });
  });

  const vibAmp = q<HTMLInputElement>('slider-vib-amp');
  const vibAmpDisp = q('vib-amp-disp');
  on(vibAmp, 'input', (ev: Event) => {
    const v = parseFloat((ev.target as HTMLInputElement).value);
    if (vibAmpDisp) vibAmpDisp.textContent = v.toFixed(2) + ' mrad';
    send({ action: 'update_disturbances', vibration_amp: v * 1e-3 });
  });
  const vibFreq = q<HTMLInputElement>('slider-vib-freq');
  const vibFreqDisp = q('vib-freq-disp');
  on(vibFreq, 'input', (ev: Event) => {
    const v = parseFloat((ev.target as HTMLInputElement).value);
    if (vibFreqDisp) vibFreqDisp.textContent = v.toFixed(0) + ' Hz';
    send({ action: 'update_disturbances', vibration_freq: v });
  });

  on(q('btn-inject-occ'), 'click', () => {
    initAudio();
    if (send({ action: 'inject_occluder', duration_frames: 20, radius_rad: 0.008 })) {
      log('DISTURBANCE', 'Occluder injected into the line of sight.', 'warn');
      alarmLoss();
    }
  });

  on(q('btn-clear-log'), 'click', () => {
    if (logEl) logEl.textContent = '';
    lastLogKey = '';
    lastLogNode = null;
    renderLogEmpty();
  });

  /* ------------------------------------------------------- slider readouts */
  const bindSlider = (id: string, dispId: string, fmt: (v: number) => string) => {
    const input = q<HTMLInputElement>(id);
    const disp = q(dispId);
    if (!input || !disp) return;
    const apply = () => disp.textContent = fmt(parseFloat(input.value));
    on(input, 'input', apply);
    apply();
  };
  bindSlider('pid-kp', 'pid-kp-disp', (v) => v.toFixed(2));
  bindSlider('pid-ki', 'pid-ki-disp', (v) => v.toFixed(2));
  bindSlider('pid-kd', 'pid-kd-disp', (v) => v.toFixed(2));
  bindSlider('pid-kff', 'pid-kff-disp', (v) => v.toFixed(2));
  bindSlider('hw-max-vel', 'hw-max-vel-disp', (v) => v.toFixed(2) + ' rad/s');
  bindSlider('hw-max-acc', 'hw-max-acc-disp', (v) => v.toFixed(2) + ' rad/s²');
  bindSlider('hw-latency', 'hw-latency-disp', (v) => v + ' frames (~' + Math.round(v * 33) + ' ms)');
  bindSlider('reacq-budget', 'reacq-budget-disp', (v) => v + ' frames');
  bindSlider('reacq-rate', 'reacq-rate-disp', (v) => v.toFixed(2) + ' rad/s');
  bindSlider('noise-std-input', 'noise-std-disp', (v) => v.toFixed(1) + ' counts');
  bindSlider('noise-poisson-input', 'noise-poisson-disp', (v) => v.toFixed(2));
  bindSlider('noise-sp-input', 'noise-sp-disp', (v) => (v * 100).toFixed(2) + '%');

  const num = (id: string, int = false) => {
    const node = q<HTMLInputElement>(id);
    if (!node) return 0;
    return int ? parseInt(node.value, 10) : parseFloat(node.value);
  };
  const checked = (id: string) => {
    const node = q<HTMLInputElement>(id);
    return !!(node && node.checked);
  };

  const btnApplyPid = q<HTMLButtonElement>('btn-apply-pid');
  on(btnApplyPid, 'click', () => {
    if (
    send({
      action: 'update_pid',
      kp: num('pid-kp'),
      ki: num('pid-ki'),
      kd: num('pid-kd'),
      k_ff: num('pid-kff'),
      enable_feedforward: checked('chk-feedforward')
    }))
    {
      flashOk(btnApplyPid, 'Applied');
      toast('Servo gains applied.', 'ok');
      log('CONTROL', 'PID gains updated (Kp ' + num('pid-kp').toFixed(2) + ', Ki ' + num('pid-ki').toFixed(2) +
      ', Kd ' + num('pid-kd').toFixed(2) + ', Kff ' + num('pid-kff').toFixed(2) + ').', 'info');
    }
  });

  const btnApplyHw = q<HTMLButtonElement>('btn-apply-hw');
  on(btnApplyHw, 'click', () => {
    if (
    send({
      action: 'update_control_hardware',
      max_velocity: num('hw-max-vel'),
      max_acceleration: num('hw-max-acc'),
      latency_frames: num('hw-latency', true)
    }))
    {
      flashOk(btnApplyHw, 'Applied');
      toast('Actuator limits applied.', 'ok');
      log('HARDWARE', 'Slew limits updated (max ' + num('hw-max-vel').toFixed(2) + ' rad/s, latency ' +
      num('hw-latency', true) + ' frames).', 'info');
    }
  });

  const btnApplyReacq = q<HTMLButtonElement>('btn-apply-reacq');
  on(btnApplyReacq, 'click', () => {
    if (
    send({
      action: 'update_control_hardware',
      enable_predictive_search: checked('chk-pred-search'),
      tier1_budget: num('reacq-budget', true),
      scan_rate: num('reacq-rate')
    }))
    {
      flashOk(btnApplyReacq, 'Applied');
      toast('Search law applied.', 'ok');
      log('REACQ', 'Search law updated (Tier 1 ' + (checked('chk-pred-search') ? 'on' : 'off') +
      ', budget ' + num('reacq-budget', true) + 'f).', 'info');
    }
  });

  const agcChip = q('agc-chip');
  const chkAutoExp = q<HTMLInputElement>('chk-auto-exposure');
  on(chkAutoExp, 'change', (ev: Event) => {
    const enabled = (ev.target as HTMLInputElement).checked;
    if (agcChip) {
      agcChip.textContent = enabled ? 'ENABLED' : 'DISABLED';
      agcChip.dataset.tone = enabled ? 'ok' : 'neutral';
    }
    if (send({ action: 'set_auto_exposure', enabled })) {
      log('OPTICS', 'Auto-exposure / AGC ' + (enabled ? 'enabled' : 'disabled') + '.', 'info');
    }
  });

  const btnApplyMotion = q<HTMLButtonElement>('btn-apply-motion');
  on(btnApplyMotion, 'click', () => {
    const motionSel = q<HTMLSelectElement>('motion-type-select');
    const tgtSel = q<HTMLSelectElement>('target-switch-select');
    const motion = motionSel ? motionSel.value : 'straight_line';
    const targetId = tgtSel ? tgtSel.value : '';
    if (send({ action: 'set_target_motion', motion_type: motion, target_id: targetId })) {
      flashOk(btnApplyMotion, 'Applied');
      toast('Trajectory applied.', 'ok');
      log('KINEMATICS', 'Target "' + (targetId || 'primary') + '" set to "' + motion + '".', 'info');
    }
  });
  on(q('target-switch-select'), 'change', (ev: Event) => {
    const id = (ev.target as HTMLSelectElement).value;
    if (send({ action: 'set_primary_target', target_id: id })) {
      log('TARGET', 'Designated "' + id + '" as primary beacon.', 'lock');
    }
  });
  on(q('chk-signature-verif'), 'change', (ev: Event) => {
    const enabled = (ev.target as HTMLInputElement).checked;
    if (send({ action: 'set_signature_verification', enabled })) {
      log('DETECTOR', 'Blinking signature verification ' + (enabled ? 'active' : 'bypassed') + '.', 'info');
    }
  });

  const btnApplyNoise = q<HTMLButtonElement>('btn-apply-noise');
  const noiseError = q('noise-error');
  const noiseStdField = q('field-noise-std');
  on(btnApplyNoise, 'click', () => {
    const types: string[] = [];
    if (checked('noise-chk-gaussian')) types.push('gaussian');
    if (checked('noise-chk-poisson')) types.push('poisson');
    if (checked('noise-chk-saltpepper')) types.push('salt_pepper');
    if (!types.length) {
      if (noiseError) noiseError.hidden = false;
      if (noiseStdField) noiseStdField.classList.add('is-invalid');
      toast('Select at least one noise model.', 'error');
      return;
    }
    if (noiseError) noiseError.hidden = true;
    if (noiseStdField) noiseStdField.classList.remove('is-invalid');
    if (
    send({
      action: 'update_disturbances',
      noise_types: types,
      noise_std: num('noise-std-input'),
      poisson_scale: num('noise-poisson-input'),
      salt_pepper_prob: num('noise-sp-input')
    }))
    {
      flashOk(btnApplyNoise, 'Applied');
      toast('Noise models applied.', 'ok');
      log('NOISE', 'Noise suite updated: ' + types.join(', ') + '.', 'info');
    }
  });

  /* -------------------------------------------------------------- exports */
  function exportData(kind: 'csv' | 'json') {
    const url = '/api/simulation/export/' + kind;
    try {
      const win = window.open(url, '_blank', 'noopener');
      if (!win) throw new Error('blocked');
      toast(kind.toUpperCase() + ' export requested.', 'ok');
      log('EXPORT', 'Requested ' + kind.toUpperCase() + ' telemetry export.', 'info');
    } catch {
      toast('Export blocked by the browser. Allow pop-ups for this origin.', 'error');
    }
  }
  on(q('btn-download-csv'), 'click', () => exportData('csv'));
  on(q('btn-download-json'), 'click', () => exportData('json'));
  on(q('btn-export-csv-quick'), 'click', () => exportData('csv'));
  on(q('btn-export-json-quick'), 'click', () => exportData('json'));

  /* ---------------------------------------------------------------- modal */
  const modal = q('video-modal');
  const modalDialog = modal ? modal.querySelector<HTMLElement>('.modal__dialog') : null;
  let lastFocused: HTMLElement | null = null;

  function focusables(): HTMLElement[] {
    if (!modalDialog) return [];
    return Array.from(
      modalDialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], select, input:not([type="file"]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((node) => node.offsetParent !== null);
  }
  function openModal() {
    if (!modal) return;
    lastFocused = document.activeElement as HTMLElement || null;
    modal.hidden = false;
    fetchBenchmarks();
    window.requestAnimationFrame(() => {
      const f = focusables();
      if (f.length) f[0].focus();
    });
  }
  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    const box = q('upload-status-box');
    if (box) box.hidden = true;
    const fileInput = q<HTMLInputElement>('video-file-input');
    if (fileInput) fileInput.value = '';
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
  }
  on(q('btn-open-video-modal'), 'click', openModal);
  on(q('btn-close-video-modal'), 'click', closeModal);
  on(q('btn-cancel-video-modal'), 'click', closeModal);
  if (modal) {
    on(modal.querySelector('[data-modal-dismiss]'), 'click', closeModal);
    on(modal, 'keydown', (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        closeModal();
        return;
      }
      if (ev.key !== 'Tab') return;
      const f = focusables();
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    });
  }

  const modalTabs = [q<HTMLButtonElement>('tab-benchmarks-btn'), q<HTMLButtonElement>('tab-upload-btn')];
  const modalPanes = [q('modal-tab-benchmarks'), q('modal-tab-upload')];
  modalTabs.forEach((tab, i) => {
    on(tab, 'click', () => {
      modalTabs.forEach((other, j) => {
        if (!other) return;
        const active = i === j;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', String(active));
        other.tabIndex = active ? 0 : -1;
        const pane = modalPanes[j];
        if (pane) pane.hidden = !active;
      });
    });
  });
  if (modalPanes[0]) modalPanes[0].hidden = false;
  if (modalPanes[1]) modalPanes[1].hidden = true;

  /* ------------------------------------------------------------ benchmarks */
  const benchList = q('benchmark-video-list');
  function benchMessage(text: string, tone2?: string) {
    if (!benchList) return;
    benchList.textContent = '';
    const msg = document.createElement('p');
    msg.className = 'benchmarks__msg';
    if (tone2) msg.dataset.tone = tone2;
    msg.textContent = text;
    benchList.appendChild(msg);
  }
  async function fetchBenchmarks() {
    if (!benchList) return;
    benchMessage('Loading recorded optical benchmarks…');
    try {
      const res = await fetch('/api/simulation/video_benchmarks');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderBenchmarks(Array.isArray(data) ? data : []);
    } catch (err) {
      benchMessage(
        'Could not load video benchmarks. ' + (err instanceof Error ? err.message : 'Request failed.'),
        'error'
      );
    }
  }
  function renderBenchmarks(items: Telemetry[]) {
    if (!benchList) return;
    if (!items.length) {
      benchMessage('No recorded videos available from the backend.');
      return;
    }
    benchList.textContent = '';
    items.forEach((b) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'benchmark';
      const title = document.createElement('span');
      title.className = 'benchmark__title';
      title.textContent = String(b.filename || 'untitled').
      replace(/\.[^/.]+$/, '').
      replace(/_/g, ' ');
      const meta = document.createElement('span');
      meta.className = 'benchmark__meta';
      [b.resolution, b.frames != null ? b.frames + ' frames' : null, b.fps != null ? b.fps + ' fps' : null,
      b.size_mb != null ? b.size_mb + ' MB' : null].
      filter(Boolean).
      forEach((part) => {
        const s = document.createElement('span');
        s.textContent = String(part);
        meta.appendChild(s);
      });
      const desc = document.createElement('span');
      desc.className = 'benchmark__desc';
      desc.textContent = 'Runs the closed-loop PAT pipeline against this recorded optical stream.';
      card.append(title, meta, desc);
      on(card, 'click', () => selectBenchmark(String(b.filename || '')));
      benchList.appendChild(card);
    });
  }
  function selectBenchmark(filename: string) {
    if (!scenarioSelect) return;
    const stem = filename.replace(/\.[^/.]+$/, '').toUpperCase();
    let idx = -1;
    for (let i = 0; i < scenarioSelect.options.length; i++) {
      const opt = scenarioSelect.options[i];
      if ((opt.textContent || '').toUpperCase().includes(stem)) {
        idx = parseInt(opt.value, 10);
        break;
      }
    }
    if (idx >= 0) {
      scenarioSelect.value = String(idx);
      if (send({ action: 'select_scenario', index: idx })) {
        log('VIDEO', 'Loaded benchmark "' + filename + '".', 'lock');
        toast('Loading "' + filename + '"…', 'ok');
        closeModal();
      }
    } else {
      toast('No scenario is registered for "' + filename + '" yet.', 'warn');
    }
  }

  /* ---------------------------------------------------------------- upload */
  const dropzone = q('upload-dropzone');
  const fileInput = q<HTMLInputElement>('video-file-input');
  const upBox = q('upload-status-box');
  const upName = q('upload-filename-txt');
  const upState = q('upload-progress-txt');
  const upBar = q('upload-progress-bar');
  const upDetail = q('upload-details-txt');

  function setUpload(state: string, label: string, detail: string, pct: number) {
    if (upBox) {
      upBox.hidden = false;
      upBox.dataset.state = state;
    }
    if (upState) upState.textContent = label;
    if (upDetail) upDetail.textContent = detail;
    if (upBar) upBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
  }

  function uploadVideo(file: File) {
    if (!file) return;
    const ext = '.' + (file.name.split('.').pop() || '').toLowerCase();
    if (!['.mp4', '.avi', '.webm', '.ogv', '.mkv'].includes(ext)) {
      if (upName) upName.textContent = file.name;
      setUpload('error', 'Rejected', 'Unsupported format "' + ext + '". Use MP4, AVI, WEBM, OGV or MKV.', 100);
      return;
    }
    if (upName) upName.textContent = file.name;
    setUpload('uploading', 'Uploading…', 'Transferring to the optical video decoding pipeline.', 4);

    const form = new FormData();
    form.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/simulation/upload_video');
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        const pct = ev.loaded / ev.total * 85;
        setUpload('uploading', Math.round(ev.loaded / ev.total * 100) + '%', 'Transferring binary payload…', pct);
      }
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        let detail = 'Upload failed with status ' + xhr.status + '.';
        try {
          const parsed = JSON.parse(xhr.responseText);
          if (parsed && parsed.detail) detail = String(parsed.detail);
        } catch {

          /* keep default */}
        setUpload('error', 'Error', detail, 100);
        toast('Video upload failed.', 'error');
        return;
      }
      let res: Telemetry = {};
      try {
        res = JSON.parse(xhr.responseText);
      } catch {

        /* tolerate empty body */}
      const info = res.video_info || {};
      setUpload(
        'done',
        'Converted',
        'Decoded ' + (info.width || '?') + '×' + (info.height || '?') + ' · ' + (
        info.num_frames != null ? info.num_frames : '?') + ' frames @ ' + (
        typeof info.fps === 'number' ? info.fps.toFixed(1) : '?') + ' fps.',
        100
      );
      toast('Video converted and registered.', 'ok');
      log('VIDEO', 'Uploaded "' + file.name + '" (' + (info.num_frames ?? '?') + ' frames).', 'lock');
      fetch('/api/scenarios').
      then((r) => r.json()).
      then((list) => {
        populateScenarios(list);
        if (res.index !== undefined && scenarioSelect) scenarioSelect.value = String(res.index);
      }).
      catch(() => {

        /* scenario list refresh is best-effort */});
      window.setTimeout(closeModal, 900);
    };
    xhr.onerror = () => {
      setUpload('error', 'Error', 'Network error while uploading. Is the backend reachable?', 100);
      toast('Video upload failed.', 'error');
    };
    xhr.send(form);
  }

  on(q('btn-browse-file'), 'click', (ev: MouseEvent) => {
    ev.stopPropagation();
    fileInput?.click();
  });
  on(dropzone, 'click', () => fileInput?.click());
  on(dropzone, 'keydown', (ev: KeyboardEvent) => {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      fileInput?.click();
    }
  });
  on(fileInput, 'change', (ev: Event) => {
    const files = (ev.target as HTMLInputElement).files;
    if (files && files[0]) uploadVideo(files[0]);
  });
  ['dragenter', 'dragover'].forEach((name) =>
  on(dropzone, name, (ev: DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dropzone?.classList.add('is-dragover');
  })
  );
  ['dragleave', 'drop'].forEach((name) =>
  on(dropzone, name, (ev: DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dropzone?.classList.remove('is-dragover');
  })
  );
  on(dropzone, 'drop', (ev: DragEvent) => {
    const files = ev.dataTransfer?.files;
    if (files && files[0]) uploadVideo(files[0]);
  });

  /* ----------------------------------------------------- keyboard shortcuts */
  on(window, 'keydown', (ev: KeyboardEvent) => {
    const target = ev.target as HTMLElement | null;
    const tag = target ? target.tagName : '';
    if (ev.key === 'Escape') {
      closeModal();
      return;
    }
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (modal && !modal.hidden) return;
    if (ev.code === 'Space') {
      ev.preventDefault();
      btnPlay?.click();
    } else if (ev.code === 'ArrowRight') {
      ev.preventDefault();
      q('btn-step')?.click();
    } else if (ev.code === 'KeyR') {
      ev.preventDefault();
      q('btn-reset')?.click();
    }
  });

  on(q('btn-retry-link'), 'click', () => {
    wsRetry = 0;
    if (retryTimer) window.clearTimeout(retryTimer);
    connect();
  });

  /* --------------------------------------------------------------- sizing */
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    let raf = 0;
    ro = new ResizeObserver(() => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(resizeAll);
    });
    if (radarCanvas?.parentElement) ro.observe(radarCanvas.parentElement);
    if (scopeCanvas?.parentElement) ro.observe(scopeCanvas.parentElement);
    disposers.push(() => ro?.disconnect());
  }
  on(window, 'resize', resizeAll);

  /* ----------------------------------------------------------------- start */
  resetView();
  window.requestAnimationFrame(resizeAll);
  connect();

  return () => {
    disposed = true;
    if (retryTimer) window.clearTimeout(retryTimer);
    if (ws) {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {

        /* already closed */}
      ws = null;
    }
    if (audioCtx) {
      try {
        void audioCtx.close();
      } catch {

        /* ignore */}
      audioCtx = null;
    }
    disposers.forEach((fn) => {
      try {
        fn();
      } catch {

        /* ignore */}
    });
  };
}

/* =========================================================================
   REACT SHELL — mounts the vanilla console. Not part of the deliverable.
   ========================================================================= */
export function App() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    host.innerHTML = CONSOLE_HTML;
    let teardown: (() => void) | undefined;
    try {
      teardown = mountConsole(host);
    } catch (err) {
      console.error('Console runtime failed to start:', err);
    }
    return () => {
      try {
        if (teardown) teardown();
      } catch {

        /* ignore teardown errors */}
      host.innerHTML = '';
    };
  }, []);

  return (
    <>
      <style>{CONSOLE_CSS}</style>
      <div className="console-root" ref={hostRef} />
    </>);

}