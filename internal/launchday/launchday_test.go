package launchday

import (
	"testing"
	"time"
)

func TestProductHunt(t *testing.T) {
	pdt := time.FixedZone("PDT", -7*60*60)
	cases := []struct {
		at   time.Time
		want bool
	}{
		{time.Date(2026, time.October, 28, 23, 59, 59, 0, pdt), false},
		{time.Date(2026, time.October, 29, 0, 0, 0, 0, pdt), true},
		{time.Date(2026, time.October, 29, 23, 59, 59, 0, pdt), true},
		{time.Date(2026, time.October, 30, 0, 0, 0, 0, pdt), false},
	}
	for _, c := range cases {
		if got := ProductHunt(c.at); got != c.want {
			t.Errorf("ProductHunt(%s) = %v, want %v", c.at, got, c.want)
		}
	}
}
