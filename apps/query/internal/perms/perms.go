// Package perms defines the permission catalog, the default permission set per
// role, and how a member's effective permissions are computed (role defaults +
// per-member overrides). It is pure logic — no DB/HTTP — so it can be shared by
// handlers, middleware, and tests.
package perms

import "sort"

// Permission keys, namespaced by dashboard section (<section>.<action>).
const (
	AnalyticsView   = "analytics.view"   // overview, segmentation, funnels, retention, lifecycle, paths, web
	AnalyticsManage = "analytics.manage" // create/save charts, dashboards, cohorts, formulas, annotations
	FlagsView       = "flags.view"       // see feature flags / experiments
	FlagsManage     = "flags.manage"     // create/edit/delete flags, run experiments
	ReplayView      = "replay.view"      // watch session replays
	ReplayManage    = "replay.manage"    // delete replays
	UsersView       = "users.view"       // user profiles + properties
	DataExport      = "data.export"      // GDPR export
	DataDelete      = "data.delete"      // GDPR erase
	SQLRun          = "sql.run"          // SQL console / notebooks
	BillingView     = "billing.view"     // usage & billing page
	BillingManage   = "billing.manage"   // set event quota
	TeamView        = "team.view"        // see members
	TeamManage      = "team.manage"      // invite/remove/change roles & permissions
	SettingsManage  = "settings.manage"  // taxonomy, alerts, links, project settings
	ProjectCreate   = "project.create"   // create new projects
)

// Def describes a permission for the UI permission editor.
type Def struct {
	Key     string `json:"key"`
	Section string `json:"section"`
	Label   string `json:"label"`
}

// Catalog is the full permission list in display order, grouped by section.
var Catalog = []Def{
	{AnalyticsView, "Analytics", "View analytics"},
	{AnalyticsManage, "Analytics", "Create & save charts, dashboards, cohorts"},
	{FlagsView, "Feature Flags", "View flags & experiments"},
	{FlagsManage, "Feature Flags", "Manage flags & experiments"},
	{ReplayView, "Session Replay", "Watch replays"},
	{ReplayManage, "Session Replay", "Delete replays"},
	{UsersView, "Users", "View user profiles"},
	{SQLRun, "SQL", "Run SQL queries"},
	{DataExport, "Data Privacy", "Export user data (GDPR)"},
	{DataDelete, "Data Privacy", "Delete user data (GDPR)"},
	{BillingView, "Billing", "View usage & billing"},
	{BillingManage, "Billing", "Change event quota"},
	{SettingsManage, "Settings", "Manage taxonomy, alerts, links, settings"},
	{ProjectCreate, "Settings", "Create new projects"},
	{TeamView, "Team", "View team members"},
	{TeamManage, "Team", "Invite & manage members"},
}

// All is every permission key (the owner's set).
var All = func() []string {
	out := make([]string, len(Catalog))
	for i, d := range Catalog {
		out[i] = d.Key
	}
	return out
}()

// AssignableRoles are the roles an admin may grant (owner is reserved for the
// org creator and cannot be assigned).
var AssignableRoles = map[string]bool{"admin": true, "manager": true, "member": true, "viewer": true}

// roleDefaults maps each role to the permission set it grants out of the box.
var roleDefaults = map[string][]string{
	"owner": All,
	"admin": All, // full access; only the owner seat is special
	"manager": {
		AnalyticsView, AnalyticsManage, FlagsView, FlagsManage,
		ReplayView, ReplayManage, UsersView, SQLRun,
		DataExport, BillingView, SettingsManage, TeamView,
	},
	"member": {
		AnalyticsView, AnalyticsManage, FlagsView, ReplayView,
		UsersView, SQLRun, BillingView, TeamView,
	},
	"viewer": {
		AnalyticsView, FlagsView, ReplayView, UsersView, BillingView, TeamView,
	},
}

// DefaultsFor returns the role's default permission set (unknown role → empty).
func DefaultsFor(role string) map[string]bool {
	set := map[string]bool{}
	for _, k := range roleDefaults[role] {
		set[k] = true
	}
	return set
}

// valid reports whether a key is a real permission (guards against stale
// overrides referencing removed keys).
func valid(key string) bool {
	for _, d := range Catalog {
		if d.Key == key {
			return true
		}
	}
	return false
}

// Effective merges a role's defaults with per-member overrides. An override of
// true grants a permission the role lacks; false revokes one the role has.
// Owners always get everything regardless of overrides.
func Effective(role string, overrides map[string]bool) map[string]bool {
	if role == "owner" {
		return DefaultsFor("owner")
	}
	set := DefaultsFor(role)
	for k, granted := range overrides {
		if !valid(k) {
			continue
		}
		if granted {
			set[k] = true
		} else {
			delete(set, k)
		}
	}
	return set
}

// List returns the granted permission keys, sorted, for JSON responses.
func List(set map[string]bool) []string {
	out := make([]string, 0, len(set))
	for k, ok := range set {
		if ok {
			out = append(out, k)
		}
	}
	sort.Strings(out)
	return out
}
