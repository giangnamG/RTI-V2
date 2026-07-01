-- Tách target.domain (chuỗi user nhập — có thể là "example.com", "host:port",
-- "scheme://host[:port][/path]", hoặc "ip[:port]") thành các thành phần đã chuẩn hoá.
-- Đây là SINGLE SOURCE OF TRUTH cho scheme/host/port: backend parse 1 lần khi tạo/sửa
-- target; mọi tầng recon (subdomain/port/web_probe) ĐỌC các cột này thay vì tự parse
-- lại chuỗi domain thô → tránh subfinder/naabu nhận chuỗi có scheme/port gây lỗi.
ALTER TABLE targets
    ADD COLUMN IF NOT EXISTS scheme TEXT,
    ADD COLUMN IF NOT EXISTS host   TEXT,
    ADD COLUMN IF NOT EXISTS port   INTEGER,
    ADD COLUMN IF NOT EXISTS is_ip  BOOLEAN NOT NULL DEFAULT FALSE;
