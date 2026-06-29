// Cấu hình tập trung cho các module Vuln Scan.
// Module có thể 2 tầng (module → tool) qua `tools`,
// hoặc 3 tầng (module → module con → tool) qua `submodules` (vd: Cloud → Nuclei/Firebase → checks).
// Dùng chung bởi VulnSubNav (hàng module + [module con] + tool) và VulnModule (nội dung).

export interface VulnToolDef {
  key:       string                // source_tool + giá trị payload tools
  label:     string
  dot:       string
  source?:   'nuclei' | 'findings' // bảng output; mặc định 'findings'
  desc?:     string                // mô tả component (hiện ở tab Overview)
  overview?: boolean               // true = tab Overview (mô tả, không scan/không findings)
}

export interface VulnSubmoduleDef {
  key:        string               // 'firebase'
  label:      string
  dot:        string
  toolLabel?: string               // nhãn hàng tool (mặc định 'Tools'); vd 'Component'
  tools:      VulnToolDef[]
}

export interface VulnModuleDef {
  seg:         string              // segment sau /vuln/ ('common','cloud'...)
  domain:      string              // dispatch domain
  title:       string
  subtitle:    string
  dot:         string
  tools?:      VulnToolDef[]        // 2 tầng
  submodules?: VulnSubmoduleDef[]   // 3 tầng (module con)
}

export const VULN_MODULES: VulnModuleDef[] = [
  {
    seg: 'common', domain: 'common', title: 'Common', dot: 'blue',
    subtitle: 'Nuclei · testssl.sh — chọn tool để chạy & xem kết quả',
    tools: [
      { key: 'nuclei',     label: 'Nuclei',     dot: 'blue',  source: 'nuclei'   },
      { key: 'testssl.sh', label: 'testssl.sh', dot: 'green', source: 'findings' },
    ],
  },
  {
    seg: 'cms', domain: 'cms', title: 'CMS', dot: 'green',
    subtitle: 'WPScan · JoomScan · Droopescan — detect tự động từ tech stack',
    tools: [
      { key: 'wpscan',     label: 'WPScan',     dot: 'green'  },
      { key: 'joomscan',   label: 'JoomScan',   dot: 'orange' },
      { key: 'droopescan', label: 'Droopescan', dot: 'blue'   },
    ],
  },
  {
    seg: 'software', domain: 'software', title: 'Software', dot: 'orange',
    subtitle: 'Nuclei templates — GitLab · Jenkins · Confluence · Grafana · Tomcat · Spring Boot',
    tools: [{ key: 'nuclei', label: 'Nuclei', dot: 'blue' }],
  },
  {
    seg: 'cloud', domain: 'cloud', title: 'Cloud', dot: 'blue',
    subtitle: 'Firebase BaaS misconfig — RTDB · Firestore · Storage · Remote Config · Functions (OpenFirebase, read-only)',
    submodules: [
      {
        key: 'firebase', label: 'Google Cloud', dot: 'orange', toolLabel: 'Component',
        tools: [
          { key: 'firebase-overview',  label: 'Overview', dot: 'purple', overview: true },
          { key: 'firebase-rtdb',      label: 'RTDB',          dot: 'red',
            desc: 'Realtime Database — CSDL NoSQL dạng cây JSON, đồng bộ realtime. Check: đọc /.json không cần auth → lộ toàn bộ DB.' },
          { key: 'firebase-firestore', label: 'Firestore',     dot: 'orange',
            desc: 'Cloud Firestore — CSDL NoSQL dạng document/collection (đời mới, phổ biến hơn). Check: đọc collection qua REST không cần auth.' },
          { key: 'firebase-storage',   label: 'Storage',       dot: 'green',
            desc: 'Cloud Storage — kho lưu file (ảnh/video/tài liệu). Check: liệt kê/đọc object trong bucket không cần auth.' },
          { key: 'firebase-config',    label: 'Remote Config', dot: 'blue',
            desc: 'Remote Config — cấu hình/feature-flag tải về app, đôi khi lộ API key/URL nội bộ. Check: fetch template config không cần auth.' },
          { key: 'firebase-functions', label: 'Functions',     dot: 'purple',
            desc: 'Cloud Functions — hàm backend serverless chạy trên hạ tầng Google. Check: dò function gọi được unauth (quét nhiều region).' },
        ],
      },
    ],
  },
  {
    seg: 'discovery', domain: 'discovery', title: 'Discovery', dot: 'purple',
    subtitle: 'Nuclei (.git/.env exposure) · Corsy (CORS misconfig)',
    tools: [
      { key: 'nuclei', label: 'Nuclei (Git/Env)', dot: 'blue'   },
      { key: 'corsy',  label: 'Corsy (CORS)',     dot: 'orange' },
    ],
  },
  {
    seg: 'network', domain: 'network_service', title: 'Network Service', dot: 'red',
    subtitle: 'Nuclei templates — Redis · MySQL · MongoDB · Elasticsearch',
    tools: [{ key: 'nuclei', label: 'Nuclei', dot: 'blue' }],
  },
  {
    seg: 'web-params', domain: 'web_params', title: 'Web Params', dot: 'orange',
    subtitle: 'SQLMap (SQLi) · Dalfox (XSS) — chạy trên fuzz params',
    tools: [
      { key: 'sqlmap', label: 'SQLMap', dot: 'red'    },
      { key: 'dalfox', label: 'Dalfox', dot: 'orange' },
    ],
  },
]

export function findVulnModule(seg: string): VulnModuleDef | undefined {
  return VULN_MODULES.find(m => m.seg === seg)
}

/** Tất cả tool của 1 module (gộp từ submodules nếu là 3 tầng). */
export function moduleTools(def: VulnModuleDef): VulnToolDef[] {
  if (def.submodules) return def.submodules.flatMap(s => s.tools)
  return def.tools ?? []
}

/** Module con chứa tool có key cho trước (chỉ với module 3 tầng). */
export function submoduleOfTool(def: VulnModuleDef, toolKey: string): VulnSubmoduleDef | undefined {
  return def.submodules?.find(s => s.tools.some(t => t.key === toolKey))
}
