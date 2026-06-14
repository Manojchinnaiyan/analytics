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
<body style="margin:0;padding:0;background:#F2F4F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:18px;overflow:hidden;border:1px solid #E7EAEE;">

    <!-- Brand bar -->
    <tr><td style="padding:20px 40px;border-bottom:1px solid #F0F2F5;">
      <img src="https://inspectuser.com/email-logo.png" width="28" height="28" alt="InspectUser" style="vertical-align:middle;border-radius:7px;display:inline-block;">
      <span style="font-size:17px;font-weight:700;color:#0B1220;letter-spacing:-.01em;vertical-align:middle;margin-left:9px;">InspectUser</span>
    </td></tr>

    <!-- Hero (clean, centered, landing-page style) -->
    <tr><td align="center" style="padding:48px 40px 8px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#0052F2;margin-bottom:16px;">Welcome aboard</div>
      <h1 style="margin:0;font-size:34px;line-height:1.18;color:#0B1220;font-weight:800;letter-spacing:-.02em;">Hi {{HI}}, let's find<br>what drives your growth.</h1>
      <p style="margin:18px auto 0;max-width:440px;font-size:17px;line-height:1.6;color:#5A6473;">Stop guessing. See what people actually do on your product — every click, funnel, drop-off and dollar — in one clean platform.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:28px auto 0;"><tr>
        <td align="center" bgcolor="#0052F2" style="border-radius:12px;">
          <a href="{{APP}}/overview" style="display:inline-block;padding:15px 42px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Open your dashboard →</a>
        </td>
      </tr></table>
    </td></tr>

    <!-- Divider -->
    <tr><td style="padding:44px 40px 0;"><div style="border-top:1px solid #EEF1F4;"></div></td></tr>

    <!-- Features (full-width clean rows) -->
    <tr><td style="padding:32px 40px 8px;">
      <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#98A2B3;margin-bottom:4px;">Everything in one place</div>
      <h2 style="margin:0 0 20px;font-size:21px;font-weight:700;color:#0B1220;letter-spacing:-.01em;">No more stitching tools together</h2>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="52" valign="top" style="padding:0 0 22px;"><div style="width:44px;height:44px;background:#EEF4FF;border-radius:11px;text-align:center;line-height:44px;font-size:20px;">🎬</div></td>
          <td valign="top" style="padding:0 0 22px 14px;">
            <div style="font-size:16px;font-weight:700;color:#0B1220;">Session replay</div>
            <div style="font-size:14px;line-height:1.55;color:#667085;margin-top:2px;">Watch real visits like a video — clicks, scrolls, rage-clicks. Inputs masked for privacy.</div>
          </td>
        </tr>
        <tr>
          <td width="52" valign="top" style="padding:0 0 22px;"><div style="width:44px;height:44px;background:#EEF4FF;border-radius:11px;text-align:center;line-height:44px;font-size:20px;">🔻</div></td>
          <td valign="top" style="padding:0 0 22px 14px;">
            <div style="font-size:16px;font-weight:700;color:#0B1220;">Funnels &amp; retention</div>
            <div style="font-size:14px;line-height:1.55;color:#667085;margin-top:2px;">See exactly where users drop off, and which behaviors bring them back.</div>
          </td>
        </tr>
        <tr>
          <td width="52" valign="top" style="padding:0 0 22px;"><div style="width:44px;height:44px;background:#EEF4FF;border-radius:11px;text-align:center;line-height:44px;font-size:20px;">🔥</div></td>
          <td valign="top" style="padding:0 0 22px 14px;">
            <div style="font-size:16px;font-weight:700;color:#0B1220;">Heatmaps</div>
            <div style="font-size:14px;line-height:1.55;color:#667085;margin-top:2px;">See where attention and clicks land — and what visitors ignore.</div>
          </td>
        </tr>
        <tr>
          <td width="52" valign="top"><div style="width:44px;height:44px;background:#EEF4FF;border-radius:11px;text-align:center;line-height:44px;font-size:20px;">💸</div></td>
          <td valign="top" style="padding:0 0 0 14px;">
            <div style="font-size:16px;font-weight:700;color:#0B1220;">Revenue attribution</div>
            <div style="font-size:14px;line-height:1.55;color:#667085;margin-top:2px;">Tie revenue to behavior and source — know which channel actually pays.</div>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- Steps band -->
    <tr><td style="padding:12px 40px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;border:1px solid #EEF1F4;border-radius:14px;"><tr><td style="padding:24px 24px 8px;">
        <div style="font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#98A2B3;margin-bottom:14px;">Get started in 3 steps</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td width="34" valign="top" style="padding:0 0 16px;"><div style="width:26px;height:26px;background:#0052F2;border-radius:50%;color:#fff;text-align:center;line-height:26px;font-size:13px;font-weight:700;">1</div></td>
              <td valign="top" style="padding:0 0 16px 4px;font-size:15px;line-height:1.5;color:#344054;">Add the snippet to your site — or 1-click install on Shopify.</td></tr>
          <tr><td width="34" valign="top" style="padding:0 0 16px;"><div style="width:26px;height:26px;background:#0052F2;border-radius:50%;color:#fff;text-align:center;line-height:26px;font-size:13px;font-weight:700;">2</div></td>
              <td valign="top" style="padding:0 0 16px 4px;font-size:15px;line-height:1.5;color:#344054;">Watch live events and your first session replay roll in.</td></tr>
          <tr><td width="34" valign="top"><div style="width:26px;height:26px;background:#0052F2;border-radius:50%;color:#fff;text-align:center;line-height:26px;font-size:13px;font-weight:700;">3</div></td>
              <td valign="top" style="padding:0 0 0 4px;font-size:15px;line-height:1.5;color:#344054;">Build a funnel and find your biggest leak.</td></tr>
        </table>
      </td></tr></table>
    </td></tr>

    <!-- Final CTA -->
    <tr><td align="center" style="padding:32px 40px 8px;">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td align="center" bgcolor="#0052F2" style="border-radius:12px;">
          <a href="{{APP}}/overview" style="display:inline-block;padding:15px 42px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Go to your dashboard →</a>
        </td>
      </tr></table>
      <p style="margin:16px 0 0;font-size:14px;color:#98A2B3;">Stuck on setup? Just reply — a real person reads every email.</p>
    </td></tr>

    <!-- Footer -->
    <tr><td style="padding:32px 40px;margin-top:24px;background:#0B1220;">
      <div style="margin-bottom:12px;">
        <img src="https://inspectuser.com/email-logo-white.png" width="22" height="22" alt="" style="vertical-align:middle;display:inline-block;">
        <span style="font-size:16px;font-weight:700;color:#ffffff;vertical-align:middle;margin-left:8px;">InspectUser</span>
      </div>
      <div style="font-size:13px;line-height:1.7;">
        <a href="{{APP}}/features" style="color:#AEB6C2;text-decoration:none;">Features</a>&nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="{{APP}}/pricing" style="color:#AEB6C2;text-decoration:none;">Pricing</a>&nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="{{APP}}/docs" style="color:#AEB6C2;text-decoration:none;">Docs</a>&nbsp;&nbsp;·&nbsp;&nbsp;
        <a href="{{APP}}/security" style="color:#AEB6C2;text-decoration:none;">Security</a>
      </div>
      <p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6B7484;">Product analytics, session replay &amp; revenue attribution.<br>You're receiving this because you created an InspectUser account.</p>
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
    <tr><td bgcolor="#0052F2" style="background:#0052F2;background:linear-gradient(135deg,#0052F2 0%,#5B8DEF 100%);padding:32px 40px 34px;">
      <div style="margin-bottom:18px;">
        <img src="https://inspectuser.com/email-logo-white.png" width="26" height="26" alt="" style="vertical-align:middle;display:inline-block;">
        <span style="font-size:16px;font-weight:700;color:#ffffff;vertical-align:middle;margin-left:8px;">InspectUser</span>
      </div>
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
