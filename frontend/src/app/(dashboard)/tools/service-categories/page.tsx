'use client'

import { useEffect, useState } from 'react'
import { ServiceCategory, categoryApi } from '@/lib/api'

// ── Known module types ────────────────────────────────────
const KNOWN_MODULES = [
  { value: 'SCAN_WEB_INFO', label: 'Web Probe (httpx)' },
  { value: 'FUZZ_DIR',      label: 'Fuzzing — Directory' },
  { value: 'FUZZ_API',      label: 'Fuzzing — API' },
  { value: 'FUZZ_VHOST',    label: 'Fuzzing — VHost' },
  { value: 'PENTEST_WEB',   label: 'Pentest Web Module' },
  { value: 'PENTEST_NETWORK',  label: 'Pentest Network Module' },
  { value: 'PENTEST_DATABASE', label: 'Pentest Database Module' },
  { value: 'PENTEST_MAIL',     label: 'Pentest Mail Module' },
]

const PRESET_COLORS = [
  '#4299e1', '#48bb78', '#68d391', '#b794f4',
  '#fc8181', '#fbd38d', '#f6ad55', '#4fd1c5',
  '#718096', '#ed64a6', '#76e4f7', '#9ae6b4',
]

// ── Tag input ─────────────────────────────────────────────
function TagInput({
  tags, onChange, placeholder,
}: { tags: string[]; onChange: (t: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')

  function addTag(val: string) {
    const trimmed = val.trim().toLowerCase()
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed])
    }
    setInput('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap gap-1 bg-[#0d1117] border border-[#2d3748] rounded px-2 py-1.5 min-h-[36px] focus-within:border-[#553c9a]">
      {tags.map(tag => (
        <span key={tag} className="flex items-center gap-1 px-1.5 py-0.5 bg-[#1a1f2e] text-[#a78bfa] text-[10px] rounded font-mono">
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter(t => t !== tag))}
            className="text-[#4a5568] hover:text-[#fc8181] leading-none"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-xs text-[#e2e8f0] placeholder-[#4a5568] focus:outline-none"
      />
    </div>
  )
}

// ── Category modal ────────────────────────────────────────
function CategoryModal({
  initial,
  onSave,
  onClose,
}: {
  initial?: ServiceCategory
  onSave: (data: Omit<ServiceCategory, 'id' | 'created_at' | 'updated_at'>) => Promise<void>
  onClose: () => void
}) {
  const [name,         setName]         = useState(initial?.name         ?? '')
  const [label,        setLabel]        = useState(initial?.label        ?? '')
  const [description,  setDescription]  = useState(initial?.description  ?? '')
  const [color,        setColor]        = useState(initial?.color        ?? '#718096')
  const [serviceNames, setServiceNames] = useState<string[]>(initial?.service_names ?? [])
  const [moduleTypes,  setModuleTypes]  = useState<string[]>(initial?.module_types  ?? [])
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState('')

  const isEdit = !!initial

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !label.trim()) { setError('Name và Label bắt buộc'); return }
    setSaving(true); setError('')
    try {
      await onSave({ name: name.trim(), label: label.trim(), description, color, service_names: serviceNames, module_types: moduleTypes })
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleModule(mod: string) {
    setModuleTypes(prev =>
      prev.includes(mod) ? prev.filter(m => m !== mod) : [...prev, mod]
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#141720] border border-[#1e2330] rounded-lg w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b border-[#1e2330] flex items-center justify-between sticky top-0 bg-[#141720]">
          <h2 className="font-semibold text-[#e2e8f0] text-sm">
            {isEdit ? 'Sửa category' : 'Thêm category mới'}
          </h2>
          <button onClick={onClose} className="text-[#4a5568] hover:text-[#e2e8f0] text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Name + Label */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">
                Name <span className="text-[#4a5568]">(slug, không dấu)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value.toLowerCase().replace(/\s/g, '-'))}
                placeholder="web"
                disabled={isEdit}
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] font-mono placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a] disabled:opacity-40"
              />
            </div>
            <div>
              <label className="block text-xs text-[#718096] mb-1.5">Label</label>
              <input
                type="text"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder="Web Services"
                className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Mô tả</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Mô tả ngắn về category này..."
              className="w-full bg-[#0d1117] border border-[#2d3748] rounded px-3 py-2 text-sm text-[#e2e8f0] placeholder-[#2d3748] focus:outline-none focus:border-[#553c9a]"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">Màu sắc</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={e => setColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer bg-transparent border border-[#2d3748]"
                title="Chọn màu tùy chỉnh"
              />
              <span className="text-[10px] font-mono text-[#718096]">{color}</span>
            </div>
          </div>

          {/* Service names */}
          <div>
            <label className="block text-xs text-[#718096] mb-1.5">
              Service Names <span className="text-[#4a5568]">(Enter hoặc , để thêm)</span>
            </label>
            <TagInput
              tags={serviceNames}
              onChange={setServiceNames}
              placeholder="http, https, ssh..."
            />
            <p className="text-[10px] text-[#2d3748] mt-1">
              Tên service từ nmap/naabu output — dùng để tự động gán category khi scan
            </p>
          </div>

          {/* Modules */}
          <div>
            <label className="block text-xs text-[#718096] mb-2">
              Modules sử dụng category này
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {KNOWN_MODULES.map(m => (
                <label
                  key={m.value}
                  className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer transition-colors ${
                    moduleTypes.includes(m.value)
                      ? 'border-[#553c9a] bg-[#2d1f52]/30 text-[#b794f4]'
                      : 'border-[#1e2330] text-[#4a5568] hover:border-[#2d3748] hover:text-[#718096]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={moduleTypes.includes(m.value)}
                    onChange={() => toggleModule(m.value)}
                    className="hidden"
                  />
                  <span className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 ${
                    moduleTypes.includes(m.value) ? 'bg-[#553c9a] border-[#553c9a]' : 'border-[#4a5568]'
                  }`}>
                    {moduleTypes.includes(m.value) && <span className="text-white text-[8px] leading-none">✓</span>}
                  </span>
                  <span className="text-[10px]">{m.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-[#fc8181]">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e9d8fd] text-sm rounded font-medium transition-colors disabled:opacity-40"
            >
              {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo category'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] text-sm rounded transition-colors"
            >
              Huỷ
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────
export default function ServiceCategoriesPage() {
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [editing,    setEditing]    = useState<ServiceCategory | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)

  async function loadCategories() {
    const res = await categoryApi.list()
    setCategories(res.data ?? [])
  }

  useEffect(() => {
    loadCategories().finally(() => setLoading(false))
  }, [])

  async function handleCreate(data: Omit<ServiceCategory, 'id' | 'created_at' | 'updated_at'>) {
    await categoryApi.create(data)
    await loadCategories()
  }

  async function handleUpdate(data: Omit<ServiceCategory, 'id' | 'created_at' | 'updated_at'>) {
    if (!editing) return
    await categoryApi.update(editing.id, data)
    await loadCategories()
    setEditing(null)
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await categoryApi.delete(id)
      setCategories(prev => prev.filter(c => c.id !== id))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 max-w-5xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold text-[#e2e8f0]">Service Categories</h2>
            <p className="text-[11px] text-[#4a5568] mt-0.5">
              Quản lý toàn cục — áp dụng cho tất cả workspace · Dùng để phân loại service và điều phối module
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="px-3 py-1.5 bg-[#553c9a] hover:bg-[#6b46c1] text-[#e9d8fd] text-xs rounded font-medium transition-colors"
          >
            + Thêm category
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-xs text-[#4a5568]">Đang tải...</div>
        ) : (
          <div className="space-y-3">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="bg-[#141720] border border-[#1e2330] rounded-lg p-4 hover:border-[#2d3748] transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Left: color + name + description */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: cat.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-[#e2e8f0]">{cat.label}</span>
                        <span className="text-[10px] font-mono text-[#4a5568] bg-[#0d1117] px-1.5 py-0.5 rounded">{cat.name}</span>
                      </div>
                      {cat.description && (
                        <p className="text-[11px] text-[#4a5568] mb-2">{cat.description}</p>
                      )}

                      {/* Service names */}
                      {cat.service_names.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {cat.service_names.map(s => (
                            <span key={s} className="px-1.5 py-0.5 bg-[#0d1117] text-[#718096] text-[10px] rounded font-mono border border-[#1e2330]">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Modules */}
                      {cat.module_types.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {cat.module_types.map(m => {
                            const mod = KNOWN_MODULES.find(km => km.value === m)
                            return (
                              <span key={m} className="px-1.5 py-0.5 bg-[#2d1f52]/30 text-[#b794f4] text-[10px] rounded border border-[#553c9a]/30">
                                {mod?.label ?? m}
                              </span>
                            )
                          })}
                        </div>
                      )}

                      {cat.service_names.length === 0 && cat.module_types.length === 0 && (
                        <p className="text-[10px] text-[#2d3748]">Chưa có service names hay modules</p>
                      )}
                    </div>
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setEditing(cat)}
                      className="px-2 py-1 border border-[#2d3748] text-[#718096] hover:text-[#e2e8f0] hover:border-[#4a5568] text-[11px] rounded transition-colors"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id)}
                      disabled={deleting === cat.id}
                      className="px-2 py-1 border border-[#742a2a] text-[#fc8181] hover:bg-[#742a2a]/20 text-[11px] rounded transition-colors disabled:opacity-40"
                    >
                      {deleting === cat.id ? '...' : 'Xoá'}
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {categories.length === 0 && (
              <div className="text-center py-16 text-xs text-[#4a5568]">
                Chưa có category nào. Nhấn &quot;+ Thêm category&quot; để bắt đầu.
              </div>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <CategoryModal
          onSave={handleCreate}
          onClose={() => setShowModal(false)}
        />
      )}

      {editing && (
        <CategoryModal
          initial={editing}
          onSave={handleUpdate}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
