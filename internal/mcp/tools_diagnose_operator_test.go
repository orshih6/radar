package mcp

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/skyhook-io/radar/internal/k8s"
	"github.com/skyhook-io/radar/pkg/ownership"
	"github.com/skyhook-io/radar/pkg/resourceid"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	"k8s.io/client-go/kubernetes/fake"
)

func TestOperatorDiagnoseUsesObservedOwnership(t *testing.T) {
	t.Cleanup(k8s.ResetTestState)
	t.Cleanup(k8s.ResetTestDynamicState)
	yes, zero := true, int32(0)
	root := &unstructured.Unstructured{Object: map[string]any{"apiVersion": "opentelemetry.io/v1beta1", "kind": "OpenTelemetryCollector", "metadata": map[string]any{"name": "collector", "namespace": "observe", "uid": "root"}, "spec": map[string]any{"mode": "deployment", "config": map[string]any{}}}}
	child := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Name: "actual-name", Namespace: "observe", UID: "child", OwnerReferences: []metav1.OwnerReference{{APIVersion: "opentelemetry.io/v1beta1", Kind: "OpenTelemetryCollector", Name: "collector", UID: "root", Controller: &yes}}}, Spec: appsv1.DeploymentSpec{Replicas: &zero, Selector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "collector"}}}}
	decoy := child.DeepCopy()
	decoy.Name = "collector-collector"
	decoy.UID = "decoy"
	decoy.OwnerReferences[0].UID = "previous-root"
	if err := k8s.InitTestResourceCache(fake.NewClientset(child, decoy)); err != nil {
		t.Fatal(err)
	}
	gvr := schema.GroupVersionResource{Group: "opentelemetry.io", Version: "v1beta1", Resource: "opentelemetrycollectors"}
	dyn := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(runtime.NewScheme(), map[schema.GroupVersionResource]string{gvr: "OpenTelemetryCollectorList"}, root)
	if err := k8s.InitTestDynamicResourceCache(dyn, []k8s.APIResource{{Group: gvr.Group, Version: gvr.Version, Name: gvr.Resource, Kind: root.GetKind(), Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}, {Group: "apps", Version: "v1", Name: "deployments", Kind: "Deployment", Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}, {Group: "apps", Version: "v1", Name: "statefulsets", Kind: "StatefulSet", Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}, {Group: "apps", Version: "v1", Name: "daemonsets", Kind: "DaemonSet", Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}, {Group: "example.io", Version: "v1", Name: "widgets", Kind: "Widget", Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}, {Group: "apps", Version: "v1", Name: "replicasets", Kind: "ReplicaSet", Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}, {Version: "v1", Name: "pods", Kind: "Pod", Namespaced: true, Verbs: []string{"get", "list", "watch", "delete"}}}); err != nil {
		t.Fatal(err)
	}
	dc := k8s.GetDynamicResourceCache()
	if err := dc.EnsureWatching(gvr); err != nil || !dc.WaitForSync(gvr, 2*time.Second) {
		t.Fatalf("root not synced: %v", err)
	}
	result, _, err := handleDiagnose(context.Background(), nil, testDiagnoseInput("opentelemetrycollector", "observe", "collector"))
	if err != nil {
		t.Fatal(err)
	}
	var got operatorDiagnoseResponse
	if err := json.Unmarshal([]byte(extractText(t, result)), &got); err != nil {
		t.Fatal(err)
	}
	if len(got.OwnedWorkloads) != 1 || got.OwnedWorkloads[0].Ref.Name != "actual-name" || got.OwnedWorkloads[0].Diagnosis == nil || got.OwnedWorkloads[0].Error != "" {
		t.Fatalf("wrong runtime bundle: %s", extractText(t, result))
	}
	if got.OwnedWorkloads[0].Diagnosis.Pods != 0 {
		t.Fatal("scaled-to-zero workload gained Pods")
	}
	if got.ResourceContext == nil || got.ResourceContext.Children == nil {
		t.Fatal("root lost followable owned refs")
	}
	if _, _, err := handleDiagnose(context.Background(), nil, diagnoseInput{diagnoseCommonInput: diagnoseCommonInput{Kind: "OpenTelemetryCollector", Group: "foreign.example", Namespace: "observe", Name: "collector"}}); err == nil {
		t.Fatal("foreign root was accepted")
	}
}

func TestOwnedWorkloadBundleRequiresCurrentControllerUID(t *testing.T) {
	yes := true
	root := ownership.Observation{Ref: resourceid.Ref{Group: "opentelemetry.io", Kind: "OpenTelemetryCollector", Namespace: "observe", Name: "collector"}, UID: "root"}
	u := &appsv1.Deployment{ObjectMeta: metav1.ObjectMeta{Namespace: "observe", OwnerReferences: []metav1.OwnerReference{{APIVersion: "opentelemetry.io/v1beta1", Kind: "OpenTelemetryCollector", Name: "collector", UID: "root", Controller: &yes}}}}
	if !ownedByOperator(u, root) {
		t.Fatal("current owned workload rejected")
	}
	u.OwnerReferences[0].UID = "old-root"
	if ownedByOperator(u, root) {
		t.Fatal("prior incarnation accepted")
	}
	u.OwnerReferences[0].UID = "root"
	u.OwnerReferences[0].APIVersion = "other.example/v1"
	if ownedByOperator(u, root) {
		t.Fatal("foreign-group owner accepted")
	}
	u.OwnerReferences[0].APIVersion = "opentelemetry.io/v1beta1"
	u.OwnerReferences[0].Controller = nil
	if ownedByOperator(u, root) {
		t.Fatal("non-controller ownership attributed as runtime")
	}
}
