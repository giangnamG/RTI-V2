# Rule nền: Frontend Navigation (nav nhiều tầng + breadcrumb)

Quy tắc điều hướng dùng chung cho mọi section. Chi tiết bố cục + code: `docs/frontend-design.md`
Pattern 9–10. Đây là phần **bắt buộc tuân thủ**.

## N1 — Một component sub-nav dùng chung, KHÔNG copy inline

- Recon/Fuzzing → `components/layout/SectionSubNav.tsx`; Vuln → `components/vuln/VulnSubNav.tsx`.
- Active tab detect bằng `usePathname()` — **KHÔNG** dùng `window.location` (không reactive).
- Cấu hình module/tool tập trung ở `vulnConfig.ts` (Vuln). Thêm module/tool = sửa config, không sửa nav.

## N2 — Nav 2–3 tầng

- 2 tầng: **module → tool**. 3 tầng (vd Cloud): **module → module con → component** (`submodules` trong config).
- Hàng tool tách riêng khỏi hàng module để scale (thêm tool không làm chật hàng module).

## N3 — Breadcrumb động, suy từ URL (không hardcode)

`workspace/[id]/layout.tsx` dựng breadcrumb từ `pathname` + `useSearchParams('tool')`:

```
Workspaces › {ws} › {module} › {module con}   (tab vuln, 3 tầng)
Workspaces › {ws} › {module}                  (tab vuln, 2 tầng)
Workspaces › {ws} › {Tab}                      (tab khác)
```

- Tab vuln: tái dùng `findVulnModule` / `submoduleOfTool` của `vulnConfig.ts` — **một nguồn sự thật**
  cho cả nav lẫn breadcrumb. Crumb cuối tô tím, crumb trước là link xám.

## N4 — KHÔNG render lại tên module/submodule ở thân trang

Tên module + module con đã ở breadcrumb (N3) và hàng nav (N1). `VulnModule` **không** render header
title/subtitle — render lại là trùng lặp. (`subtitle` vẫn giữ trong `vulnConfig.ts` làm metadata,
không hiển thị.)
