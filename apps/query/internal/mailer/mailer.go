// Package mailer sends transactional email over SMTP. When SMTP isn't
// configured it reports Enabled()==false so callers can fall back to returning a
// copyable link instead of silently dropping the message.
package mailer

import (
	"errors"
	"fmt"
	"net/smtp"
	"strings"
)

// ErrNotConfigured is returned by Send when no SMTP host is set.
var ErrNotConfigured = errors.New("smtp not configured")

type Mailer struct {
	host, port, user, pass, from string
}

func New(host, port, user, pass, from string) *Mailer {
	return &Mailer{host: host, port: port, user: user, pass: pass, from: from}
}

// Enabled reports whether SMTP is configured.
func (m *Mailer) Enabled() bool { return m.host != "" }

// Send delivers a single HTML email. Plain-text is a stripped fallback.
func (m *Mailer) Send(to, subject, htmlBody string) error {
	if !m.Enabled() {
		return ErrNotConfigured
	}
	msg := buildMessage(m.from, to, subject, htmlBody)
	addr := m.host + ":" + m.port
	var auth smtp.Auth
	if m.user != "" {
		auth = smtp.PlainAuth("", m.user, m.pass, m.host)
	}
	return smtp.SendMail(addr, auth, extractAddr(m.from), []string{to}, []byte(msg))
}

func buildMessage(from, to, subject, htmlBody string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "From: %s\r\n", from)
	fmt.Fprintf(&b, "To: %s\r\n", to)
	fmt.Fprintf(&b, "Subject: %s\r\n", subject)
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	b.WriteString("\r\n")
	b.WriteString(htmlBody)
	return b.String()
}

// extractAddr pulls the bare address out of a "Name <addr>" From header.
func extractAddr(from string) string {
	if i := strings.Index(from, "<"); i >= 0 {
		if j := strings.Index(from, ">"); j > i {
			return from[i+1 : j]
		}
	}
	return from
}

// InviteEmail renders the invite email body.
func InviteEmail(orgName, inviterName, role, acceptURL string) (subject, html string) {
	subject = fmt.Sprintf("You've been invited to %s on Klyra", orgName)
	by := ""
	if inviterName != "" {
		by = fmt.Sprintf(" by %s", inviterName)
	}
	html = fmt.Sprintf(`<!doctype html><html><body style="font-family:'IBM Plex Sans',Arial,sans-serif;background:#F4F5F6;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #DEDFE2;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;color:#18181B;margin:0 0 8px;">Join %s on Klyra</h1>
    <p style="font-size:15px;color:#6F7480;line-height:1.5;margin:0 0 24px;">
      You've been invited%s as a <strong>%s</strong>. Click below to set your password and get started.
    </p>
    <a href="%s" style="display:inline-block;background:#0052F2;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 24px;border-radius:8px;">Accept invite &amp; set password</a>
    <p style="font-size:13px;color:#8A8E99;margin:24px 0 0;">Or paste this link into your browser:<br><span style="color:#0052F2;word-break:break-all;">%s</span></p>
  </div>
</body></html>`, orgName, by, role, acceptURL, acceptURL)
	return subject, html
}
