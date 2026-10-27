package resourcecontext

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestInstrumentationUpgradeIsARecordedBoundedAdvisory(t *testing.T) {
	u := &unstructured.Unstructured{Object: map[string]any{"apiVersion": "opentelemetry.io/v1alpha1", "kind": "Instrumentation", "metadata": map[string]any{"name": "java", "namespace": "app", "annotations": map[string]any{"instrumentation.opentelemetry.io/default-auto-instrumentation-java-image": "private-default-image"}}, "spec": map[string]any{"java": map[string]any{"image": "private-current-image"}}, "status": map[string]any{"upgradeBlockedVersions": map[string]any{"java": "private-status-message"}}}}
	got := Build(context.Background(), u, Options{}).InstrumentationUpgrade
	if got == nil || got.RecordedBlockCount != 1 || len(got.RecordedBlocks) != 1 || got.RecordedBlocks[0].AutoInstrumentationImageMatchesStoredDefault == nil || *got.RecordedBlocks[0].AutoInstrumentationImageMatchesStoredDefault {
		t.Fatalf("wrong record: %+v", got)
	}
	_ = unstructured.SetNestedField(u.Object, "private-default-image", "spec", "java", "image")
	got = Build(context.Background(), u, Options{}).InstrumentationUpgrade
	if got == nil || !*got.RecordedBlocks[0].AutoInstrumentationImageMatchesStoredDefault {
		t.Fatal("manual image change removed historical record or comparison")
	}
	raw, _ := json.Marshal(got)
	if strings.Contains(string(raw), "private-") {
		t.Fatalf("raw image/status value leaked: %s", raw)
	}
	blocked := map[string]any{}
	for n := range 30 {
		blocked[fmt.Sprintf("language-%02d", n)] = "private-status-message"
	}
	_ = unstructured.SetNestedMap(u.Object, blocked, "status", "upgradeBlockedVersions")
	got = Build(context.Background(), u, Options{}).InstrumentationUpgrade
	if got.RecordedBlockCount != 30 || len(got.RecordedBlocks) != 10 || !got.Truncated {
		t.Fatalf("unbounded record: %+v", got)
	}
	u.SetAPIVersion("other.example/v1")
	if instrumentationUpgradeRecord(u) != nil {
		t.Fatal("foreign Instrumentation got native advisory")
	}
	u.SetAPIVersion("opentelemetry.io/v1alpha1")
	now := metav1.Now()
	u.SetDeletionTimestamp(&now)
	if instrumentationUpgradeRecord(u) != nil {
		t.Fatal("deleting configuration got upgrade advisory")
	}
}
