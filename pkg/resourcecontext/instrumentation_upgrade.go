package resourcecontext

import (
	"sort"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
)

func instrumentationUpgradeRecord(obj runtime.Object) *InstrumentationUpgradeRecord {
	u, ok := obj.(*unstructured.Unstructured)
	if !ok || u == nil || u.GroupVersionKind().Group != "opentelemetry.io" || u.GetKind() != "Instrumentation" || u.GetDeletionTimestamp() != nil {
		return nil
	}
	blocked, _, _ := unstructured.NestedMap(u.Object, "status", "upgradeBlockedVersions")
	if len(blocked) == 0 {
		return nil
	}
	names := make([]string, 0, len(blocked))
	for language := range blocked {
		names = append(names, language)
	}
	sort.Strings(names)
	out := &InstrumentationUpgradeRecord{RecordedBlockCount: len(names)}
	if len(names) > 10 {
		names = names[:10]
		out.Truncated = true
	}
	for _, language := range names {
		short := truncateRunes(language, 160)
		entry := InstrumentationUpgradeBlock{Language: short}
		out.RecordedBlocks = append(out.RecordedBlocks, entry)
	}
	return out
}
