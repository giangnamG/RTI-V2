package models

import (
	"net"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Target struct {
	ID          string    `json:"id"`
	WorkspaceID string    `json:"workspace_id"`
	Domain      string    `json:"domain"`
	IPAddress   *string   `json:"ip_address"`
	Notes       string    `json:"notes"`
	IsActive    bool      `json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	// Thành phần đã chuẩn hoá (ParseTarget) — hiển thị cho user thấy target được parse thế nào.
	Scheme *string `json:"scheme"`
	Host   *string `json:"host"`
	Port   *int    `json:"port"`
	IsIP   bool    `json:"is_ip"`
}

// ParsedTarget — các thành phần chuẩn hoá của target.domain.
// Scheme/Port rỗng (Port=nil) nghĩa là user không nêu rõ → tầng recon tự suy.
type ParsedTarget struct {
	Scheme string // "http" | "https" | "" (không nêu)
	Host   string // hostname hoặc IP, không kèm scheme/port/path
	Port   *int   // nil nếu không nêu port tường minh
	IsIP   bool   // Host là địa chỉ IP literal
}

// ParseTarget tách chuỗi target thô → (scheme, host, port, is_ip).
// Chấp nhận: "example.com", "host:port", "scheme://host[:port][/path]", "ip[:port]".
// Đây là điểm parse DUY NHẤT — worker đọc kết quả từ DB, không tự parse lại.
func ParseTarget(raw string) ParsedTarget {
	s := strings.TrimSpace(raw)
	pt := ParsedTarget{}
	if s == "" {
		return pt
	}

	var u *url.URL
	var err error
	if strings.Contains(s, "://") {
		u, err = url.Parse(s)
	} else {
		// Không có scheme → bọc "//" để url.Parse tách host[:port] chuẩn xác.
		u, err = url.Parse("//" + s)
	}
	if err != nil || u.Hostname() == "" {
		// Parse thất bại → coi toàn bộ chuỗi là host.
		pt.Host = s
		pt.IsIP = net.ParseIP(s) != nil
		return pt
	}

	pt.Scheme = u.Scheme
	pt.Host = u.Hostname()
	if p := u.Port(); p != "" {
		if n, e := strconv.Atoi(p); e == nil {
			pt.Port = &n
		}
	}
	pt.IsIP = net.ParseIP(pt.Host) != nil
	return pt
}

type CreateTargetRequest struct {
	Domain    string `json:"domain"     validate:"required"`
	IPAddress string `json:"ip_address"`
	Notes     string `json:"notes"`
}

type CreateTargetsBulkRequest struct {
	// Cho phép paste nhiều domain, cách nhau bởi newline hoặc dấu phẩy
	Domains string `json:"domains" validate:"required"`
	Notes   string `json:"notes"`
}

func (r *CreateTargetsBulkRequest) ParseDomains() []string {
	raw := strings.ReplaceAll(r.Domains, ",", "\n")
	lines := strings.Split(raw, "\n")
	var result []string
	for _, l := range lines {
		d := strings.TrimSpace(l)
		if d != "" {
			result = append(result, d)
		}
	}
	return result
}

type UpdateTargetRequest struct {
	Domain    string `json:"domain"     validate:"required"`
	IPAddress string `json:"ip_address"`
	Notes     string `json:"notes"`
	IsActive  *bool  `json:"is_active"`
}
