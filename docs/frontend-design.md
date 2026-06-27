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
│           └── recon/
│               ├── page.tsx              # Redirect → subdomains
│               ├── subdomains/page.tsx
│               ├── ports/page.tsx
│               └── web/page.tsx          # Placeholder
│
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx                   # Navigation cố định bên trái
│   ├── workspace/
│   │   ├── WorkspaceCard.tsx
│   │   ├── WorkspaceForm.tsx
│   │   └── WorkspaceSwitcher.tsx
│   ├── target/
│   │   └── TargetForm.tsx
│   └── ui/                               # Dành cho shared UI components (Button, Badge...)
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

**Sub-navigation trong Recon:** Mỗi recon page tự render `<ReconSubNav>` — một component local định nghĩa ngay trong file page đó, không phải shared component. Lý do: mỗi section có thể cần sub-nav khác nhau sau này.

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

`JobBadge`, `AliveBadge`, `ServiceBadge`, `ReconSubNav`, `ScanModal`, `HistoryDrawer` — tất cả được định nghĩa **trong cùng file** với page dùng nó. Chỉ move ra `components/` khi cần tái sử dụng ở page khác.

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

Dùng cho **mọi** tính năng có background job (subdomain scan, port scan, web probe, CVE scan...).

```tsx
const { activeJob, setActiveJob } = useJobPolling(
  wsid,           // workspace ID
  'SCAN_PORT',    // job_type — phải khớp với backend
  loadPorts,      // callback gọi khi job completed
  3000,           // polling interval ms (default: 3000)
)

// Khi user tạo job mới → set activeJob để hook bắt đầu poll
<ScanModal onJobCreated={job => setActiveJob(job)} />
```

Hook tự động restore khi user navigate đi rồi quay lại — không cần thêm code ở page.

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

### Pattern 5: Slide-in drawer (history)

Dùng khi muốn hiển thị chi tiết/lịch sử mà không rời khỏi page:

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

### Pattern 6: API client

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

### Ví dụ: Thêm "Web Probe" page

**Bước 1:** Thêm interface và api vào `lib/api.ts`

```typescript
export interface WebProbe { ... }
export const webProbeApi = { list, history }
```

**Bước 2:** Tạo `recon/web/page.tsx` theo template page chuẩn

```tsx
'use client'
import { useJobPolling } from '@/hooks/useJobPolling'
// ...

export default function WebProbePage() {
  const { activeJob, setActiveJob } = useJobPolling(wsid, 'SCAN_WEB_INFO', loadData)
  // ...
}
```

**Bước 3:** Thêm link vào `ReconSubNav` trong cả `subdomains/page.tsx` và `ports/page.tsx`

```tsx
{ href: `/workspace/${wsid}/recon/web`, label: 'Web Probe' },
```

**Bước 4:** Thêm job type `SCAN_WEB_INFO` vào worker Python và backend route.

---

### Những điều KHÔNG nên làm

- **Không** import `axios`, `react-query`, `zustand` — không có trong project
- **Không** fetch trong `useEffect` mà bỏ qua error handling
- **Không** tự viết polling loop — dùng `useJobPolling`
- **Không** hardcode workspace ID hay job type ở nhiều chỗ
- **Không** thêm màu mới không có trong bảng màu ở trên — dùng màu đã có
- **Không** tạo component mới trong `components/` nếu chỉ dùng ở 1 page — giữ inline
- **Không** dùng `any` cho type của API response — extend interface trong `api.ts`
