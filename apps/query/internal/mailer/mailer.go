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
	subject = fmt.Sprintf("You've been invited to %s on InspectUser", orgName)
	by := ""
	if inviterName != "" {
		by = fmt.Sprintf(" by %s", inviterName)
	}
	html = fmt.Sprintf(`<!doctype html><html><body style="font-family:'IBM Plex Sans',Arial,sans-serif;background:#F4F5F6;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #DEDFE2;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;color:#18181B;margin:0 0 8px;">Join %s on InspectUser</h1>
    <p style="font-size:15px;color:#6F7480;line-height:1.5;margin:0 0 24px;">
      You've been invited%s as a <strong>%s</strong>. Click below to set your password and get started.
    </p>
    <a href="%s" style="display:inline-block;background:#0052F2;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 24px;border-radius:8px;">Accept invite &amp; set password</a>
    <p style="font-size:13px;color:#8A8E99;margin:24px 0 0;">Or paste this link into your browser:<br><span style="color:#0052F2;word-break:break-all;">%s</span></p>
  </div>
</body></html>`, orgName, by, role, acceptURL, acceptURL)
	return subject, html
}

// WelcomeEmail renders an innovative, on-brand welcome email for a new signup.
func WelcomeEmail(name, appURL string) (subject, html string) {
	first := name
	if i := strings.IndexAny(name, " "); i > 0 {
		first = name[:i]
	}
	hi := "there"
	if first != "" {
		hi = first
	}
	app := strings.TrimRight(appURL, "/")
	subject = "Welcome to InspectUser 🎉 — let's find what drives your growth"
	html = fmt.Sprintf(`<!doctype html><html><body style="margin:0;font-family:'IBM Plex Sans',-apple-system,Arial,sans-serif;background:#F4F5F6;padding:32px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #DEDFE2;border-radius:16px;overflow:hidden;">
    <div style="background:linear-gradient(135deg,#0052F2,#3B82F6);padding:36px 32px;">
      <div style="font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#BFD3FF;">InspectUser</div>
      <h1 style="margin:8px 0 0;font-size:26px;line-height:1.25;color:#fff;font-weight:700;">Welcome aboard, %s 👋</h1>
    </div>
    <div style="padding:32px;">
      <p style="font-size:16px;color:#3A3F4B;line-height:1.6;margin:0 0 20px;">
        You just turned on the lights. InspectUser shows you <strong>what people actually do</strong> on your product — every click, funnel, drop-off and dollar — so you stop guessing and start growing.
      </p>
      <p style="font-size:15px;color:#6F7480;line-height:1.6;margin:0 0 12px;font-weight:600;">Your 3-minute head start:</p>
      <table style="width:100%%;border-collapse:collapse;margin:0 0 28px;">
        <tr><td style="padding:10px 0;border-bottom:1px solid #EDEFF2;font-size:15px;color:#3A3F4B;">①&nbsp;&nbsp;Drop the snippet on your site (or 1-click Shopify install)</td></tr>
        <tr><td style="padding:10px 0;border-bottom:1px solid #EDEFF2;font-size:15px;color:#3A3F4B;">②&nbsp;&nbsp;Watch live events &amp; your first session replay roll in</td></tr>
        <tr><td style="padding:10px 0;font-size:15px;color:#3A3F4B;">③&nbsp;&nbsp;Build a funnel and see exactly where you lose people</td></tr>
      </table>
      <a href="%s/overview" style="display:inline-block;background:#0052F2;color:#fff;text-decoration:none;font-size:15px;font-weight:600;padding:13px 28px;border-radius:10px;">Open your dashboard →</a>
      <p style="font-size:13px;color:#8A8E99;margin:28px 0 0;line-height:1.6;">
        Need a hand getting set up? Just reply to this email — a real person reads it.<br>Happy building 🚀
      </p>
    </div>
  </div>
</body></html>`, hi, app)
	return subject, html
}

// SignupNotifyEmail renders the internal "new signup" notification to the admin.
func SignupNotifyEmail(name, email, orgName string) (subject, html string) {
	subject = fmt.Sprintf("🎉 New InspectUser signup: %s", orgName)
	display := name
	if display == "" {
		display = email
	}
	html = fmt.Sprintf(`<!doctype html><html><body style="font-family:'IBM Plex Sans',Arial,sans-serif;background:#F4F5F6;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #DEDFE2;border-radius:12px;padding:28px;">
    <h1 style="font-size:19px;color:#18181B;margin:0 0 16px;">🎉 New signup</h1>
    <table style="width:100%%;border-collapse:collapse;font-size:15px;color:#3A3F4B;">
      <tr><td style="padding:6px 0;color:#8A8E99;width:90px;">Name</td><td style="padding:6px 0;font-weight:600;">%s</td></tr>
      <tr><td style="padding:6px 0;color:#8A8E99;">Email</td><td style="padding:6px 0;">%s</td></tr>
      <tr><td style="padding:6px 0;color:#8A8E99;">Org</td><td style="padding:6px 0;">%s</td></tr>
    </table>
  </div>
</body></html>`, display, email, orgName)
	return subject, html
}

// PasswordResetEmail renders the password-reset email body.
func PasswordResetEmail(resetURL string) (subject, html string) {
	subject = "Reset your InspectUser password"
	html = fmt.Sprintf(`<!doctype html><html><body style="font-family:'IBM Plex Sans',Arial,sans-serif;background:#F4F5F6;padding:32px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #DEDFE2;border-radius:12px;padding:32px;">
    <h1 style="font-size:20px;color:#18181B;margin:0 0 8px;">Reset your password</h1>
    <p style="font-size:15px;color:#6F7480;line-height:1.5;margin:0 0 24px;">
      We received a request to reset your InspectUser password. Click below to choose a new one. This link expires in 1 hour. If you didn't request this, you can safely ignore this email.
    </p>
    <a href="%s" style="display:inline-block;background:#0052F2;color:#fff;text-decoration:none;font-size:15px;font-weight:500;padding:12px 24px;border-radius:8px;">Reset password</a>
    <p style="font-size:13px;color:#8A8E99;margin:24px 0 0;">Or paste this link into your browser:<br><span style="color:#0052F2;word-break:break-all;">%s</span></p>
  </div>
</body></html>`, resetURL, resetURL)
	return subject, html
}
