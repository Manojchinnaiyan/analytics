// Package geo resolves a client IP to country/region/city using a MaxMind- or
// DB-IP-format .mmdb database loaded once at startup. It no-ops cleanly when no
// database is configured, so geo enrichment is simply skipped if the file is absent.
package geo

import (
	"net"

	"github.com/oschwald/geoip2-golang"
)

type Resolver struct {
	db *geoip2.Reader
}

// New opens the .mmdb at path. An empty path returns a disabled resolver (no
// error) so callers can run without a DB mounted.
func New(path string) (*Resolver, error) {
	if path == "" {
		return &Resolver{}, nil
	}
	db, err := geoip2.Open(path)
	if err != nil {
		return nil, err
	}
	return &Resolver{db: db}, nil
}

func (r *Resolver) Enabled() bool { return r != nil && r.db != nil }

// Lookup returns the ISO country code, region (subdivision) and city for a
// public IP. Returns empty strings for private/loopback IPs or on any failure —
// never errors, so it's safe to call inline on the hot ingest path.
func (r *Resolver) Lookup(ipStr string) (country, region, city string) {
	if !r.Enabled() {
		return
	}
	ip := net.ParseIP(ipStr)
	if ip == nil || ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
		return
	}
	rec, err := r.db.City(ip)
	if err != nil || rec == nil {
		return
	}
	country = rec.Country.IsoCode
	if len(rec.Subdivisions) > 0 {
		region = rec.Subdivisions[0].Names["en"]
	}
	city = rec.City.Names["en"]
	return
}

func (r *Resolver) Close() {
	if r != nil && r.db != nil {
		_ = r.db.Close()
	}
}
