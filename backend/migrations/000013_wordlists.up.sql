CREATE TABLE IF NOT EXISTS wordlists (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    category     TEXT NOT NULL,
    -- directories | files | parameters | subdomains | passwords | fuzzing | custom
    path         TEXT NOT NULL,
    -- đường dẫn tuyệt đối trong container: /app/wordlists/...
    line_count   INTEGER,
    file_size_kb INTEGER,
    is_builtin   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(path)
);

CREATE INDEX IF NOT EXISTS idx_wordlists_category ON wordlists(category);

-- ── Built-in wordlist (luôn có sẵn trong image) ───────────────
INSERT INTO wordlists (name, description, category, path, line_count, is_builtin) VALUES
('common', 'RTI built-in: admin, api, config, backup paths', 'directories', '/app/wordlists/common.txt', 386, true)
ON CONFLICT (path) DO NOTHING;

-- ── SecLists — Discovery/Web-Content ─────────────────────────
-- Các file này có sẵn sau khi chạy lệnh download SecLists
INSERT INTO wordlists (name, description, category, path, line_count, is_builtin) VALUES
('seclists-common',
 'SecLists: Web-Content/common.txt — general web paths',
 'directories', '/app/wordlists/seclists/Discovery/Web-Content/common.txt', 4727, false),

('seclists-big',
 'SecLists: Web-Content/big.txt — extended web paths',
 'directories', '/app/wordlists/seclists/Discovery/Web-Content/big.txt', 20479, false),

('raft-medium-dirs',
 'SecLists: raft-medium-directories.txt — RAFT medium directory list',
 'directories', '/app/wordlists/seclists/Discovery/Web-Content/raft-medium-directories.txt', 30000, false),

('raft-large-dirs',
 'SecLists: raft-large-directories.txt — RAFT large directory list',
 'directories', '/app/wordlists/seclists/Discovery/Web-Content/raft-large-directories.txt', 62284, false),

('directory-2.3-medium',
 'SecLists: directory-list-2.3-medium.txt — dirbuster medium list',
 'directories', '/app/wordlists/seclists/Discovery/Web-Content/directory-list-2.3-medium.txt', 220560, false),

('dirsearch',
 'SecLists: dirsearch.txt — dirsearch default wordlist',
 'directories', '/app/wordlists/seclists/Discovery/Web-Content/dirsearch.txt', 9800, false),

-- ── SecLists — Parameters ─────────────────────────────────────
('burp-params',
 'SecLists: burp-parameter-names.txt — common HTTP parameter names',
 'parameters', '/app/wordlists/seclists/Discovery/Web-Content/burp-parameter-names.txt', 6453, false),

('api-seen-in-wild',
 'SecLists: api/api-seen-in-the-wild.txt — real-world API endpoints',
 'parameters', '/app/wordlists/seclists/Discovery/Web-Content/api/api-seen-in-the-wild.txt', 18175, false),

-- ── SecLists — Subdomains ─────────────────────────────────────
('subdomains-5k',
 'SecLists: subdomains-top1million-5000.txt — top 5k subdomains',
 'subdomains', '/app/wordlists/seclists/Discovery/DNS/subdomains-top1million-5000.txt', 5000, false),

('subdomains-20k',
 'SecLists: subdomains-top1million-20000.txt — top 20k subdomains',
 'subdomains', '/app/wordlists/seclists/Discovery/DNS/subdomains-top1million-20000.txt', 20000, false),

('subdomains-110k',
 'SecLists: subdomains-top1million-110000.txt — top 110k subdomains',
 'subdomains', '/app/wordlists/seclists/Discovery/DNS/subdomains-top1million-110000.txt', 114441, false),

-- ── SecLists — Passwords ──────────────────────────────────────
('rockyou',
 'RockYou leaked password list — 14M passwords',
 'passwords', '/app/wordlists/seclists/Passwords/Leaked-Databases/rockyou.txt', 14344391, false),

('common-passwords',
 'SecLists: 100k-most-used-passwords-NCSC.txt',
 'passwords', '/app/wordlists/seclists/Passwords/Common-Credentials/100k-most-used-passwords-NCSC.txt', 100000, false),

('default-passwords',
 'SecLists: default-passwords.csv — vendor default credentials',
 'passwords', '/app/wordlists/seclists/Passwords/Default-Credentials/default-passwords.csv', 500, false),

-- ── SecLists — Fuzzing ────────────────────────────────────────
('lfi-jhaddix',
 'SecLists: LFI-Jhaddix.txt — LFI path traversal payloads',
 'fuzzing', '/app/wordlists/seclists/Fuzzing/LFI/LFI-Jhaddix.txt', 929, false),

('sqli-generic',
 'SecLists: Generic-SQLi.txt — generic SQL injection payloads',
 'fuzzing', '/app/wordlists/seclists/Fuzzing/SQLi/Generic-SQLi.txt', 200, false),

('xss-brutelogic',
 'SecLists: XSS-Bypass-Strings-BruteLogic.txt — XSS bypass payloads',
 'fuzzing', '/app/wordlists/seclists/Fuzzing/XSS/XSS-Bypass-Strings-BruteLogic.txt', 150, false),

('fuzz-xss',
 'SecLists: XSS-Jhaddix.txt — XSS payloads by Jhaddix',
 'fuzzing', '/app/wordlists/seclists/Fuzzing/XSS/XSS-Jhaddix.txt', 3439, false)

ON CONFLICT (path) DO NOTHING;
