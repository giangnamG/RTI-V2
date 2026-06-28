// Cấu hình tập trung cho các module Vuln Scan + tool của từng module.
// Dùng chung bởi VulnSubNav (hàng module + hàng tool) và VulnModule (nội dung).

export interface VulnToolDef {
  key:     string                  // source_tool + giá trị payload tools
  label:   string
  dot:     string
  source?: 'nuclei' | 'findings'   // bảng output; mặc định 'findings'
}

export interface VulnModuleDef {
  seg:      string                 // segment sau /vuln/ ('common','cms'...)
  domain:   string                 // dispatch domain
  title:    string
  subtitle: string
  dot:      string
  tools:    VulnToolDef[]
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
    subtitle: 'Nuclei templates — AWS · GCP · Azure · Subdomain Takeover',
    tools: [{ key: 'nuclei', label: 'Nuclei', dot: 'blue' }],
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
