import React, { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSync } from "../context/SyncContext";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f9fc"
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff"
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#0f172a"
  },
  item: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0"
  },
  reference: {
    fontWeight: "600",
    marginBottom: 6,
    color: "#0f172a"
  },
  status: {
    fontSize: 12
  }
});

const SyncStatusScreen = () => {
  const { syncStatus, syncError, refreshBundle } = useSync();
  const [isRefreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshBundle().catch(() => {
        // syncError already set inside refreshBundle
      });
    }, [refreshBundle])
  );

  const handleRefresh = useCallback(async () => {
    if (isRefreshing) return;
    setRefreshing(true);
    try {
      await refreshBundle();
    } catch (error) {
      // refreshBundle already surfaces the error via syncError
    } finally {
      setRefreshing(false);
    }
  }, [isRefreshing, refreshBundle]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sync Status</Text>
        {syncError ? <Text style={{ color: "#dc2626", marginTop: 4 }}>{syncError}</Text> : null}
      </View>
      <FlatList
        data={syncStatus}
        keyExtractor={(item, index) => `${item.client_reference}-${index}`}
        contentContainerStyle={{ paddingBottom: 32, paddingTop: 8 }}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#0f172a" />
        }
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text style={styles.reference}>{item.client_reference}</Text>
            <Text>{item.entity_type}</Text>
            <Text style={[styles.status, { color: item.status === "success" ? "#16a34a" : "#dc2626" }]}>
              {item.status}
            </Text>
            {item.last_error ? <Text style={styles.status}>{item.last_error}</Text> : null}
          </View>
        )}
      />
    </SafeAreaView>
  );
};

export default SyncStatusScreen;
