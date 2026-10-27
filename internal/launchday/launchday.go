// Package launchday holds the window of Radar's Product Hunt launch, when
// Radar's own prompts step aside for the launch notice.
package launchday

import "time"

// Product Hunt's day runs midnight to midnight Pacific; PDT is UTC-7 until Nov 1.
var (
	start = time.Date(2026, time.October, 29, 7, 0, 0, 0, time.UTC)
	end   = start.Add(24 * time.Hour)
)

// ProductHunt reports whether t falls on the Product Hunt launch day.
func ProductHunt(t time.Time) bool {
	return !t.Before(start) && t.Before(end)
}
