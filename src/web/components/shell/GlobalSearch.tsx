// Top-bar search over farms and parcels (both regions). Farms open the farm page; parcels open the map centred on them.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, MapPin, Search, Tractor, X } from "lucide-react";
import type { Farm, ParcelMin } from "@/shared/types";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import { cropLabel, fmtHa } from "../../lib/format";
import { navigate } from "../../lib/router";

interface Hit {
  kind: "farm" | "parcel";
  id: string;
  title: string;
  sub: string;
  path: string;
  query?: Record<string, string>;
}

const MAX_EACH = 6;
const regionShort = (r: string) => (r === "SE_SKANE" ? "Sweden" : "Finland");

export function GlobalSearch({ className }: { className?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [farms, setFarms] = useState<Farm[] | null>(null);
  const [parcels, setParcels] = useState<ParcelMin[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Load lazily on first focus: the parcel list is ~750 kB, so it is not fetched until someone searches.
  const load = () => {
    if (started.current) return;
    started.current = true;
    setLoading(true);
    Promise.all([api.farms("both"), api.parcelsMin({ region: "both" })])
      .then(([f, p]) => {
        setFarms(f.farms);
        setParcels(p.parcels);
      })
      .catch(() => {
        setFailed(true);
        started.current = false;
      })
      .finally(() => setLoading(false));
  };

  // "/" focuses the search from anywhere (unless typing in a field).
  useEffect(() => {
    const on = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.metaKey || e.ctrlKey || t?.closest("input, textarea, select, [contenteditable=true]")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    const on = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", on);
    return () => document.removeEventListener("mousedown", on);
  }, [open]);

  const farmById = useMemo(() => new Map((farms ?? []).map((f) => [f.farmId, f])), [farms]);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    const fh: Hit[] = [];
    for (const f of farms ?? []) {
      const crops = f.contractCrops.map(cropLabel).join(", ");
      if (f.farmId.toLowerCase().includes(s) || crops.toLowerCase().includes(s) || f.segment.toLowerCase().includes(s)) {
        fh.push({ kind: "farm", id: f.farmId, title: `Farm ${f.farmId}`, sub: [regionShort(f.region), crops || f.segment].filter(Boolean).join(" · "), path: `/farm/${f.farmId}` });
        if (fh.length >= MAX_EACH) break;
      }
    }
    const ph: Hit[] = [];
    for (const p of parcels ?? []) {
      const [pid, farmId, crop, areaHa] = p;
      if (pid.toLowerCase().includes(s) || cropLabel(crop).toLowerCase().includes(s)) {
        const region = farmById.get(farmId)?.region;
        ph.push({ kind: "parcel", id: pid, title: `Parcel ${pid}`, sub: [cropLabel(crop), fmtHa(areaHa), region && regionShort(region)].filter(Boolean).join(" · "), path: "/map", query: { parcel: pid } });
        if (ph.length >= MAX_EACH) break;
      }
    }
    return [...fh, ...ph];
  }, [q, farms, parcels, farmById]);

  useEffect(() => setActive(0), [q]);

  const go = (h: Hit) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    navigate(h.path, h.query);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]!);
    } else if (e.key === "Escape") {
      if (q) setQ("");
      else inputRef.current?.blur();
      setOpen(false);
    }
  };

  const showList = open && q.trim().length > 0;
  const farmHits = hits.filter((h) => h.kind === "farm");
  const parcelHits = hits.filter((h) => h.kind === "parcel");

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <label htmlFor="global-search" className="sr-only">Search farms and parcels</label>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls="global-search-list"
        aria-activedescendant={showList && hits[active] ? `gs-${hits[active]!.kind}-${hits[active]!.id}` : undefined}
        autoComplete="off"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          load();
          setOpen(true);
        }}
        onKeyDown={onKey}
        placeholder="Search farms and parcels…"
        className="field h-10 w-full pl-9 pr-16 text-sm placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {loading && <Loader2 className="size-4 animate-spin text-muted" aria-label="Loading" />}
        {q ? (
          <button type="button" onClick={() => (setQ(""), inputRef.current?.focus())} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label="Clear search">
            <X className="size-3.5" />
          </button>
        ) : (
          <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 text-[11px] font-medium text-muted sm:inline">/</kbd>
        )}
      </span>

      {showList && (
        <div id="global-search-list" role="listbox" aria-label="Search results" className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-[70dvh] overflow-y-auto rounded-card border border-border bg-surface py-1.5 shadow-lg">
          {failed ? (
            <p className="px-4 py-3 text-sm text-muted">Couldn't load farms and parcels. Check that the broker is running.</p>
          ) : !farms && loading ? (
            <p className="px-4 py-3 text-sm text-muted">Loading farms and parcels…</p>
          ) : !hits.length ? (
            <p className="px-4 py-3 text-sm text-muted">No farm or parcel matches “{q.trim()}”. Try an id like F0012 or a crop.</p>
          ) : (
            <>
              <Group label="Farms" hits={farmHits} offset={0} active={active} onPick={go} onHover={setActive} />
              <Group label="Parcels" hits={parcelHits} offset={farmHits.length} active={active} onPick={go} onHover={setActive} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ label, hits, offset, active, onPick, onHover }: { label: string; hits: Hit[]; offset: number; active: number; onPick: (h: Hit) => void; onHover: (i: number) => void }) {
  if (!hits.length) return null;
  return (
    <div className="py-1">
      <div className="eyebrow px-4 pb-1 pt-1">{label}</div>
      {hits.map((h, i) => {
        const Icon = h.kind === "farm" ? Tractor : MapPin;
        const on = offset + i === active;
        return (
          <div
            key={h.id}
            id={`gs-${h.kind}-${h.id}`}
            role="option"
            aria-selected={on}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(h)}
            onMouseEnter={() => onHover(offset + i)}
            className={cn("flex cursor-pointer items-center gap-3 px-4 py-2", on ? "bg-brand-soft" : "hover:bg-surface-2")}
          >
            <Icon className={cn("size-4 shrink-0", on ? "text-brand" : "text-muted")} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-heading">{h.title}</span>
              <span className="block truncate text-xs text-muted">{h.sub}</span>
            </span>
            <span className="text-[11px] text-muted">{h.kind === "farm" ? "Farm page" : "On map"}</span>
          </div>
        );
      })}
    </div>
  );
}
