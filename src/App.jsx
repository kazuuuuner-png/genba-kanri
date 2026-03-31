import { useState, useEffect, useRef } from "react";

// ===== スタッフ定義 =====
const STAFF = [
  { id: "boss",       name: "土屋善照（社長）", role: "社長・現場調整", location: "東京/垂水",   avatar: "善", color: "#4A6FA5" },
  { id: "drafter",    name: "石野英二",         role: "図面作成",       location: "事務所",      avatar: "石", color: "#6B8F71" },
  { id: "supervisor", name: "室谷",             role: "現場監督",       location: "事務所/現場", avatar: "室", color: "#8B6E9E" },
  { id: "carpenter1", name: "外山憲司",         role: "木工・造作",     location: "木工所",      avatar: "外", color: "#C06B3A" },
  { id: "carpenter2", name: "山口辰治",         role: "木工・造作",     location: "木工所",      avatar: "山", color: "#C06B3A" },
  { id: "carpenter3", name: "西川雅也",         role: "木工・造作",     location: "木工所",      avatar: "西", color: "#C06B3A" },
  { id: "painter",    name: "土屋昌嗣",         role: "塗装",           location: "塗装所/現場", avatar: "昌", color: "#A05C5C" },
  { id: "accounting", name: "土屋和貴",         role: "経理",           location: "事務所",      avatar: "和", color: "#7A7A9E" },
];

// ===== Supabase設定 =====
const SB_URL = "https://hhntacvjgnsowtkofkvd.supabase.co";
const SB_KEY = "sb_publishable_ZE99Vq5puU_WndipGMnbSQ_SZKzkFOx";

async function sb(method, table, body, query = "") {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    "Content-Type": "application/json",
  };

  if (method === "POST") {
    headers["Prefer"] = "resolution=merge-duplicates,return=representation";
  }

  const res = await fetch(`${SB_URL}/rest/v1/${table}${query}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const e = await res.text();
    console.error("Supabase error:", e);
    throw new Error(e);
  }

  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ===== 定数 =====
const ATT = {
  none:    { label: "未登録", bg: "#F0F0F0", fg: "#999" },
  present: { label: "出勤中", bg: "#E6F4EC", fg: "#2E7D52" },
  done:    { label: "退勤済", bg: "#E8F0FE", fg: "#3B66D0" },
  early:   { label: "早退",   bg: "#FFF8E1", fg: "#B87A00" },
  late:    { label: "遅刻",   bg: "#FFF3E0", fg: "#C76A00" },
  absent:  { label: "欠勤",   bg: "#FEECEC", fg: "#C0392B" },
};

const TASK_STATUS = ["未着手", "進行中", "完了", "保留"];
const PROJ_STATUS = ["進行中", "完了", "保留"];

const STATUS_CHIP = {
  "未着手": { bg: "#F0F0F0", fg: "#666" },
  "進行中": { bg: "#E8F4FE", fg: "#1A6BB5" },
  "完了":   { bg: "#E6F4EC", fg: "#2E7D52" },
  "保留":   { bg: "#FFF8E1", fg: "#B87A00" },
};

// ===== ユーティリティ =====
function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nowTime() {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function fmtDate(d) {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${m}/${day}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function rowsToAttendance(rows) {
  const att = {};
  (rows || []).forEach((r) => {
    if (!att[r.date]) att[r.date] = {};
    att[r.date][r.staff_id] = {
      status: r.status,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      note: r.note,
    };
  });
  return att;
}

function rowToProject(r) {
  return {
    id: r.id,
    name: r.name,
    client: r.client || "",
    location: r.location || "",
    status: r.status || "進行中",
    startDate: r.start_date || "",
    endDate: r.end_date || "",
    memo: r.memo || "",
    progress: r.progress || 0,
  };
}

function rowToTask(r) {
  return {
    id: r.id,
    projectId: r.project_id || "",
    title: r.title,
    assignee: r.assignee || "",
    status: r.status || "未着手",
    dueDate: r.due_date || "",
    note: r.note || "",
  };
}

function rowToMsg(r) {
  return {
    id: r.id,
    from: r.from_staff,
    body: r.body,
    tag: r.tag || "",
    ts: r.ts,
  };
}

// ===== メインアプリ =====
export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("home");
  const [attendance, setAtt] = useState({});
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [messages, setMsgs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setError(null);

    try {
      const [attRows, projRows, taskRows, msgRows] = await Promise.all([
        sb("GET", "attendance", null, "?select=*"),
        sb("GET", "projects", null, "?select=*"),
        sb("GET", "tasks", null, "?select=*"),
        sb("GET", "messages", null, "?select=*&order=created_at.asc"),
      ]);

      setAtt(rowsToAttendance(attRows));
      setProjects((projRows || []).map(rowToProject));
      setTasks((taskRows || []).map(rowToTask));
      setMsgs((msgRows || []).map(rowToMsg));
    } catch (e) {
      console.error(e);
      setError("データ読み込みに失敗しました。SupabaseのSQLテーブルが作成済みか確認してください。");
    }

    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const stampAtt = async (staffId, date, record) => {
    const row = {
      date,
      staff_id: staffId,
      status: record.status,
      clock_in: record.clockIn || null,
      clock_out: record.clockOut || null,
      note: record.note || null,
    };

    await sb("POST", "attendance", row);

    setAtt((prev) => {
      const next = { ...prev };
      if (!next[date]) next[date] = {};
      next[date] = { ...next[date], [staffId]: record };
      return next;
    });
  };

  const upsertProject = async (proj) => {
    const row = {
      id: proj.id,
      name: proj.name,
      client: proj.client || null,
      location: proj.location || null,
      status: proj.status,
      start_date: proj.startDate || null,
      end_date: proj.endDate || null,
      memo: proj.memo || null,
      progress: proj.progress || 0,
    };

    await sb("POST", "projects", row);

    setProjects((prev) =>
      prev.find((p) => p.id === proj.id)
        ? prev.map((p) => (p.id === proj.id ? proj : p))
        : [...prev, proj]
    );
  };

  const deleteProject = async (id) => {
    await sb("DELETE", "tasks", null, `?project_id=eq.${id}`);
    await sb("DELETE", "projects", null, `?id=eq.${id}`);

    setProjects((prev) => prev.filter((p) => p.id !== id));
    setTasks((prev) => prev.filter((t) => t.projectId !== id));
  };

  const updateProjectField = async (id, field, value) => {
    const proj = projects.find((p) => p.id === id);
    if (!proj) return;
    await upsertProject({ ...proj, [field]: value });
  };

  const upsertTask = async (task) => {
    const row = {
      id: task.id,
      project_id: task.projectId || null,
      title: task.title,
      assignee: task.assignee || null,
      status: task.status,
      due_date: task.dueDate || null,
      note: task.note || null,
    };

    await sb("POST", "tasks", row);

    setTasks((prev) =>
      prev.find((t) => t.id === task.id)
        ? prev.map((t) => (t.id === task.id ? task : t))
        : [...prev, task]
    );
  };

  const deleteTask = async (id) => {
    await sb("DELETE", "tasks", null, `?id=eq.${id}`);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const updateTaskStatus = async (id, status) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    await upsertTask({ ...task, status });
  };

  const addMsg = async (msg) => {
    const row = {
      id: msg.id,
      from_staff: msg.from,
      body: msg.body,
      tag: msg.tag || null,
      ts: msg.ts,
    };

    await sb("POST", "messages", row);
    setMsgs((prev) => [...prev, msg]);
  };

  const deleteMsg = async (id) => {
    await sb("DELETE", "messages", null, `?id=eq.${id}`);
    setMsgs((prev) => prev.filter((m) => m.id !== id));
  };

  const todayAtt = attendance[today()] || {};

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#F7F5F2",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid #C06B3A",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        <span style={{ color: "#999", fontSize: 13 }}>Supabaseからデータを読み込み中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          background: "#F7F5F2",
          flexDirection: "column",
          gap: 12,
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32 }}>⚠️</div>
        <div style={{ color: "#C0392B", fontWeight: 600 }}>{error}</div>
        <div style={{ fontSize: 12, color: "#AAA", maxWidth: 320 }}>
          Supabaseの「SQL Editor」でテーブルを作成してから再試行してください
        </div>
        <button
          onClick={loadAll}
          style={{
            background: "#C06B3A",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "10px 24px",
            fontSize: 14,
            cursor: "pointer",
          }}
        >
          再試行
        </button>
      </div>
    );
  }

  if (!user) {
    return <UserSelect onSelect={setUser} todayAtt={todayAtt} onReload={loadAll} />;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#F7F5F2",
        display: "flex",
        flexDirection: "column",
        fontFamily: "'Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif",
      }}
    >
      <Header user={user} onSwitch={() => setUser(null)} onReload={loadAll} />

      <main style={{ flex: 1, overflowY: "auto", padding: "12px 14px 80px" }}>
        {tab === "home" && (
          <HomeTab user={user} todayAtt={todayAtt} projects={projects} tasks={tasks} messages={messages} />
        )}

        {tab === "attendance" && (
          <AttTab user={user} attendance={attendance} stampAtt={stampAtt} />
        )}

        {tab === "projects" && (
          <ProjTab
            projects={projects}
            tasks={tasks}
            upsertProject={upsertProject}
            deleteProject={deleteProject}
            updateProjectField={updateProjectField}
            upsertTask={upsertTask}
            deleteTask={deleteTask}
            updateTaskStatus={updateTaskStatus}
          />
        )}

        {tab === "tasks" && (
          <TaskTab tasks={tasks} projects={projects} updateTaskStatus={updateTaskStatus} user={user} />
        )}

        {tab === "messages" && (
          <MsgTab messages={messages} addMsg={addMsg} deleteMsg={deleteMsg} user={user} />
        )}
      </main>

      <BottomNav tab={tab} setTab={setTab} />
    </div>
  );
}

// ===== ユーザー選択 =====
function UserSelect({ onSelect, todayAtt, onReload }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#1C2B3A",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <div
          style={{
            fontSize: 13,
            letterSpacing: 4,
            color: "#7A9AB8",
            marginBottom: 8,
            textTransform: "uppercase",
          }}
        >
          Genba Kanri
        </div>
        <div style={{ fontSize: 26, fontWeight: 700, color: "#FFF", marginBottom: 4 }}>
          現場管理システム
        </div>
        <div style={{ fontSize: 13, color: "#6B8FA8" }}>あなたは誰ですか？</div>
      </div>

      <div style={{ width: "100%", maxWidth: 400, display: "flex", flexDirection: "column", gap: 8 }}>
        {STAFF.map((s) => {
          const att = todayAtt[s.id];
          const si = ATT[att?.status || "none"];

          return (
            <button
              key={s.id}
              onClick={() => onSelect(s)}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                padding: "12px 16px",
                display: "flex",
                alignItems: "center",
                gap: 14,
                cursor: "pointer",
                transition: "all 0.15s",
                textAlign: "left",
                width: "100%",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.06)")}
            >
              <Avatar staff={s} size={44} />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#FFF", fontWeight: 600, fontSize: 15 }}>{s.name}</div>
                <div style={{ color: "#7A9AB8", fontSize: 12, marginTop: 2 }}>
                  {s.role} · {s.location}
                </div>
              </div>
              <div
                style={{
                  padding: "3px 10px",
                  borderRadius: 20,
                  background: si.bg,
                  color: si.fg,
                  fontSize: 11,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {si.label}
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={onReload}
        style={{
          marginTop: 20,
          color: "#7A9AB8",
          background: "none",
          border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 8,
          padding: "8px 20px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        🔄 最新データを取得
      </button>
    </div>
  );
}

// ===== ヘッダー =====
function Header({ user, onSwitch, onReload }) {
  return (
    <header
      style={{
        background: "#1C2B3A",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "sticky",
        top: 0,
        zIndex: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar staff={user} size={34} />
        <div>
          <div style={{ color: "#FFF", fontWeight: 600, fontSize: 14 }}>{user.name}</div>
          <div style={{ color: "#7A9AB8", fontSize: 11 }}>{user.role}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onReload}
          style={{
            color: "#7A9AB8",
            fontSize: 13,
            background: "none",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          🔄
        </button>
        <button
          onClick={onSwitch}
          style={{
            color: "#7A9AB8",
            fontSize: 12,
            background: "none",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
          }}
        >
          切替
        </button>
      </div>
    </header>
  );
}

// ===== ボトムナビ =====
function BottomNav({ tab, setTab }) {
  const tabs = [
    { id: "home", icon: "⬜", label: "ホーム" },
    { id: "attendance", icon: "🕐", label: "出退勤" },
    { id: "projects", icon: "📋", label: "案件" },
    { id: "tasks", icon: "🔧", label: "工程" },
    { id: "messages", icon: "💬", label: "連絡板" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#fff",
        borderTop: "1px solid #E8E4DF",
        display: "flex",
        zIndex: 10,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => setTab(t.id)}
          style={{
            flex: 1,
            padding: "10px 4px 8px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: tab === t.id ? "#C06B3A" : "#AAA",
            fontSize: 10,
            fontWeight: tab === t.id ? 700 : 400,
          }}
        >
          <span style={{ fontSize: 20 }}>{t.icon}</span>
          {t.label}
        </button>
      ))}
    </nav>
  );
}

// ===== ホーム =====
function HomeTab({ user, todayAtt, projects, tasks, messages }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("ja-JP", { month: "long", day: "numeric", weekday: "short" });
  const presentCount = STAFF.filter((s) => ["present", "early", "late"].includes(todayAtt[s.id]?.status)).length;
  const activeProj = projects.filter((p) => p.status === "進行中").length;
  const myPending = tasks.filter((t) => t.assignee === user.id && t.status !== "完了").length;
  const myAtt = todayAtt[user.id];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "#B8A99A", letterSpacing: 2, marginBottom: 4 }}>TODAY</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#2C1F14" }}>{dateStr}</div>
        <div style={{ fontSize: 11, color: "#ACD", marginTop: 2 }}>☁️ Supabase同期</div>
      </div>

      <Card style={{ marginBottom: 12, background: "linear-gradient(135deg,#1C2B3A,#2D4356)" }}>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, marginBottom: 6 }}>自分の本日の状況</div>
        {myAtt ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Chip status={myAtt.status} type="att" />
            <div style={{ color: "rgba(255,255,255,0.8)", fontSize: 13 }}>
              {myAtt.clockIn && `出勤 ${myAtt.clockIn}`}
              {myAtt.clockOut && ` → 退勤 ${myAtt.clockOut}`}
              {myAtt.note && ` (${myAtt.note})`}
            </div>
          </div>
        ) : (
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>まだ登録されていません</div>
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
        {[
          { label: "出勤中", val: presentCount, color: "#2E7D52" },
          { label: "進行案件", val: activeProj, color: "#1A6BB5" },
          { label: "自分のタスク", val: myPending, color: "#C06B3A" },
        ].map((s) => (
          <Card key={s.label} style={{ textAlign: "center", padding: "12px 8px" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.val}</div>
            <div style={{ fontSize: 10, color: "#AAA", marginTop: 2 }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>今日の出勤状況</SectionTitle>
        {STAFF.map((s) => {
          const att = todayAtt[s.id];
          const si = ATT[att?.status || "none"];

          return (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 0",
                borderBottom: "1px solid #F0EDE9",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar staff={s} size={28} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#2C1F14" }}>{s.name}</div>
                  <div style={{ fontSize: 10, color: "#BBB" }}>{s.location}</div>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    background: si.bg,
                    color: si.fg,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {si.label}
                </div>
                {att?.clockIn && (
                  <div style={{ fontSize: 10, color: "#CCC", marginTop: 2 }}>
                    {att.clockIn}
                    {att.clockOut ? `〜${att.clockOut}` : ""}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      <Card>
        <SectionTitle>最近の連絡</SectionTitle>
        {messages.length === 0 ? (
          <div style={{ color: "#CCC", fontSize: 13 }}>連絡はありません</div>
        ) : (
          [...messages]
            .reverse()
            .slice(0, 3)
            .map((m) => {
              const sender = STAFF.find((s) => s.id === m.from);
              return (
                <div
                  key={m.id}
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "7px 0",
                    borderBottom: "1px solid #F0EDE9",
                  }}
                >
                  <Avatar staff={sender} size={26} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: "#AAA" }}>
                      {sender?.name} · {m.ts}
                    </div>
                    <div style={{ fontSize: 13, color: "#2C1F14", marginTop: 2, whiteSpace: "pre-wrap" }}>
                      {m.body}
                    </div>
                  </div>
                </div>
              );
            })
        )}
      </Card>
    </div>
  );
}

// ===== 出退勤 =====
function AttTab({ user, attendance, stampAtt }) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [viewDate, setViewDate] = useState(today());

  const rec = attendance[today()]?.[user.id] || {};
  const hasIn = !!rec.clockIn;
  const hasOut = !!rec.clockOut;
  const isAbsent = rec.status === "absent";
  const isDone = rec.status === "done" || rec.status === "early";

  const stamp = async (type) => {
    setSaving(true);
    const prev = attendance[today()]?.[user.id] || {};
    let record = { ...prev };

    if (type === "in") {
      record = { ...prev, status: "present", clockIn: prev.clockIn || nowTime(), note };
    }
    if (type === "out") {
      record = { ...prev, status: "done", clockOut: nowTime() };
    }
    if (type === "early") {
      record = { ...prev, status: "early", clockOut: nowTime(), note };
    }
    if (type === "late") {
      record = { ...prev, status: "late", clockIn: prev.clockIn || nowTime(), note };
    }
    if (type === "absent") {
      record = { status: "absent", note, clockIn: "", clockOut: "" };
    }

    await stampAtt(user.id, today(), record);
    setNote("");
    setSaving(false);
  };

  const viewAtt = attendance[viewDate] || {};

  return (
    <div>
      <PageTitle>出退勤管理</PageTitle>

      <Card style={{ marginBottom: 12 }}>
        <SectionTitle>本日の打刻 — {user.name}</SectionTitle>

        {rec.status && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <Chip status={rec.status} type="att" />
            {rec.clockIn && <span style={{ fontSize: 13, color: "#666" }}>出勤 {rec.clockIn}</span>}
            {rec.clockOut && <span style={{ fontSize: 13, color: "#666" }}>→ 退勤 {rec.clockOut}</span>}
          </div>
        )}

        {rec.note && <div style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>備考: {rec.note}</div>}

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="備考・理由（任意）"
          rows={2}
          style={{
            width: "100%",
            border: "1px solid #E0DBD6",
            borderRadius: 8,
            padding: "8px 10px",
            fontSize: 13,
            resize: "none",
            outline: "none",
            marginBottom: 10,
            boxSizing: "border-box",
            fontFamily: "inherit",
          }}
        />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <Btn color="#2E7D52" onClick={() => stamp("in")} disabled={hasIn || isAbsent || isDone || saving}>
            ✅ 出勤
          </Btn>
          <Btn color="#1A6BB5" onClick={() => stamp("out")} disabled={!hasIn || hasOut || isAbsent || saving}>
            🏠 退勤
          </Btn>
          <Btn color="#B87A00" onClick={() => stamp("early")} disabled={!hasIn || hasOut || isAbsent || saving}>
            ⚡ 早退
          </Btn>
          <Btn color="#C76A00" onClick={() => stamp("late")} disabled={hasIn || isAbsent || isDone || saving}>
            ⏰ 遅刻
          </Btn>
          <Btn color="#C0392B" onClick={() => stamp("absent")} disabled={hasIn || hasOut || saving} style={{ gridColumn: "span 2" }}>
            ❌ 欠勤連絡
          </Btn>
        </div>

        {saving && <div style={{ textAlign: "center", color: "#AAA", fontSize: 12, marginTop: 8 }}>Supabaseに保存中...</div>}
      </Card>

      <Card>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <SectionTitle style={{ margin: 0 }}>チーム状況</SectionTitle>
          <input
            type="date"
            value={viewDate}
            onChange={(e) => setViewDate(e.target.value)}
            style={{ fontSize: 12, border: "1px solid #E0DBD6", borderRadius: 6, padding: "4px 8px", outline: "none" }}
          />
        </div>

        {STAFF.map((s) => {
          const att = viewAtt[s.id] || {};
          const si = ATT[att.status || "none"];

          return (
            <div
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid #F0EDE9",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Avatar staff={s} size={32} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "#2C1F14" }}>{s.name}</div>
                  <div style={{ fontSize: 11, color: "#BBB" }}>{s.location}</div>
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div
                  style={{
                    padding: "3px 10px",
                    borderRadius: 10,
                    background: si.bg,
                    color: si.fg,
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {si.label}
                </div>
                {att.clockIn && (
                  <div style={{ fontSize: 10, color: "#CCC", marginTop: 2 }}>
                    {att.clockIn}
                    {att.clockOut ? `〜${att.clockOut}` : ""}
                  </div>
                )}
                {att.note && <div style={{ fontSize: 10, color: "#CCC" }}>{att.note}</div>}
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

// ===== 案件 =====
function ProjTab({
  projects,
  tasks,
  upsertProject,
  deleteProject,
  updateProjectField,
  upsertTask,
  deleteTask,
  updateTaskStatus,
}) {
  const [detail, setDetail] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    client: "",
    location: "",
    status: "進行中",
    startDate: "",
    endDate: "",
    memo: "",
  });

  const addProj = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    await upsertProject({ ...form, id: uid(), progress: 0 });
    setForm({
      name: "",
      client: "",
      location: "",
      status: "進行中",
      startDate: "",
      endDate: "",
      memo: "",
    });
    setShowForm(false);
    setSaving(false);
  };

  if (detail) {
    const proj = projects.find((p) => p.id === detail);
    if (!proj) return null;

    return (
      <ProjDetail
        proj={proj}
        tasks={tasks.filter((t) => t.projectId === proj.id)}
        onBack={() => setDetail(null)}
        updateProjectField={updateProjectField}
        upsertTask={upsertTask}
        deleteTask={deleteTask}
        updateTaskStatus={updateTaskStatus}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <PageTitle style={{ margin: 0 }}>案件管理</PageTitle>
        <Btn color="#C06B3A" onClick={() => setShowForm(!showForm)} small>
          ＋ 新規案件
        </Btn>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 12, border: "1px solid #F0C8A0" }}>
          <SectionTitle>新規案件登録</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="案件名 *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Input placeholder="施主・クライアント名" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />
            <Input placeholder="現場場所" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "#AAA" }}>開始日</label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: "#AAA" }}>完了予定</label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>

            <TextArea placeholder="備考・メモ" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Btn color="#AAA" onClick={() => setShowForm(false)}>
                キャンセル
              </Btn>
              <Btn color="#C06B3A" onClick={addProj} disabled={saving}>
                {saving ? "保存中..." : "登録する"}
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card style={{ textAlign: "center", color: "#CCC", padding: 40 }}>案件がありません</Card>
      ) : (
        projects.map((p) => {
          const ptasks = tasks.filter((t) => t.projectId === p.id);
          const done = ptasks.filter((t) => t.status === "完了").length;
          const sc = STATUS_CHIP[p.status] || STATUS_CHIP["未着手"];

          return (
            <Card key={p.id} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#2C1F14" }}>{p.name}</div>
                  {p.client && <div style={{ fontSize: 12, color: "#888" }}>{p.client}</div>}
                  {p.location && <div style={{ fontSize: 12, color: "#AAA" }}>📍 {p.location}</div>}
                </div>

                <select
                  value={p.status}
                  onChange={(e) => updateProjectField(p.id, "status", e.target.value)}
                  style={{
                    padding: "3px 8px",
                    borderRadius: 10,
                    border: "none",
                    background: sc.bg,
                    color: sc.fg,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {PROJ_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {(p.startDate || p.endDate) && (
                <div style={{ fontSize: 11, color: "#CCC", marginBottom: 6 }}>
                  {p.startDate && fmtDate(p.startDate)}
                  {p.startDate && p.endDate ? " → " : ""}
                  {p.endDate && `${fmtDate(p.endDate)} 完了予定`}
                </div>
              )}

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: "#AAA" }}>
                    進捗{ptasks.length > 0 ? ` (${done}/${ptasks.length}件)` : ""}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#C06B3A" }}>{p.progress}%</span>
                </div>

                <div style={{ position: "relative", height: 6, background: "#F0EDE9", borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      height: "100%",
                      width: `${p.progress}%`,
                      background: "#C06B3A",
                      borderRadius: 3,
                      transition: "width 0.3s",
                    }}
                  />
                </div>

                <input
                  type="range"
                  min="0"
                  max="100"
                  value={p.progress}
                  onChange={(e) => updateProjectField(p.id, "progress", parseInt(e.target.value, 10))}
                  style={{ width: "100%", margin: "6px 0 0", accentColor: "#C06B3A" }}
                />
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setDetail(p.id)}
                  style={{
                    flex: 1,
                    background: "#F7F0E8",
                    color: "#C06B3A",
                    border: "none",
                    borderRadius: 8,
                    padding: "7px 0",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  詳細・タスク ({ptasks.length})
                </button>

                <button
                  onClick={() => {
                    if (window.confirm("削除しますか？")) deleteProject(p.id);
                  }}
                  style={{
                    color: "#CCC",
                    background: "none",
                    border: "1px solid #E8E4DF",
                    borderRadius: 8,
                    padding: "7px 12px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  削除
                </button>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ===== 案件詳細 =====
function ProjDetail({ proj, tasks, onBack, updateProjectField, upsertTask, deleteTask, updateTaskStatus }) {
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    assignee: "",
    status: "未着手",
    dueDate: "",
    note: "",
  });

  const addTask = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await upsertTask({ ...form, id: uid(), projectId: proj.id });
    setForm({
      title: "",
      assignee: "",
      status: "未着手",
      dueDate: "",
      note: "",
    });
    setShowForm(false);
    setSaving(false);
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <button
          onClick={onBack}
          style={{
            color: "#C06B3A",
            background: "none",
            border: "none",
            fontSize: 13,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← 戻る
        </button>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#2C1F14" }}>{proj.name}</span>
      </div>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 13, marginBottom: 10 }}>
          {proj.client && <Info label="施主" val={proj.client} />}
          {proj.location && <Info label="場所" val={proj.location} />}
          {proj.startDate && <Info label="開始" val={proj.startDate} />}
          {proj.endDate && <Info label="完了予定" val={proj.endDate} />}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: "#AAA" }}>進捗</span>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#C06B3A" }}>{proj.progress}%</span>
        </div>

        <div style={{ height: 6, background: "#F0EDE9", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
          <div style={{ height: "100%", width: `${proj.progress}%`, background: "#C06B3A", borderRadius: 3 }} />
        </div>

        <input
          type="range"
          min="0"
          max="100"
          value={proj.progress}
          onChange={(e) => updateProjectField(proj.id, "progress", parseInt(e.target.value, 10))}
          style={{ width: "100%", accentColor: "#C06B3A" }}
        />

        {proj.memo && <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>{proj.memo}</div>}
      </Card>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ fontWeight: 600, color: "#2C1F14" }}>作業指示・タスク</div>
        <Btn color="#C06B3A" onClick={() => setShowForm(!showForm)} small>
          ＋ 追加
        </Btn>
      </div>

      {showForm && (
        <Card style={{ marginBottom: 10, border: "1px solid #F0C8A0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Input placeholder="タスク名・作業内容 *" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />

            <select
              value={form.assignee}
              onChange={(e) => setForm({ ...form, assignee: e.target.value })}
              style={{
                padding: "9px 10px",
                border: "1px solid #E0DBD6",
                borderRadius: 8,
                fontSize: 13,
                outline: "none",
                background: "#fff",
                fontFamily: "inherit",
              }}
            >
              <option value="">担当者を選択</option>
              {STAFF.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 11, color: "#AAA" }}>期日</label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>

              <div>
                <label style={{ fontSize: 11, color: "#AAA" }}>状態</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "9px 10px",
                    border: "1px solid #E0DBD6",
                    borderRadius: 8,
                    fontSize: 13,
                    outline: "none",
                    background: "#fff",
                    fontFamily: "inherit",
                  }}
                >
                  {TASK_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <TextArea placeholder="指示・備考" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <Btn color="#AAA" onClick={() => setShowForm(false)}>
                キャンセル
              </Btn>
              <Btn color="#C06B3A" onClick={addTask} disabled={saving}>
                {saving ? "保存中..." : "追加する"}
              </Btn>
            </div>
          </div>
        </Card>
      )}

      {tasks.length === 0 ? (
        <Card style={{ textAlign: "center", color: "#CCC", padding: 30 }}>タスクがありません</Card>
      ) : (
        tasks.map((t) => {
          const a = STAFF.find((s) => s.id === t.assignee);
          const sc = STATUS_CHIP[t.status] || STATUS_CHIP["未着手"];

          return (
            <Card key={t.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#2C1F14", flex: 1, marginRight: 8 }}>{t.title}</div>

                <select
                  value={t.status}
                  onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                  style={{
                    padding: "2px 8px",
                    borderRadius: 10,
                    border: "none",
                    background: sc.bg,
                    color: sc.fg,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  {TASK_STATUS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {a && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
                  <Avatar staff={a} size={18} />
                  <span style={{ fontSize: 11, color: "#888" }}>{a.name}</span>
                </div>
              )}

              {t.dueDate && <div style={{ fontSize: 11, color: "#CCC" }}>期日: {t.dueDate}</div>}
              {t.note && <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{t.note}</div>}

              <button
                onClick={() => deleteTask(t.id)}
                style={{ marginTop: 6, color: "#DDD", background: "none", border: "none", fontSize: 11, cursor: "pointer", padding: 0 }}
              >
                削除
              </button>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ===== 工程 =====
function TaskTab({ tasks, projects, updateTaskStatus, user }) {
  const [filter, setFilter] = useState("all");
  const displayed = filter === "mine" ? tasks.filter((t) => t.assignee === user.id) : tasks;

  const byProj = {};
  displayed.forEach((t) => {
    const k = t.projectId || "_";
    if (!byProj[k]) byProj[k] = [];
    byProj[k].push(t);
  });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <PageTitle style={{ margin: 0 }}>工程・タスク管理</PageTitle>

        <div style={{ display: "flex", background: "#F0EDE9", borderRadius: 8, padding: 3, gap: 2 }}>
          {[
            ["all", "全員"],
            ["mine", "自分"],
          ].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              style={{
                padding: "4px 12px",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: filter === v ? 700 : 400,
                background: filter === v ? "#fff" : "transparent",
                color: filter === v ? "#C06B3A" : "#AAA",
                border: "none",
                cursor: "pointer",
              }}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {Object.keys(byProj).length === 0 ? (
        <Card style={{ textAlign: "center", color: "#CCC", padding: 40 }}>タスクがありません</Card>
      ) : (
        Object.entries(byProj).map(([pid, ptasks]) => {
          const proj = projects.find((p) => p.id === pid);

          return (
            <div key={pid} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "#C06B3A",
                  marginBottom: 6,
                  padding: "4px 0",
                  borderBottom: "2px solid #F0C8A0",
                }}
              >
                📋 {proj?.name || "案件未設定"}
              </div>

              {ptasks.map((t) => {
                const a = STAFF.find((s) => s.id === t.assignee);
                const sc = STATUS_CHIP[t.status] || STATUS_CHIP["未着手"];
                const isMe = t.assignee === user.id;

                return (
                  <Card key={t.id} style={{ marginBottom: 6, borderLeft: `3px solid ${isMe ? "#C06B3A" : "#E0DBD6"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: "#2C1F14" }}>{t.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
                          {a && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <Avatar staff={a} size={16} />
                              <span style={{ fontSize: 11, color: "#888" }}>{a.name}</span>
                            </div>
                          )}
                          {t.dueDate && <span style={{ fontSize: 10, color: "#CCC" }}>〆{t.dueDate}</span>}
                        </div>
                        {t.note && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{t.note}</div>}
                      </div>

                      <select
                        value={t.status}
                        onChange={(e) => updateTaskStatus(t.id, e.target.value)}
                        style={{
                          padding: "2px 8px",
                          borderRadius: 10,
                          border: "none",
                          background: sc.bg,
                          color: sc.fg,
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          marginLeft: 8,
                          flexShrink: 0,
                        }}
                      >
                        {TASK_STATUS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  </Card>
                );
              })}
            </div>
          );
        })
      )}
    </div>
  );
}

// ===== 連絡板 =====
function MsgTab({ messages, addMsg, deleteMsg, user }) {
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("");
  const [saving, setSaving] = useState(false);
  const bottomRef = useRef(null);

  const TAGS = ["連絡", "確認", "作業指示", "急ぎ"];

  const send = async () => {
    if (!body.trim()) return;

    setSaving(true);

    const msg = {
      id: uid(),
      from: user.id,
      body: body.trim(),
      tag,
      ts: new Date().toLocaleString("ja-JP", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    await addMsg(msg);
    setBody("");
    setTag("");
    setSaving(false);

    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  return (
    <div>
      <PageTitle>連絡板</PageTitle>

      <Card style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {TAGS.map((t) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? "" : t)}
              style={{
                padding: "3px 10px",
                borderRadius: 10,
                fontSize: 11,
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: tag === t ? "#C06B3A" : "#F0EDE9",
                color: tag === t ? "#fff" : "#888",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <TextArea placeholder="全員への連絡・共有事項を入力..." value={body} onChange={(e) => setBody(e.target.value)} rows={3} />

        <Btn color="#C06B3A" onClick={send} disabled={saving} style={{ marginTop: 8, width: "100%" }}>
          {saving ? "送信中..." : "送信する"}
        </Btn>
      </Card>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.length === 0 ? (
          <Card style={{ textAlign: "center", color: "#CCC", padding: 40 }}>連絡はありません</Card>
        ) : (
          messages.map((m) => {
            const sender = STAFF.find((s) => s.id === m.from);
            const isMe = m.from === user.id;

            const tagColors = {
              急ぎ: ["#FEE", "#C0392B"],
              作業指示: ["#E8F4FE", "#1A6BB5"],
              確認: ["#FFF8E1", "#B87A00"],
              連絡: ["#E6F4EC", "#2E7D52"],
            };

            const tc = tagColors[m.tag] || null;

            return (
              <Card key={m.id} style={{ borderLeft: isMe ? "3px solid #C06B3A" : "3px solid #E0DBD6" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Avatar staff={sender} size={28} />
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#2C1F14" }}>{sender?.name}</span>
                      <span style={{ fontSize: 11, color: "#CCC", marginLeft: 6 }}>{m.ts}</span>
                    </div>
                    {m.tag && tc && (
                      <div
                        style={{
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: tc[0],
                          color: tc[1],
                          fontSize: 10,
                          fontWeight: 700,
                        }}
                      >
                        {m.tag}
                      </div>
                    )}
                  </div>

                  {isMe && (
                    <button
                      onClick={() => deleteMsg(m.id)}
                      style={{ color: "#DDD", background: "none", border: "none", fontSize: 11, cursor: "pointer" }}
                    >
                      削除
                    </button>
                  )}
                </div>

                <div style={{ fontSize: 13, color: "#2C1F14", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.body}</div>
              </Card>
            );
          })
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}

// ===== 共通 =====
function Card({ children, style }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: 14,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        border: "1px solid #F0EDE9",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function PageTitle({ children, style }) {
  return (
    <div style={{ fontSize: 20, fontWeight: 700, color: "#2C1F14", marginBottom: 14, ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, style }) {
  return (
    <div
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "#888",
        marginBottom: 10,
        letterSpacing: 0.5,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Avatar({ staff, size = 32 }) {
  if (!staff) {
    return <div style={{ width: size, height: size, borderRadius: "50%", background: "#EEE", flexShrink: 0 }} />;
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: staff.color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: size * 0.38,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {staff.avatar}
    </div>
  );
}

function Chip({ status, type }) {
  const si = type === "att" ? ATT[status] : STATUS_CHIP[status];
  if (!si) return null;

  const label = type === "att" ? si.label : status;

  return (
    <div
      style={{
        padding: "3px 10px",
        borderRadius: 10,
        background: si.bg,
        color: si.fg,
        fontSize: 11,
        fontWeight: 600,
        display: "inline-block",
      }}
    >
      {label}
    </div>
  );
}

function Btn({ color, onClick, children, style, small, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#E0DBD6" : color,
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: small ? "6px 14px" : "10px 0",
        fontSize: small ? 12 : 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        width: small ? "auto" : "100%",
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function Input({ placeholder, value, onChange, type }) {
  return (
    <input
      type={type || "text"}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      style={{
        width: "100%",
        border: "1px solid #E0DBD6",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 13,
        outline: "none",
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    />
  );
}

function TextArea({ placeholder, value, onChange, rows }) {
  return (
    <textarea
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      rows={rows || 2}
      style={{
        width: "100%",
        border: "1px solid #E0DBD6",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 13,
        outline: "none",
        resize: "none",
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    />
  );
}

function Info({ label, val }) {
  return (
    <div>
      <span style={{ color: "#CCC", marginRight: 4 }}>{label}:</span>
      <span style={{ color: "#444" }}>{val}</span>
    </div>
  );
}