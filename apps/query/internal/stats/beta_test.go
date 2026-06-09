package stats

import (
	"math"
	"testing"
)

func TestExactBeta(t *testing.T) {
	// 100/1000 (10%) vs 130/1000 (13%): P(variant>control) should be ~0.985.
	p := ProbBGreaterA(101, 901, 131, 871)
	if p < 0.97 || p > 0.995 {
		t.Errorf("P(B>A)=%.4f, want ~0.985", p)
	}
	// equal arms → 0.5 exactly.
	if e := ProbBGreaterA(51, 51, 51, 51); math.Abs(e-0.5) > 1e-9 {
		t.Errorf("equal arms P=%.6f, want 0.5", e)
	}
	// CI95 of 130/1000 should bracket 0.13 and be ~[0.110,0.153].
	lo, hi := BetaQuantile(0.025, 131, 871), BetaQuantile(0.975, 131, 871)
	if lo > 0.13 || hi < 0.13 || lo < 0.10 || hi > 0.16 {
		t.Errorf("CI=[%.4f,%.4f], want ~[0.110,0.153]", lo, hi)
	}
	// BetaInc is the CDF: I_x(a,b) at the mean ≈ 0.5-ish, monotone.
	if BetaInc(131, 871, 0.05) > BetaInc(131, 871, 0.20) {
		t.Errorf("BetaInc not monotone")
	}
	t.Logf("P(B>A)=%.4f  CI=[%.4f,%.4f]", p, lo, hi)
}
