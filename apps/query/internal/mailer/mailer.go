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

// WelcomeEmail renders a polished, on-brand welcome email for a new signup.
// Table-based + inline styles + system fonts for broad email-client support;
// uses token replacement (not fmt) so CSS percent signs need no escaping.
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

	const tpl = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>Welcome to InspectUser</title>
</head>
<body style="margin:0;padding:0;background:#EEF1F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(16,24,40,.08);">

    <!-- Hero -->
    <tr><td bgcolor="#0052F2" style="background:#0052F2;background:linear-gradient(135deg,#0052F2 0%,#5B8DEF 100%);padding:40px 40px 36px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C7DAFF;margin-bottom:14px;">● INSPECTUSER</div>
      <h1 style="margin:0;font-size:28px;line-height:1.2;color:#ffffff;font-weight:700;">Welcome aboard, {{HI}} 👋</h1>
      <p style="margin:12px 0 0;font-size:16px;line-height:1.55;color:#DCE8FF;">You just turned on the lights. See what people actually <em>do</em> on your product — and what drives revenue.</p>
    </td></tr>

    <!-- Feature grid 2x2 -->
    <tr><td style="padding:32px 32px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" valign="top" style="padding:0 8px 16px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;border:1px solid #EAEEF3;border-radius:12px;"><tr><td style="padding:16px;">
              <div style="font-size:22px;line-height:1;">🎬</div>
              <div style="font-size:15px;font-weight:700;color:#101828;margin:8px 0 3px;">Session replay</div>
              <div style="font-size:13px;line-height:1.45;color:#667085;">Watch real visits like a video.</div>
            </td></tr></table>
          </td>
          <td width="50%" valign="top" style="padding:0 0 16px 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;border:1px solid #EAEEF3;border-radius:12px;"><tr><td style="padding:16px;">
              <div style="font-size:22px;line-height:1;">🔻</div>
              <div style="font-size:15px;font-weight:700;color:#101828;margin:8px 0 3px;">Funnels</div>
              <div style="font-size:13px;line-height:1.45;color:#667085;">See exactly where users drop off.</div>
            </td></tr></table>
          </td>
        </tr>
        <tr>
          <td width="50%" valign="top" style="padding:0 8px 0 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;border:1px solid #EAEEF3;border-radius:12px;"><tr><td style="padding:16px;">
              <div style="font-size:22px;line-height:1;">🔥</div>
              <div style="font-size:15px;font-weight:700;color:#101828;margin:8px 0 3px;">Heatmaps</div>
              <div style="font-size:13px;line-height:1.45;color:#667085;">Where attention &amp; clicks land.</div>
            </td></tr></table>
          </td>
          <td width="50%" valign="top" style="padding:0 0 0 8px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;border:1px solid #EAEEF3;border-radius:12px;"><tr><td style="padding:16px;">
              <div style="font-size:22px;line-height:1;">💸</div>
              <div style="font-size:15px;font-weight:700;color:#101828;margin:8px 0 3px;">Revenue attribution</div>
              <div style="font-size:13px;line-height:1.45;color:#667085;">Tie money to behavior &amp; source.</div>
            </td></tr></table>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Quickstart -->
    <tr><td style="padding:18px 32px 0;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#98A2B3;margin-bottom:6px;">Your 3-minute head start</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;color:#344054;line-height:1.5;">
        <tr><td style="padding:9px 0;border-bottom:1px solid #F0F2F5;"><span style="color:#0052F2;font-weight:700;">1.</span>&nbsp;&nbsp;Add the snippet (or 1-click Shopify install)</td></tr>
        <tr><td style="padding:9px 0;border-bottom:1px solid #F0F2F5;"><span style="color:#0052F2;font-weight:700;">2.</span>&nbsp;&nbsp;Watch live events &amp; your first replay roll in</td></tr>
        <tr><td style="padding:9px 0;"><span style="color:#0052F2;font-weight:700;">3.</span>&nbsp;&nbsp;Build a funnel and find your biggest leak</td></tr>
      </table>
    </td></tr>

    <!-- CTA -->
    <tr><td align="center" style="padding:28px 32px 36px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" bgcolor="#0052F2" style="border-radius:10px;">
          <a href="{{APP}}/overview" style="display:inline-block;padding:14px 40px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Open your dashboard →</a>
        </td>
      </tr></table>
      <p style="margin:18px 0 0;font-size:13px;color:#98A2B3;">Stuck? Just reply — a real person reads every email.</p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:20px 32px;background:#F7F9FC;border-top:1px solid #EAEEF3;">
      <p style="margin:0;font-size:12px;line-height:1.5;color:#98A2B3;">InspectUser — product analytics, session replay &amp; revenue attribution.<br>You're receiving this because you created an account.</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`

	html = strings.NewReplacer("{{HI}}", hi, "{{APP}}", app).Replace(tpl)
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

// VerificationEmail renders the "confirm your email" email. Focused on one
// action (verify) for high deliverability, on-brand with the welcome email.
func VerificationEmail(verifyURL string) (subject, html string) {
	subject = "Verify your email to start using InspectUser"
	tpl := `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#EEF1F5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF1F5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 4px rgba(16,24,40,.08);">
    <tr><td bgcolor="#0052F2" style="background:#0052F2;background:linear-gradient(135deg,#0052F2 0%,#5B8DEF 100%);padding:36px 40px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#C7DAFF;margin-bottom:12px;">● INSPECTUSER</div>
      <h1 style="margin:0;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;">Confirm your email ✉️</h1>
    </td></tr>
    <tr><td style="padding:32px 40px;">
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#344054;">
        You're one click away. Verify your email to activate your account and open your dashboard.
      </p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 24px;"><tr>
        <td align="center" bgcolor="#0052F2" style="border-radius:10px;">
          <a href="{{URL}}" style="display:inline-block;padding:14px 44px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Verify my email →</a>
        </td>
      </tr></table>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#98A2B3;">
        This link expires in 24 hours. If you didn't create an InspectUser account, you can ignore this email.<br><br>
        Or paste this link into your browser:<br><span style="color:#0052F2;word-break:break-all;">{{URL}}</span>
      </p>
    </td></tr>
    <tr><td style="padding:18px 40px;background:#F7F9FC;border-top:1px solid #EAEEF3;">
      <p style="margin:0;font-size:12px;color:#98A2B3;">InspectUser — product analytics, session replay &amp; revenue attribution.</p>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`
	html = strings.ReplaceAll(tpl, "{{URL}}", verifyURL)
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
