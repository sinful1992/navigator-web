import * as React from "react";
import "./App.css";
import { ImportExcel } from "./ImportExcel";
import { useAppState } from "./useAppState";
import { AddressList } from "./AddressList";
import { Completed } from "./Completed";
import { DayPanel } from "./DayPanel";
import { downloadJson, readJsonFile } from "./backup";

type Tab = "list" | "completed";

export default function App() {
  const {
    state,
    loading,
    setAddresses,
    setActive,
    cancelActive,
    complete,
    undo,
    startDay,
    endDay,
    backupState,
    restoreState,
  } = useAppState();

  const [tab, setTab] = React.useState<Tab>("list");
  const [search, setSearch] = React.useState("");

  // ----- helpers shared by UI & hotkeys -----
  const completedIdx = React.useMemo(
    () => new Set(state.completions.map((c) => c.index)),
    [state.completions]
  );

  const lowerQ = search.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      state.addresses
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => !lowerQ || a.address.toLowerCase().includes(lowerQ))
        .filter(({ i }) => !completedIdx.has(i)),
    [state.addresses, lowerQ, completedIdx]
  );

  const hasActiveSession = state.daySessions.some((d) => !d.end);

  const doQuickComplete = React.useCallback(
    (i: number) => {
      const input = window.prompt(
        "Outcome:\n- Leave empty = Done\n- Type DA = mark as DA\n- Type a number (e.g. 50) = PIF £amount"
      );
      if (input === null) return;
      const text = input.trim();
      if (!text) {
        complete(i, "Done");
      } else if (text.toUpperCase() === "DA") {
        complete(i, "DA");
      } else {
        const n = Number(text);
        if (Number.isFinite(n) && n > 0) {
          complete(i, "PIF", n.toFixed(2));
        } else {
          alert(
            "Invalid amount. Use a number (e.g., 50) or type DA, or leave blank for Done."
          );
        }
      }
    },
    [complete]
  );

  // ----- keyboard shortcuts (List tab only) -----
  React.useEffect(() => {
    if (tab !== "list") return;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!el || !(el as HTMLElement)) return false;
      const t = el as HTMLElement;
      const tag = t.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (t as HTMLElement).isContentEditable
      );
    };

    const handler = (e: KeyboardEvent) => {
      // Ignore while typing in inputs
      if (isTypingTarget(e.target)) return;

      // Navigation among visible rows
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (visible.length === 0) return;

        const pos =
          state.activeIndex != null
            ? visible.findIndex(({ i }) => i === state.activeIndex)
            : -1;

        if (e.key === "ArrowDown") {
          const nextPos = pos >= 0 ? (pos + 1) % visible.length : 0;
          setActive(visible[nextPos].i);
        } else {
          const prevPos =
            pos >= 0 ? (pos - 1 + visible.length) % visible.length : visible.length - 1;
          setActive(visible[prevPos].i);
        }
        return;
      }

      // Complete current
      if (e.key === "Enter") {
        if (state.activeIndex != null) {
          e.preventDefault();
          doQuickComplete(state.activeIndex);
        }
        return;
      }

      // Undo latest completion
      if (e.key === "u" || e.key === "U") {
        const latest = state.completions[0];
        if (latest) {
          e.preventDefault();
          undo(latest.index);
        }
        return;
      }

      // Start / End day
      if (e.key === "s" || e.key === "S") {
        if (!hasActiveSession) {
          e.preventDefault();
          startDay();
        }
        return;
      }
      if (e.key === "e" || e.key === "E") {
        if (hasActiveSession) {
          e.preventDefault();
          endDay();
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    tab,
    visible,
    state.activeIndex,
    state.completions,
    hasActiveSession,
    setActive,
    undo,
    doQuickComplete,
    startDay,
    endDay,
  ]);

  // ----- Backup / Restore -----
  const onBackup = () => {
    const snap = backupState();
    const stamp = new Date();
    const y = String(stamp.getFullYear());
    const m = String(stamp.getMonth() + 1).padStart(2, "0");
    const d = String(stamp.getDate()).padStart(2, "0");
    downloadJson(`navigator-backup-${y}${m}${d}.json`, snap);
  };

  const onRestore: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      restoreState(data);
      alert("Restore complete.");
    } catch (err: any) {
      console.error(err);
      alert(`Restore failed: ${err?.message || err}`);
    } finally {
      e.target.value = ""; // allow selecting the same file again later
    }
  };

  return (
    <div
      style={{
        maxWidth: 960,
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Address Navigator (Web)</h1>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button onClick={() => setTab("list")} disabled={tab === "list"}>
            List
          </button>
          <button
            onClick={() => setTab("completed")}
            disabled={tab === "completed"}
          >
            Completed
          </button>
        </div>
      </header>

      <p>
        Load an Excel file with <b>address</b>, optional <b>lat</b>, <b>lng</b>{" "}
        columns.
      </p>
      <div
        style={{
          marginBottom: 16,
          display: "flex",
          gap: 8,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <ImportExcel onImported={setAddresses} />

        <button onClick={onBackup}>Backup (.json)</button>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span>Restore</span>
          <input type="file" accept="application/json" onChange={onRestore} />
        </label>
      </div>

      {loading ? (
        <p style={{ opacity: 0.7 }}>Loading…</p>
      ) : tab === "list" ? (
        <>
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              margin: "8px 0",
            }}
          >
            <input
              type="text"
              value={search}
              placeholder="Search addresses…"
              onChange={(e) => setSearch(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 10px",
                border: "1px solid #ddd",
                borderRadius: 6,
              }}
            />
          </div>

          <DayPanel
            sessions={state.daySessions}
            completions={state.completions}
            startDay={startDay}
            endDay={endDay}
          />

          <div style={{ margin: "8px 0", opacity: 0.8 }}>
            Total addresses: <b>{state.addresses.length}</b>
            {state.activeIndex !== null && (
              <span style={{ marginLeft: 12 }}>
                • Active: <b>{state.activeIndex + 1}</b>
              </span>
            )}
          </div>

          <AddressList
            state={state}
            setActive={setActive}
            cancelActive={cancelActive}
            complete={complete}
            filterText={search}
          />

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            Shortcuts: ↑/↓ move • Enter complete • U undo latest • S start day •
            E end day
          </div>
        </>
      ) : (
        <Completed state={state} />
      )}
    </div>
  );
}
