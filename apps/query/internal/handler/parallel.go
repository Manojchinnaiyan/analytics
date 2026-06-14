package handler

import "sync"

// maxQueryFanout caps how many of a single request's queries run at once. Fanning
// out every read query per request speeds up that request, but without a cap a
// page that issues ~15 queries would grab ~15 ClickHouse connections at once —
// and a handful of concurrent users would then exhaust the pool. Capping the
// fan-out keeps each request fast while leaving connections for other users.
const maxQueryFanout = 6

// parallel runs the given functions concurrently (bounded by maxQueryFanout) and
// blocks until all have finished. Use it to replace sequential, INDEPENDENT
// queries in a handler — each fn must write only its own variables (no shared
// mutable state) so there is no data race.
//
//	var a, b int
//	parallel(
//		func() { a = queryA() },
//		func() { b = queryB() },
//	)
//	// a and b are both populated here
func parallel(fns ...func()) {
	if len(fns) == 0 {
		return
	}
	if len(fns) == 1 {
		fns[0]() // no goroutine needed for a single task
		return
	}
	sem := make(chan struct{}, maxQueryFanout)
	var wg sync.WaitGroup
	for _, fn := range fns {
		wg.Add(1)
		go func(f func()) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			f()
		}(fn)
	}
	wg.Wait()
}
