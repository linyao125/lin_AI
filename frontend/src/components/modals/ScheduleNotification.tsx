import { useState, useEffect, useCallback } from "react";
import { Bell, X, Check } from "lucide-react";

interface Schedule {
  id: number;
  title: string;
  remind_at: string;
  note: string;
  done: boolean;
  repeat?: string;
}

interface Notification {
  schedule: Schedule;
  key: number;
}

export function ScheduleNotification() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notified, setNotified] = useState<Set<number>>(new Set());

  const checkDue = useCallback(async () => {
    try {
      const r = await fetch("/api/schedules/due");
      const d = await r.json();
      const due: Schedule[] = d.due || [];
      const newOnes = due.filter((s) => !notified.has(s.id));
      if (newOnes.length > 0) {
        setNotifications((prev) => [
          ...prev,
          ...newOnes.map((s) => ({ schedule: s, key: Date.now() + s.id })),
        ]);
        setNotified((prev) => {
          const next = new Set(prev);
          newOnes.forEach((s) => next.add(s.id));
          return next;
        });
      }
    } catch {}
  }, [notified]);

  useEffect(() => {
    checkDue();
    const timer = setInterval(checkDue, 60000);
    return () => clearInterval(timer);
  }, [checkDue]);

  const dismiss = (key: number) => {
    setNotifications((prev) => prev.filter((n) => n.key !== key));
  };

  const markDone = async (id: number, key: number) => {
    await fetch(`/api/schedules/${id}/done`, { method: "POST" });
    dismiss(key);
  };

  if (notifications.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] flex flex-col items-center gap-2 pt-4 pointer-events-none">
      {notifications.map((n) => (
        <div
          key={n.key}
          className="pointer-events-auto w-full max-w-sm mx-auto"
          style={{
            animation: "slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          <div
            className="mx-4 rounded-2xl border border-border/80 bg-popover shadow-2xl overflow-hidden"
            style={{
              boxShadow: "0 8px 32px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.15)",
            }}
          >
            {/* 顶部色条 */}
            <div className="h-1 w-full bg-primary opacity-80" />

            <div className="flex items-center gap-3 px-4 py-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15">
                <Bell size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground leading-tight">{n.schedule.title}</p>
                {n.schedule.note && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.schedule.note}</p>
                )}
                <p className="text-xs text-muted-foreground/70 mt-0.5">日程提醒</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => markDone(n.schedule.id, n.key)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  title="完成"
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={async () => {
                    if (!n.schedule.repeat || n.schedule.repeat === "none") {
                      await fetch(`/api/schedules/${n.schedule.id}/done`, { method: "POST" });
                    }
                    dismiss(n.key);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title="关闭"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
