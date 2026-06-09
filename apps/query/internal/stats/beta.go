// Package stats provides exact Beta-posterior statistics for Bayesian A/B
// testing — the same math Statsig/GrowthBook use, replacing normal
// approximations of the Beta distribution.
package stats

import "math"

// LogBeta returns ln B(a,b) = lnΓ(a)+lnΓ(b)−lnΓ(a+b).
func LogBeta(a, b float64) float64 {
	la, _ := math.Lgamma(a)
	lb, _ := math.Lgamma(b)
	lab, _ := math.Lgamma(a + b)
	return la + lb - lab
}

// betacf is the continued-fraction expansion for the incomplete beta function
// (Numerical Recipes), used by BetaInc.
func betacf(a, b, x float64) float64 {
	const maxIt = 300
	const eps = 3e-14
	const fpmin = 1e-300
	qab, qap, qam := a+b, a+1, a-1
	c := 1.0
	d := 1 - qab*x/qap
	if math.Abs(d) < fpmin {
		d = fpmin
	}
	d = 1 / d
	h := d
	for m := 1; m <= maxIt; m++ {
		fm := float64(m)
		m2 := 2 * fm
		aa := fm * (b - fm) * x / ((qam + m2) * (a + m2))
		d = 1 + aa*d
		if math.Abs(d) < fpmin {
			d = fpmin
		}
		c = 1 + aa/c
		if math.Abs(c) < fpmin {
			c = fpmin
		}
		d = 1 / d
		h *= d * c
		aa = -(a + fm) * (qab + fm) * x / ((a + m2) * (qap + m2))
		d = 1 + aa*d
		if math.Abs(d) < fpmin {
			d = fpmin
		}
		c = 1 + aa/c
		if math.Abs(c) < fpmin {
			c = fpmin
		}
		d = 1 / d
		del := d * c
		h *= del
		if math.Abs(del-1) < eps {
			break
		}
	}
	return h
}

// BetaInc is the regularized incomplete beta function I_x(a,b) = P(X ≤ x) for
// X ~ Beta(a,b) — i.e. the Beta CDF.
func BetaInc(a, b, x float64) float64 {
	if x <= 0 {
		return 0
	}
	if x >= 1 {
		return 1
	}
	front := math.Exp(a*math.Log(x) + b*math.Log(1-x) - LogBeta(a, b))
	if x < (a+1)/(a+b+2) {
		return front * betacf(a, b, x) / a
	}
	return 1 - front*betacf(b, a, 1-x)/b
}

// BetaQuantile inverts the Beta CDF (the p-th quantile) via bisection — exact to
// ~1e-12. Used for credible-interval bounds.
func BetaQuantile(p, a, b float64) float64 {
	if p <= 0 {
		return 0
	}
	if p >= 1 {
		return 1
	}
	lo, hi := 0.0, 1.0
	for i := 0; i < 100; i++ {
		mid := (lo + hi) / 2
		if BetaInc(a, b, mid) < p {
			lo = mid
		} else {
			hi = mid
		}
	}
	return (lo + hi) / 2
}

// probSum computes P(B > A) = Σ_{i=0}^{aB-1} exp(...) (Evan Miller's closed form),
// summing aB integer terms.
func probSum(aA, bA, aB, bB float64) float64 {
	n := int(aB)
	if n > 100000 { // far into the regime where the normal approx is exact
		return normalApprox(aA, bA, aB, bB)
	}
	logBaa := LogBeta(aA, bA)
	total := 0.0
	for i := 0; i < n; i++ {
		fi := float64(i)
		t := LogBeta(aA+fi, bA+bB) - math.Log(bB+fi) - LogBeta(1+fi, bB) - logBaa
		total += math.Exp(t)
	}
	return math.Max(0, math.Min(1, total))
}

// ProbBGreaterA returns the exact P(X_B > X_A) for X_A~Beta(aA,bA),
// X_B~Beta(aB,bB) (integer alphas). Sums over the smaller alpha for speed.
func ProbBGreaterA(aA, bA, aB, bB float64) float64 {
	if aB <= aA {
		return probSum(aA, bA, aB, bB)
	}
	return 1 - probSum(aB, bB, aA, bA)
}

// normalApprox is the Gaussian approximation of P(B>A) — only used as a fallback
// for very large counts where it coincides with the exact value.
func normalApprox(aA, bA, aB, bB float64) float64 {
	mA, vA := betaMoments(aA, bA)
	mB, vB := betaMoments(aB, bB)
	d := math.Sqrt(vA + vB)
	if d == 0 {
		return 0.5
	}
	return 0.5 * math.Erfc(-((mB - mA) / d) / math.Sqrt2)
}

func betaMoments(a, b float64) (mean, variance float64) {
	s := a + b
	return a / s, (a * b) / (s * s * (s + 1))
}
