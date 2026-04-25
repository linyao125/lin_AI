import { useState, useEffect } from "react";
import { X, Plus, Trash2, Check, Bell, ChevronDown } from "lucide-react";

interface Schedule {
  id: number;
  title: string;
  remind_at: string;
  note: string;
  done: boolean;
  repeat: string;
  repeat_days: number[];
}

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  sceneEnabled?: boolean;
}

const REPEAT_OPTIONS = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月指定日期" },
];

const WEEKDAYS = [
  { value: 1, label: "一" },
  { value: 2, label: "二" },
  { value: 3, label: "三" },
  { value: 4, label: "四" },
  { value: 5, label: "五" },
  { value: 6, label: "六" },
  { value: 0, label: "日" },
];

const MONTH_DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function ScheduleModal({ open, onClose, sceneEnabled = true }: ScheduleModalProps) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [title, setTitle] = useState("");
  const [remindAt, setRemindAt] = useState("");
  const [note, setNote] = useState("");
  const [repeat, setRepeat] = useState("none");
  const [repeatDays, setRepeatDays] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editRemindAt, setEditRemindAt] = useState("");
  const [editNote, setEditNote] = useState("");

  const load = async () => {
    const r = await fetch("/api/schedules");
    const d = await r.json();
    setSchedules(d.schedules || []);
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (open && !sceneEnabled) onClose();
  }, [open, sceneEnabled, onClose]);

  const toggleRepeatDay = (day: number) => {
    setRepeatDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleAdd = async () => {
    if (!title || !remindAt) return;
    setAdding(true);
    await fetch("/api/schedules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, remind_at: remindAt, note, repeat, repeat_days: repeatDays }),
    });
    setTitle("");
    setRemindAt("");
    setNote("");
    setRepeat("none");
    setRepeatDays([]);
    setShowForm(false);
    await load();
    setAdding(false);
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/schedules/${id}`, { method: "DELETE" });
    await load();
  };

  const handleDone = async (id: number) => {
    await fetch(`/api/schedules/${id}/done`, { method: "POST" });
    await load();
  };

  const handleEdit = (s: Schedule) => {
    setEditingId(s.id);
    setEditTitle(s.title);
    setEditRemindAt(s.remind_at.slice(0, 16));
    setEditNote(s.note || "");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    await fetch(`/api/schedules/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editTitle, remind_at: editRemindAt, note: editNote }),
    });
    setEditingId(null);
    await load();
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        month: "numeric", day: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  const repeatLabel = (s: Schedule) => {
    if (!s.repeat || s.repeat === "none") return null;
    if (s.repeat === "daily") return "每天";
    if (s.repeat === "weekly") {
      const names = ["日", "一", "二", "三", "四", "五", "六"];
      return "每周" + s.repeat_days.map((d) => names[d]).join("、");
    }
    if (s.repeat === "monthly") return "每月" + s.repeat_days.join("、") + "日";
    return null;
  };

  const pending = schedules.filter((s) => !s.done);
  const done = schedules.filter((s) => s.done);

  if (!open) return null;
  if (!sceneEnabled) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md h-[75vh] rounded-2xl bg-popover border border-border flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2">
            <Bell size={16} className="text-foreground" />
            <span className="text-sm font-semibold text-foreground">日程提醒</span>
            {pending.length > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] px-1">
                {pending.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => sceneEnabled && setShowForm(!showForm)}
              disabled={!sceneEnabled}
              className={`flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium border ${
                sceneEnabled
                  ? "text-primary border-primary/30 hover:bg-primary/10"
                  : "text-muted-foreground border-border opacity-40 cursor-not-allowed"
              }`}
            >
              <Plus size={13} />
              新建
            </button>
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* 新建表单 */}
        {showForm && (
          <div className="px-5 py-3 border-b border-border/60 space-y-2 animate-in fade-in shrink-0">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="日程标题"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              type="datetime-local"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:dark]"
            />
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="备注（选填）"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />

            {/* 重复设置 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setRepeatOpen(!repeatOpen)}
                className="flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 text-sm text-foreground hover:bg-accent/30 transition-colors"
              >
                <span>{REPEAT_OPTIONS.find((o) => o.value === repeat)?.label || "不重复"}</span>
                <ChevronDown size={14} className={`transition-transform ${repeatOpen ? "rotate-180" : ""}`} />
              </button>
              {repeatOpen && (
                <div className="absolute z-10 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-lg overflow-hidden">
                  {REPEAT_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => { setRepeat(o.value); setRepeatDays([]); setRepeatOpen(false); }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${repeat === o.value ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"}`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 每周选天 */}
            {repeat === "weekly" && (
              <div className="flex gap-1.5">
                {WEEKDAYS.map((d) => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleRepeatDay(d.value)}
                    className={`flex-1 py-1.5 rounded-lg text-xs transition-colors ${repeatDays.includes(d.value) ? "bg-accent text-foreground" : "border border-border/40 text-muted-foreground hover:bg-accent/30"}`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}

            {/* 每月选日期 */}
            {repeat === "monthly" && (
              <div className="grid grid-cols-7 gap-1">
                {MONTH_DAYS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleRepeatDay(d)}
                    className={`py-1 rounded text-xs transition-colors ${repeatDays.includes(d) ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/30"}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={handleAdd}
              disabled={adding || !title || !remindAt}
              className="w-full py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {adding ? "添加中..." : "添加日程"}
            </button>
          </div>
        )}

        {/* 日程列表 */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">
          {pending.length === 0 && done.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
              <Bell size={32} strokeWidth={1} className="mb-2 opacity-40" />
              暂无日程
            </div>
          )}

          {pending.length > 0 && (
            <div className="px-4 pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">待完成</p>
              <div className="space-y-2">
                {pending.map((s) => (
                  <div key={s.id} className="rounded-xl border border-border/60 bg-accent/20 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-border cursor-default">
                    {editingId === s.id ? (
                      <div className="p-3 space-y-2">
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                          className="flex h-8 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        <input type="datetime-local" value={editRemindAt} onChange={(e) => setEditRemindAt(e.target.value)}
                          className="flex h-8 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [color-scheme:dark]" />
                        <input value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="备注"
                          className="flex h-8 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring" />
                        <div className="flex gap-2">
                          <button onClick={handleSaveEdit} className="flex-1 py-1.5 rounded-lg bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity">保存</button>
                          <button onClick={() => setEditingId(null)} className="flex-1 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-accent transition-colors">取消</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 p-3">
                        <button onClick={() => handleDone(s.id)}
                          className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border/60 hover:border-foreground transition-colors" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">{s.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatTime(s.remind_at)}</p>
                          {repeatLabel(s) && <p className="text-xs text-primary mt-0.5">{repeatLabel(s)}</p>}
                          {s.note && <p className="text-xs text-muted-foreground mt-0.5">{s.note}</p>}
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => handleEdit(s)} className="text-muted-foreground hover:text-foreground transition-colors p-1">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive transition-colors p-1">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {done.length > 0 && (
            <div className="px-4 pt-4 pb-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">已完成</p>
              <div className="space-y-2">
                {done.map((s) => (
                  <div key={s.id} className="flex items-start gap-3 rounded-xl border border-border/30 p-3 opacity-50 transition-all duration-200 hover:opacity-70 hover:shadow-sm hover:-translate-y-0.5 cursor-default">
                    <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground border-foreground border">
                      <Check size={11} className="text-background" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground line-through">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{formatTime(s.remind_at)}</p>
                    </div>
                    <button onClick={() => handleDelete(s.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
