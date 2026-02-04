import React, { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSync } from "../context/SyncContext";
import { useAuth } from "../context/AuthContext";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f9fc"
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 28
  },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 10,
    color: "#0f172a"
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8
  },
  summaryCell: {
    width: "50%",
    paddingHorizontal: 8,
    marginBottom: 10
  },
  summaryLabel: {
    fontSize: 12,
    color: "#475569",
    marginBottom: 4
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827"
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6
  },
  infoLabel: {
    color: "#475569",
    fontSize: 13
  },
  infoValue: {
    fontWeight: "600",
    color: "#111827"
  },
  syncItem: {
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0"
  },
  syncReference: {
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 2,
    fontSize: 13
  },
  syncMessage: {
    color: "#475569",
    fontSize: 12
  },
  syncStatus: {
    marginTop: 4,
    fontSize: 12
  }
});

const resolveStatusPresentation = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "error" || normalized === "rejected") {
    return { color: "#dc2626", label: status || "Error" };
  }
  if (normalized === "pending") {
    return { color: "#d97706", label: "Pending approval" };
  }
  if (normalized === "duplicate") {
    return { color: "#0f766e", label: "Duplicate" };
  }
  return { color: "#16a34a", label: status || "Success" };
};

const SyncStatusItem = ({ item, onRemove }) => {
  const { color, label } = resolveStatusPresentation(item.status);
  const isLocal = item._isLocal === true;
  
  return (
    <View style={[styles.syncItem, { flexDirection: 'row', alignItems: 'center' }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.syncReference}>{item.client_reference}</Text>
        <Text style={styles.syncMessage}>{item.entity_type}</Text>
        <Text style={[styles.syncStatus, { color }]}>{label}</Text>
        {item.last_error ? <Text style={styles.syncStatus}>{item.last_error}</Text> : null}
      </View>
      {isLocal && onRemove ? (
        <TouchableOpacity
          onPress={() => onRemove(item.client_reference)}
          style={{
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: "#dc2626",
            borderRadius: 4,
            marginLeft: 12,
            flexShrink: 0
          }}
        >
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

const DashboardScreen = () => {
  const { bundle, refreshBundle, syncStatus, lastSyncAt, queue, syncError, removeFromQueue } = useSync();
  const { user } = useAuth();
  const [isRefreshing, setRefreshing] = useState(false);

  const summary = useMemo(() => {
    return bundle?.summary ?? { totalCustomers: 0, totalOutstanding: 0, totalItems: 0 };
  }, [bundle]);

  const waitingCount = queue?.length ?? 0;

  const handleRemoveQueueItem = useCallback(
    (reference) => {
      Alert.alert(
        "Cancel Entry",
        "Remove this entry from the queue? This cannot be undone.",
        [
          { text: "Keep", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              removeFromQueue(reference);
            }
          }
        ]
      );
    },
    [removeFromQueue]
  );

  // Combine queue items (pending) with sync status from server
  const allItems = useMemo(() => {
    console.log("[Dashboard] Queue has", queue?.length || 0, "items:", queue?.map(q => q.reference));
    console.log("[Dashboard] SyncStatus has", syncStatus?.length || 0, "items");
    
    const queueItems = (queue || []).map((entry) => ({
      client_reference: entry.reference,
      entity_type: entry.type === "recovery" ? "recovery" : "order",
      status: "pending",
      last_error: null,
      _isLocal: true
    }));
    
    const serverItems = syncStatus || [];
    const combined = [...queueItems, ...serverItems];
    console.log("[Dashboard] Combined display items:", combined.length, "total");
    
    return combined;
  }, [queue, syncStatus]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshBundle();
    } finally {
      setRefreshing(false);
    }
  }, [refreshBundle]);

  // Refresh data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      refreshBundle().catch(() => {
        // syncError already set inside refreshBundle
      });
    }, [refreshBundle])
  );

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={allItems}
        keyExtractor={(item, index) => {
          const key = `${item.client_reference || item._isLocal ? 'local' : 'server'}-${index}`;
          console.log("[Dashboard] Generating key for item:", key);
          return key;
        }}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#0f172a" />
        }
        ListHeaderComponent={
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Welcome</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Salesman</Text>
                <Text style={styles.infoValue}>{user?.username ?? ""}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Salesman ID</Text>
                <Text style={styles.infoValue}>{user?.salesman_id ? `ID: ${user.salesman_id}` : "Not assigned"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Sync</Text>
                <Text style={styles.infoValue}>{lastSyncAt ? new Date(lastSyncAt).toLocaleString() : "Never"}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Pending Uploads</Text>
                <Text style={styles.infoValue}>{waitingCount}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Customers</Text>
                  <Text style={styles.summaryValue}>{summary.totalCustomers}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Outstanding</Text>
                  <Text style={styles.summaryValue}>
                    {summary.totalOutstanding ? summary.totalOutstanding.toLocaleString() : "0"}
                  </Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Items</Text>
                  <Text style={styles.summaryValue}>{summary.totalItems}</Text>
                </View>
                <View style={styles.summaryCell}>
                  <Text style={styles.summaryLabel}>Pending Uploads</Text>
                  <Text style={styles.summaryValue}>{waitingCount}</Text>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recent Sync</Text>
              {syncError ? (
                <Text style={[styles.syncStatus, { color: "#dc2626" }]}>{syncError}</Text>
              ) : allItems.length === 0 ? (
                <Text style={[styles.syncStatus, { color: "#6b7280" }]}>No pending or synced entries</Text>
              ) : null}
            </View>
          </>
        }
        renderItem={({ item }) => <SyncStatusItem item={item} onRemove={handleRemoveQueueItem} />}
        ListEmptyComponent={
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#6b7280", textAlign: "center" }}>No pending or synced entries yet</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

export default DashboardScreen;
