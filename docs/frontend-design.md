# Frontend Design — RTI V2

Tài liệu này mô tả kiến trúc, triết lý triển khai và các convention của frontend RTI V2. Mục tiêu: dev mới đọc xong có thể tự thêm tính năng mà không phá vỡ consistency.

---

## Mục lục

- [Tech Stack](#tech-stack)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Routing & Layout nesting](#routing--layout-nesting)
- [Triết lý triển khai](#triết-lý-triển-khai)
- [Hệ thống màu & styling](#hệ-thống-màu--styling)
- [Các pattern quan trọng](#các-pattern-quan-trọng)
- [Quy ước đặt tên](#quy-ước-đặt-tên)
- [Thêm tính năng mới](#thêm-tính-năng-mới)

---

## Tech Stack

| Thành phần | Công nghệ |
|-----------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 3 (utility-first, không có component library) |
| State | React hooks thuần (`useState`, `useRef`, `useEffect`, `useCallback`) |
| API | `fetch` native — không dùng axios, react-query, SWR |
| Font | Monospace (`JetBrains Mono`, `Cascadia Code`) |

Không có Redux, Zustand, hay bất kỳ global state manager nào. State được giữ local ở từng page.

---

## Cấu trúc thư mục

```
frontend/src/
├── app/                                  # Next.js App Router
│   ├── layout.tsx                        # Root HTML, lang="vi"
│   ├── page.tsx                          # Redirect → /workspaces
│   ├── globals.css                       # Tailwind base + custom scrollbar
│   └── (dashboard)/                      # Route group — chia sẻ Sidebar layout
│       ├── layout.tsx                    # Grid: Sidebar (trái) + main (phải)
│       ├── workspaces/
│       │   └── page.tsx                  # Quản lý workspace
│       └── workspace/[id]/               # Workspace context
│           ├── layout.tsx                # Header: breadcrumb + tab navigation
│           ├── page.tsx                  # Redirect → targets
│           ├── targets/
│           │   └── page.tsx
│           ├── findings/
│           │   └── page.tsx              # Vulnerability tracker (CRUD)
│           ├── jobs/
│           │   └── page.tsx
│           └── recon/
│               ├── page.tsx              # Redirect → subdomains
│               ├── subdomains/page.tsx
│               ├── ports/page.tsx
│               ├── web/page.tsx          # Web probe (SCAN_WEB_INFO)
│               └── crawler/page.tsx      # Web crawler (RECON_WEB_CRAWL, katana)
│
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx                   # Navigation cố định bên trái (có chấm màu)
│   │   └── SectionSubNav.tsx            # Sub-nav 2 tầng cho Recon + Fuzzing
│   ├── vuln/
│   │   ├── VulnSubNav.tsx               # Sub-nav 2 tầng cho Vuln Scan (tool bấm được)
│   │   ├── VulnModule.tsx               # Component dùng chung cho mọi trang Vuln
│   │   └── vulnConfig.ts                # Cấu hình tập trung module + tool
│   ├── workspace/
│   │   ├── WorkspaceCard.tsx
│   │   ├── WorkspaceForm.tsx
│   │   └── WorkspaceSwitcher.tsx
│   ├── target/
│   │   └── TargetForm.tsx
│   └── ui/
│       └── CopyButton.tsx                # Copy-to-clipboard (group-hover pattern)
│
├── hooks/
│   └── useJobPolling.ts                  # Hook dùng chung cho mọi job scan
│
└── lib/
    └── api.ts                            # API client + tất cả TypeScript interfaces
```

**Quy tắc:**
- `app/` — page và layout. Không đặt logic business ở đây nếu có thể tách ra.
- `components/` — component tái sử dụng được ở nhiều page.
- `hooks/` — custom hooks khi logic cần dùng lại ở ≥2 nơi.
- `lib/` — utilities, API client, type definitions.

---

## Routing & Layout nesting

Next.js App Router cho phép lồng layout. RTI V2 có 3 tầng:

```
RootLayout           app/layout.tsx
  └─ DashboardLayout  app/(dashboard)/layout.tsx   ← Sidebar
      └─ WorkspaceLayout  workspace/[id]/layout.tsx ← Header + tabs
          └─ Page content  targets/page.tsx, recon/subdomains/page.tsx...
```

**Route group `(dashboard)`:** dấu ngoặc không xuất hiện trong URL. Dùng để nhóm các route cùng chia sẻ một layout mà không ảnh hưởng path.

**Dynamic segment `[id]`:** workspace ID. Dùng `useParams<{ id: string }>()` để lấy trong client component.

**Redirect pages:** `page.tsx` trả về `<redirect>` khi route là container (ví dụ `/workspace/[id]` → `/workspace/[id]/targets`).

**Sub-navigation 2 tầng (chuẩn hoá):** Mỗi section (Recon, Fuzzing, Vuln Scan) dùng **một component sub-nav dùng chung** render 2 hàng: **hàng module** + **hàng tool**. Xem chi tiết ở [§ Nav 2 tầng](#pattern-9-sub-nav-2-tầng-module--tool). Trước đây mỗi recon page tự copy một `ReconSubNav` inline dùng `window.location.pathname` — đã gỡ bỏ vì (1) không reactive nên tab active không sáng, (2) lặp code.

---

## Triết lý triển khai

### 1. Client-first, không server component cho tính năng có state

Tất cả page tương tác đều có `'use client'` ở dòng đầu. RTI V2 không dùng Server Components cho business logic — đây là lựa chọn có chủ đích vì:
- Dữ liệu luôn cần fetch sau authentication (workspace-scoped)
- Realtime polling cần lifecycle hooks
- Form state, modal state, search/filter đều là client-side

Layout (`layout.tsx`) không cần `'use client'` — chỉ wrap UI.

### 2. State local tại page, không global

Mỗi page tự quản lý state của mình bằng `useState`. Không có context provider hay global store. Nếu hai page cần cùng data, cả hai tự fetch — không share state.

**Tại sao:** Workspace RTI là tool làm việc, không phải app consumer. Số lượng data mỗi page không lớn, latency fetch chấp nhận được. Global state chỉ thêm complexity mà không giải quyết vấn đề thực tế.

### 3. API layer tập trung trong `lib/api.ts`

Toàn bộ giao tiếp với backend đi qua `api.ts`. Page không tự viết `fetch`. Ý nghĩa:
- Đổi base URL → sửa 1 chỗ
- TypeScript interface cho mọi entity → compile-time safety
- Nếu muốn thêm auth header → sửa hàm `request()` là xong

### 4. Tái sử dụng qua hooks, không qua HOC hay render props

Khi logic cần dùng ở nhiều component, tách thành custom hook trong `hooks/`. Pattern HOC (Higher Order Component) không được dùng trong codebase này.

### 5. Component nhỏ, inline trong file page nếu chỉ dùng một lần

`JobBadge`, `AliveBadge`, `ServiceBadge`, `ScanModal`, `HistoryDrawer` — tất cả được định nghĩa **trong cùng file** với page dùng nó. Chỉ move ra `components/` khi cần tái sử dụng ở page khác.

**Ngoại lệ — sub-nav:** `SectionSubNav`/`VulnSubNav` đã được move ra `components/` vì dùng ở mọi page trong section. Bài học: component xuất hiện ở ≥2 page **phải** là shared — copy inline (như `ReconSubNav` cũ) dẫn tới drift và bug active-state.

---

## Hệ thống màu & styling

RTI V2 dùng dark theme nhất quán. Không dùng CSS variables — màu được inline trực tiếp dưới dạng Tailwind arbitrary values.

### Bảng màu nền

| Lớp | Hex | Dùng cho |
|-----|-----|----------|
| `bg-[#0f1117]` | Tối nhất | Page background |
| `bg-[#0d1117]` | — | Input, section nhỏ |
| `bg-[#141720]` | — | Card, panel, modal |
| `bg-[#1a1f2e]` | — | Hover state của row |
| `bg-[#1e2330]` | — | Border, divider |

### Bảng màu text

| Lớp | Dùng cho |
|-----|---------|
| `text-[#e2e8f0]` | Text chính |
| `text-[#718096]` | Text phụ |
| `text-[#4a5568]` | Text mờ (label, placeholder) |
| `text-[#2d3748]` | Rất mờ (hint, không quan trọng) |

### Màu trạng thái

| Trạng thái | Text | Background |
|-----------|------|-----------|
| Success / Alive / Completed | `text-[#68d391]` | `bg-[#1a2f1a]` |
| Info / Running | `text-[#4299e1]` | `bg-[#1a2434]` |
| Warning / Port number | `text-[#fbd38d]` | — |
| Error / Failed / Delete | `text-[#fc8181]` | `bg-[#2d1a1a]` |
| Accent / Active nav | `text-[#a78bfa]` | `bg-[#2d1f52]` |
| Dead / Muted | `text-[#4a5568]` | `bg-[#1a1f2e]` |

### Chấm màu navigation (dot)

Mọi nav (Sidebar, sub-nav module, hàng tool) gắn một chấm tròn 1.5px màu để phân loại trực quan. Bảng màu chuẩn dùng chung (`DOT_COLOR`):

```ts
const DOT_COLOR = {
  purple: '#805ad5', green: '#48bb78', blue: '#4299e1',
  orange: '#ed8936', red: '#fc8181', gray: '#4a5568',
}
```

Tab **active** luôn tô tím (`text-[#a78bfa] border-[#7c3aed]`) — không phụ thuộc màu chấm.

### Quy tắc styling

```tsx
// Card chuẩn
<div className="bg-[#141720] border border-[#1e2330] rounded-lg p-4">

// Button primary (action xanh)
<button className="px-3 py-1.5 bg-[#276749] hover:bg-[#2f855a] text-[#68d391] text-xs rounded font-medium transition-colors">

// Button secondary (neutral)
<button className="px-3 py-1.5 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-xs rounded transition-colors">

// Input
<input className="bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none focus:border-[#553c9a]" />

// Table row hover
<tr className="hover:bg-[#1a1f2e] transition-colors">
```

**Font monospace:** Tất cả domain, IP, port, service name dùng `font-mono`. Body font cũng là monospace (định nghĩa trong `globals.css`).

---

## Các pattern quan trọng

### Pattern 1: Cấu trúc một page

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { SomeEntity, someApi } from '@/lib/api'
import { useJobPolling } from '@/hooks/useJobPolling'

// ── Components nhỏ dùng trong page này ──────────
function SomeBadge({ value }: { value: string }) { ... }
function ScanModal({ onClose, onJobCreated }: ...) { ... }

// ── Main page ────────────────────────────────────
export default function SomePage() {
  const { id: wsid } = useParams<{ id: string }>()
  const [data,      setData]     = useState<SomeEntity[]>([])
  const [loading,   setLoading]  = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [search,    setSearch]   = useState('')

  const loadData = useCallback(async () => {
    const res = await someApi.list(wsid)
    setData(res.data ?? [])
  }, [wsid])

  const { activeJob, setActiveJob } = useJobPolling(wsid, 'JOB_TYPE', loadData)

  useEffect(() => {
    loadData().finally(() => setLoading(false))
  }, [wsid, loadData])

  return ( ... )
}
```

### Pattern 2: useJobPolling

**Cơ chế polling DUY NHẤT** cho mọi tính năng có background job (recon, fuzzing, **và vuln**).
KHÔNG tự viết `setInterval` riêng (xem `rules/frontend-polling.md`).

```tsx
const { activeJob, setActiveJob, elapsed } = useJobPolling(
  wsid,           // workspace ID
  'SCAN_PORT',    // job_type — phải khớp với backend
  loadPorts,      // onCompleted: () => void | Promise<void>  (sync/async đều được)
  3000,           // polling interval ms (default: 3000)
  {               // optional
    onProgress,   // (job) => void — gọi mỗi lần poll, để refresh kết quả realtime
    matchJob,     // (job) => boolean — lọc job khi restore (vd khớp payload.domains)
  },
)

// Khi user tạo job mới → set activeJob để hook bắt đầu poll
<ScanModal onJobCreated={job => setActiveJob(job)} />
```

- Hook tự **restore** khi navigate đi rồi quay lại (lọc thêm bằng `matchJob`).
- **`elapsed`** = thời gian chạy dạng **`HH:MM:SS`** (tick 1s, từ `started_at`→`finished_at`/now).
  Mọi banner phải hiển thị: `<span className="font-mono tabular-nums">{elapsed}</span>`.
- **`onProgress`** cho case cần refresh realtime trong khi chạy (vd `VulnModule` truyền `doFetch`
  để cập nhật findings mỗi 3s) — thay cho việc tự viết polling loop.

**Active job banner** — template chuẩn:

```tsx
{activeJob && (
  <div className={`mb-4 px-4 py-3 rounded-lg border text-xs flex items-center gap-3 ${
    activeJob.status === 'running'   ? 'border-[#2b4c7e] bg-[#0d1b2e] text-[#4299e1]'
    : activeJob.status === 'completed' ? 'border-[#276749] bg-[#0d1f12] text-[#68d391]'
    : activeJob.status === 'pending'   ? 'border-[#2d3748] bg-[#141720] text-[#718096]'
    : 'border-[#742a2a] bg-[#1a0d0d] text-[#fc8181]'
  }`}>
    <JobBadge status={activeJob.status} />
    <span className="flex-1">
      {activeJob.status === 'running'   && 'Đang chạy ..., vui lòng chờ...'}
      {activeJob.status === 'pending'   && 'Job đang chờ worker xử lý...'}
      {activeJob.status === 'completed' && `Hoàn thành — ...`}
      {activeJob.status === 'failed'    && `Lỗi: ${activeJob.error_message}`}
    </span>
    {(activeJob.status === 'completed' || activeJob.status === 'failed') && (
      <button onClick={() => setActiveJob(null)}>×</button>
    )}
  </div>
)}
```

### Pattern 3: Modal form

```tsx
// Trigger
{showModal && (
  <SomeModal
    wsid={wsid}
    onClose={() => setShowModal(false)}
    onSaved={(item) => {
      setData(prev => [item, ...prev])
      setShowModal(false)
    }}
  />
)}

// Modal component
function SomeModal({ onClose, onSaved }: Props) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-md">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between">
          <h2 className="font-semibold text-[#e2e8f0] text-sm">Tiêu đề modal</h2>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg">×</button>
        </div>
        <form className="p-4 space-y-4">
          ...
        </form>
      </div>
    </div>
  )
}
```

### Pattern 4: Toast notification

```tsx
const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

function showToast(msg: string, type: 'success' | 'error' = 'success') {
  setToast({ msg, type })
  setTimeout(() => setToast(null), 3000)
}

// JSX
{toast && (
  <div className={`fixed bottom-4 right-4 px-4 py-2 rounded text-sm z-50 ${
    toast.type === 'success' ? 'bg-[#276749] text-[#68d391]' : 'bg-[#742a2a] text-[#fc8181]'
  }`}>
    {toast.msg}
  </div>
)}
```

### Pattern 5: CopyButton — copy-to-clipboard inline

`CopyButton` là shared component ở `components/ui/CopyButton.tsx`. Dùng ở **mọi bảng** có domain, IP, URL cần copy.

**Cách dùng:**

```tsx
import { CopyButton } from '@/components/ui/CopyButton'

// Row phải có class "group" để trigger hover visibility
<tr className="group hover:bg-[#1a1f2e] transition-colors">
  <td>
    <div className="flex items-center gap-1 min-w-0">
      <span className="truncate font-mono" title={domain}>{domain}</span>
      <CopyButton value={domain} />
    </div>
  </td>
</tr>
```

**Behavior:**
- Mặc định `opacity-0` — ẩn; hiện khi hover row (`group-hover:opacity-100`)
- Click: copy `value` vào clipboard qua `navigator.clipboard.writeText()`
- 1.5s sau khi copy: icon clipboard đổi thành ✓ màu xanh (`text-[#68d391]`), sau đó reset
- `e.stopPropagation()` — ngăn click mở drawer/modal của row

**Host cell layout chuẩn** (tránh wrapping):

```tsx
<td className="px-4 py-2 w-44 max-w-[176px]">
  <div className="flex items-center gap-1 min-w-0">
    <span className="truncate font-mono text-xs flex-shrink text-[#e2e8f0]" title={host}>
      {host}
    </span>
    <CopyButton value={host} className="flex-shrink-0" />
  </div>
</td>
```

`flex-shrink-0` trên CopyButton đảm bảo nút không bị squeeze khi domain dài.

---

### Pattern 6: SourceBadge — phân loại nguồn gốc URL

Dùng trong **Web Crawler page** để hiển thị HTML tag / nguồn gốc của từng discovered URL.

```tsx
function SourceBadge({ tag, attr }: { tag: string | null; attr: string | null }) {
  if (!tag) return <span className="text-[#2d3748] text-[10px]">—</span>
  const map: Record<string, string> = {
    a:      'bg-[#1a2434] text-[#4299e1]',           // HTML link
    script: 'bg-[#2d2200] text-[#fbd38d]',           // <script src>
    form:   'bg-[#2d1a2d] text-[#d6bcfa]',           // <form action>
    link:   'bg-[#1a2f1a] text-[#68d391]',           // <link href> (CSS/rel)
    iframe: 'bg-[#2d1a1a] text-[#fc8181]',           // iframe src
    js:     'bg-[#1a2800] text-[#9ae600] border border-[#4a7c00]', // endpoint từ JS file (katana -jc)
    html:   'bg-[#1a2434] text-[#63b3ed]',           // HTML element khác
    header: 'bg-[#2d1f0e] text-[#f6ad55]',           // HTTP header
    file:   'bg-[#1a1f2e] text-[#a0aec0]',           // known file (robots.txt, sitemap)
    img:    'bg-[#2d1a2d] text-[#b794f4]',           // <img src>
  }
  const cls = map[tag] ?? 'bg-[#1a1f2e] text-[#718096]'
  const label = attr ? `${tag}[${attr}]` : tag
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${cls}`}>{label}</span>
  )
}
```

**Tag `js` (lime green, có border)** — nổi bật nhất vì đây là endpoint tìm được qua phân tích JS file (`katana -jc`), thường là API endpoint ẩn không có trong HTML.

**StatsBar clickable filter** — Web Crawler page có `StatsBar` hiển thị count theo từng source_tag. Click vào badge để filter table chỉ hiện loại đó.

---

### Pattern 7: Slide-in drawer (history)

Dùng khi muốn hiển thị lịch sử thu thập mà không rời khỏi page. Hiện tại được triển khai ở cả **Subdomains** và **Ports & Services**.

**Subdomains drawer** — trigger: click bất kỳ row domain:
- Gọi `subdomainApi.history(wsid, domain)` → trả về `Subdomain[]`
- Mỗi record = 1 snapshot riêng (append-only), hiển thị thẳng theo thứ tự thời gian
- Nội dung: timestamp, alive badge, IP addresses, sources, job ID

**Ports drawer** — trigger: chỉ click row đầu của một host (`isNewHost = true`):
- Gọi `portApi.history(wsid, host)` → trả về `Port[]`
- Group theo `job_id` để tạo "phiên scan": mỗi phiên gồm timestamp + danh sách port sorted by number
- Sub-rows `↳` (cùng host) không clickable — chỉ host row mới mở drawer

**Quy ước áp dụng cho entity mới** (Web Probe, CVE...):
- Thêm `history` endpoint vào api object trong `lib/api.ts`
- State: `const [selected, setSelected] = useState<string | null>(null)`
- Row: click → `setSelected(entity_key)`; group rows (nếu cần) chỉ clickable ở row đầu
- Group kết quả theo `job_id` nếu history trả về nhiều records/job

```tsx
{selected && (
  <SomeDrawer
    item={selected}
    onClose={() => setSelected(null)}
  />
)}

function SomeDrawer({ item, onClose }: Props) {
  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-[#0d1117] border-l border-[#1e2330] z-50 flex flex-col shadow-2xl">
        ...
      </div>
    </>
  )
}
```

### Pattern 8: API client

Không bao giờ gọi `fetch` trực tiếp trong page. Thêm method vào `lib/api.ts`:

```typescript
// 1. Thêm interface
export interface WebProbe {
  id: string
  host: string
  status_code: number
  title: string | null
  // ...
}

// 2. Thêm api object
export const webProbeApi = {
  list: (wsid: string) =>
    request<{ data: WebProbe[]; total: number }>(`/api/workspaces/${wsid}/web-probes`).then(r => r),
  history: (wsid: string, host: string) =>
    request<{ data: WebProbe[]; total: number }>(
      `/api/workspaces/${wsid}/web-probes/history?host=${encodeURIComponent(host)}`
    ).then(r => r),
}
```

### Pattern 9: Sub-nav 2–3 tầng (module → [module con] → tool)

Chuẩn hoá cho **mọi section có nhiều trang/tool** (Recon, Fuzzing, Vuln Scan). Cấu trúc gồm 2 hàng nằm ngay dưới tab cấp 1 (Targets/Recon/Fuzzing/Vuln Scan):

```
Hàng MODULE   ● Subdomains   ● Ports & Services   ● Web Probe  ...   ← bấm điều hướng
─────────────────────────────────────────────────────────────────
Hàng TOOL     Tools  ● naabu                                        ← tool của trang đang mở
```

**Nguyên tắc thiết kế:**
- Hàng module: chấm màu + label, active = tím. Active detect bằng `usePathname()` (KHÔNG dùng `window.location` — không reactive, hỏng khi SSR).
- Hàng tool **tách riêng** khỏi hàng module → thêm bao nhiêu tool cũng không làm chật hàng module (scale). Chỉ hiển thị tool của **trang/module đang mở**.
- Tool là **mảng** trong config → 1 trang nhiều tool vẫn gọn.

**Recon/Fuzzing** — `components/layout/SectionSubNav.tsx`, export `ReconSubNav`, `FuzzingSubNav`. Hàng tool chỉ hiển thị (mỗi trang 1 tool: subfinder/naabu/httpx/katana, arjun/ffuf).

**Vuln Scan** — `components/vuln/VulnSubNav.tsx`. Hàng tool **bấm được**: mỗi tool là `<Link href="?tool=key" scroll={false}>`, đổi query `?tool=` → `VulnModule` đọc `useSearchParams()` để chuyển bảng Output. Cấu hình module + tool tập trung ở `vulnConfig.ts`:

```ts
export const VULN_MODULES = [
  { seg: 'common', domain: 'common', title: 'Common', dot: 'blue',
    tools: [
      { key: 'nuclei',     label: 'Nuclei',     dot: 'blue',  source: 'nuclei'   },
      { key: 'testssl.sh', label: 'testssl.sh', dot: 'green', source: 'findings' },
    ] },
  // ...
]
```

`source: 'nuclei'` → đọc `/nuclei-findings`; mặc định `'findings'` → đọc `/vuln-findings?domain=&tool=`. Mỗi trang Vuln chỉ còn 1 dòng: `<VulnModule seg="common" />` — title/subtitle/tools/output đều suy ra từ config.

**Thêm module/tool Vuln mới:** chỉ sửa `vulnConfig.ts` (hàng nav + nội dung tự cập nhật) + tạo page 1 dòng. Worker phía sau phải có handler tương ứng `tool` + `domain`.

**Mở rộng 3 tầng (module con) — vd Cloud:** module khai báo `submodules` thay cho `tools`. VulnSubNav render thêm **hàng module con** (giữa hàng module và hàng tool); hàng tool hiển thị tool của module con đang chọn:

```
Hàng MODULE      ● Common  ● CMS  ● Cloud  ...           ← bấm điều hướng (full nav)
Hàng MODULE      ● Google Cloud                          ← module con (chỉ module 3 tầng)
Hàng COMPONENT   ● Overview  ● RTDB  ● Firestore  ...     ← tool của module con đang chọn
```

- `toolLabel?` trên module con → đổi nhãn hàng tool (Cloud dùng `Component` thay `Tools`).
- mỗi tool có thể đặt `overview: true` (tab mô tả thuần — ẩn nút Run + bảng findings) và `desc` (mô tả hiển thị ở tab Overview).

```ts
{ seg: 'cloud', domain: 'cloud', title: 'Cloud', dot: 'blue',
  submodules: [
    { key: 'firebase', label: 'Google Cloud', toolLabel: 'Component', dot: 'orange',
      tools: [
        { key: 'firebase-overview', label: 'Overview', overview: true, dot: 'purple' },
        { key: 'firebase-rtdb',     label: 'RTDB', desc: 'Realtime Database...', dot: 'red' },
        // firestore / storage / config (Remote Config) / functions ...
      ] },
  ] }
```

Helper trong `vulnConfig.ts`: `moduleTools(def)` (gộp tool từ submodules) + `submoduleOfTool(def, toolKey)` (suy module con active từ `?tool=`). Worker: mỗi `firebase-*` map sang flag OpenFirebase `--read-*` (xem `docs/vuln-scan-design.md` § Firebase Integration).

---

## Quy ước đặt tên

### Files

| Loại | Convention | Ví dụ |
|------|-----------|-------|
| Page | `page.tsx` (Next.js convention) | `subdomains/page.tsx` |
| Layout | `layout.tsx` | `workspace/[id]/layout.tsx` |
| Shared component | PascalCase | `WorkspaceCard.tsx` |
| Hook | camelCase bắt đầu `use` | `useJobPolling.ts` |
| Utility | camelCase | `api.ts` |

### Variables trong component

```typescript
// State: [noun, setNoun]
const [ports,     setPorts]     = useState<Port[]>([])
const [loading,   setLoading]   = useState(true)
const [showModal, setShowModal] = useState(false)
const [activeJob, setActiveJob] = useState<Job | null>(null)
const [search,    setSearch]    = useState('')
const [selected,  setSelected]  = useState<Port | null>(null)

// Load functions: loadNoun (async, camelCase)
const loadPorts = useCallback(async () => { ... }, [wsid])

// Event handlers: handleVerb hoặc handleNounVerb
async function handleSubmit(e: React.FormEvent) { ... }
async function handleDelete(target: Target) { ... }
function handleSaved(item: Port) { ... }

// Constants (module-level): SCREAMING_SNAKE_CASE
const SVC_COLORS: Record<string, string> = { ... }
const TOP_PORT_OPTIONS = [ ... ]
```

### Props interfaces

```typescript
// Component nhỏ — Props inline hoặc interface Props
interface Props {
  wsid: string
  onClose: () => void
  onJobCreated: (job: Job) => void
}

// Component có nhiều mode — union type
type TargetFormProps =
  | { mode: 'single'; target?: Target; wsid: string; onSaved: (t: Target) => void; onClose: () => void }
  | { mode: 'bulk';   wsid: string; onSaved: () => void; onClose: () => void }
```

---

## Thêm tính năng mới

### Template: Thêm page mới với background job

**Bước 1:** Thêm interface và api vào `lib/api.ts`

```typescript
export interface SomeEntity {
  id: string
  workspace_id: string
  // ... fields
}

export const someApi = {
  list: (wsid: string) =>
    request<{ data: SomeEntity[]; total: number }>(`/api/workspaces/${wsid}/some-entities`).then(r => r),
  history: (wsid: string, key: string) =>
    request<{ data: SomeEntity[] }>(
      `/api/workspaces/${wsid}/some-entities/history?key=${encodeURIComponent(key)}`
    ).then(r => r),
}
```

**Bước 2:** Tạo page theo template chuẩn (xem Pattern 1 ở trên)

```tsx
'use client'
import { useJobPolling } from '@/hooks/useJobPolling'
import { CopyButton } from '@/components/ui/CopyButton'  // nếu có domain/IP/URL

export default function SomePage() {
  const { activeJob, setActiveJob } = useJobPolling(wsid, 'SOME_JOB_TYPE', loadData)
  // ...
}
```

**Bước 3 (nếu là trang trong section có sub-nav):** Thêm item vào component sub-nav dùng chung — **không** copy nav inline.
- Recon/Fuzzing → thêm vào mảng items trong `components/layout/SectionSubNav.tsx`:
  ```tsx
  { seg: 'some', label: 'Some Tab', dot: 'blue', tools: [{ name: 'tool-x', dot: 'blue' }] }
  ```
- Vuln Scan → thêm vào `VULN_MODULES` trong `components/vuln/vulnConfig.ts`; page chỉ cần `<VulnModule seg="some" />`.

**Bước 4:** Đảm bảo backend route và worker đã có.

---

### Findings page — thiết kế

Findings page (`workspace/[id]/findings/page.tsx`) là module tracker lỗ hổng bảo mật thủ công và tự động.

**Components inline:**
- `SeverityBadge` — color-coded chip: critical (đỏ tươi) / high (cam) / medium (vàng) / low (xanh lá) / info (xám)
- `StatusBadge` — open / confirmed / false_positive / fixed
- `StatsBar` — 5 ô thống kê severity, click để filter; highlight màu khi active
- `FindingModal` — form tạo/sửa finding. Fields: title, severity, type, status, CVE ID, CVSS, host, URL, port, evidence, source, remediation
- `DetailDrawer` — slide-in từ phải, view full detail, quick status change, edit/delete

**Filter bar:** severity + type + status — filter độc lập, kết hợp được.

**Severity sort:** critical → high → medium → low → info (được thực hiện ở repository layer, không phải frontend).

---

### Những điều KHÔNG nên làm

- **Không** import `axios`, `react-query`, `zustand` — không có trong project
- **Không** fetch trong `useEffect` mà bỏ qua error handling
- **Không** tự viết polling loop — dùng `useJobPolling`
- **Không** hardcode workspace ID hay job type ở nhiều chỗ
- **Không** thêm màu mới không có trong bảng màu ở trên — dùng màu đã có
- **Không** tạo component mới trong `components/` nếu chỉ dùng ở 1 page — giữ inline
- **Không** dùng `any` cho type của API response — extend interface trong `api.ts`
- **Không** copy sub-nav inline vào từng page — dùng `SectionSubNav`/`VulnSubNav` dùng chung
- **Không** detect tab active bằng `window.location` — dùng `usePathname()` (reactive)
