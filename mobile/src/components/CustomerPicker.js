import React, { useMemo, useState } from "react";
import { FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

const INPUT_TEXT_COLOR = "#0f172a";
const PLACEHOLDER_COLOR = "#0f172a";
const INPUT_SELECTION_COLOR = "#0f172a";

const styles = StyleSheet.create({
  trigger: {
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#fff"
  },
  triggerText: {
    color: "#111827"
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.4)",
    justifyContent: "center",
    padding: 16
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    maxHeight: "80%",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: INPUT_TEXT_COLOR
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0"
  },
  listName: {
    fontWeight: "600",
    marginBottom: 2,
    color: "#0f172a"
  },
  listMeta: {
    fontSize: 12,
    color: "#475569"
  }
});

const CustomerPicker = ({ customers, value, onSelect, placeholder = "Select customer" }) => {
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState("");

  const selected = useMemo(() => customers.find((item) => item.code === value), [customers, value]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((customer) => {
      return (
        customer.code.toLowerCase().includes(needle) ||
        customer.name.toLowerCase().includes(needle) ||
        (customer.areaName || "").toLowerCase().includes(needle)
      );
    });
  }, [customers, query]);

  const handleSelect = (customer) => {
    onSelect?.(customer);
    setVisible(false);
    setQuery("");
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={() => setVisible(true)}
        style={styles.trigger}
      >
        <Text style={[styles.triggerText, !selected && { color: "#94a3b8" }]}>
          {selected ? `${selected.code} — ${selected.name}` : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal animationType="fade" transparent visible={visible} onRequestClose={() => setVisible(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <TextInput
              accessibilityLabel="Search customers"
              autoFocus
              placeholder="Search..."
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholderTextColor={PLACEHOLDER_COLOR}
              selectionColor={INPUT_SELECTION_COLOR}
            />

            <FlatList
              keyboardShouldPersistTaps="handled"
              data={filtered}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => handleSelect(item)}
                  style={styles.listItem}
                >
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={styles.listMeta}>{item.code}</Text>
                  {item.areaName ? <Text style={styles.listMeta}>{item.areaName}</Text> : null}
                  <Text style={styles.listMeta}>
                    Outstanding: {item.outstanding ? item.outstanding.toLocaleString() : "0"}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

export default CustomerPicker;
