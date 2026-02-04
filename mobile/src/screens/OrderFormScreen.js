import React, { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSync } from "../context/SyncContext";
import CustomerPicker from "../components/CustomerPicker";

const INPUT_TEXT_COLOR = "#0f172a";
const PLACEHOLDER_COLOR = "#0f172a";
const INPUT_SELECTION_COLOR = "#0f172a";

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
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 32
  },
  formSection: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0"
  },
  fieldLabel: {
    marginBottom: 8,
    fontWeight: "600",
    color: "#111827"
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: INPUT_TEXT_COLOR
  },
  itemCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#d9e1ec"
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: "#d9e1ec",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    color: INPUT_TEXT_COLOR
  },
  smallInputGroup: {
    flexDirection: "row",
    gap: 10
  },
  addButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center"
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600"
  },
  addItemButton: {
    marginTop: 12,
    backgroundColor: "#16a34a",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  addItemButtonText: {
    color: "#fff",
    fontWeight: "600"
  },
  helperText: {
    fontSize: 12,
    color: "#475569",
    marginTop: 6
  }
});

const OrderFormScreen = () => {
  const { bundle, queueOrder } = useSync();
  const [customerCode, setCustomerCode] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [items, setItems] = useState([]);
  const [itemCode, setItemCode] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [bonus, setBonus] = useState("0");
  const [itemSearch, setItemSearch] = useState("");

  const customers = bundle?.customers ?? [];
  const itemOptions = useMemo(() => bundle?.items ?? [], [bundle]);
  const filteredItems = useMemo(() => {
    if (!itemOptions.length) {
      return [];
    }
    const query = itemSearch.trim().toLowerCase();
    if (!query) {
      return itemOptions.slice(0, 15);
    }
    return itemOptions
      .filter((item) =>
        item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query)
      )
      .slice(0, 15);
  }, [itemOptions, itemSearch]);

  const addItem = () => {
    if (!itemCode) {
      Alert.alert("Select item", "Choose an item from the list before adding.");
      return;
    }
    const item = itemOptions.find((option) => option.code === itemCode);
    if (!item) {
      Alert.alert("Missing item", "Select a valid item code.");
      return;
    }

    const numericQuantity = Number(quantity);
    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      Alert.alert("Invalid quantity", "Enter a quantity greater than zero.");
      return;
    }

    const numericBonus = Number(bonus);
    if (!Number.isFinite(numericBonus) || numericBonus < 0) {
      Alert.alert("Invalid bonus", "Bonus cannot be negative.");
      return;
    }

    setItems((prev) => [
      ...prev,
      {
        itemCode: item.code,
        itemName: item.name,
        quantity: numericQuantity,
        bonus: numericBonus,
        baseUnit: item.baseUnit
      }
    ]);

    setItemCode("");
    setItemSearch("");
    setQuantity("1");
    setBonus("0");
  };

  const removeItem = (code) => {
    setItems((prev) => prev.filter((entry) => entry.itemCode !== code));
  };

  const submitOrder = async () => {
    if (!customerCode) {
      Alert.alert("Missing customer", "Select a customer first.");
      return;
    }

    if (items.length === 0) {
      Alert.alert("Add items", "Include at least one item in the order.");
      return;
    }

    try {
      await queueOrder({
        customerCode,
        items,
        remarks
      });
      setRemarks("");
      setItems([]);
      Alert.alert("Queued", "Order added to offline queue.");
    } catch (error) {
      Alert.alert("Failed", error?.message || "Unable to queue order.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>New Order</Text>
      </View>
      <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Customer</Text>
            <CustomerPicker
              customers={customers}
              value={customerCode}
              onSelect={(customer) => setCustomerCode(customer.code)}
            />
            <Text style={styles.helperText}>
              Choose the customer to populate outstanding balance and route info.
            </Text>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Current Items</Text>
            {items.length === 0 ? (
              <Text style={styles.helperText}>No items added yet. Use the form below to include them.</Text>
            ) : (
              items.map((item) => (
                <View key={item.itemCode} style={styles.itemCard}>
                  <View style={styles.itemRow}>
                    <Text style={{ fontWeight: "600", color: "#0f172a" }}>{item.itemName}</Text>
                    <TouchableOpacity onPress={() => removeItem(item.itemCode)}>
                      <Text style={{ color: "#dc2626", fontWeight: "600" }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ color: "#475569", fontSize: 12 }}>Code: {item.itemCode}</Text>
                  <Text style={{ color: "#475569", fontSize: 12 }}>Quantity: {item.quantity}</Text>
                  <Text style={{ color: "#475569", fontSize: 12 }}>Bonus: {item.bonus}</Text>
                  <Text style={{ color: "#475569", fontSize: 12 }}>Unit: {item.baseUnit}</Text>
                </View>
              ))
            )}
          </View>

          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Add Item</Text>
            <TextInput
              placeholder="Search by code or name"
              value={itemSearch}
              onChangeText={(value) => {
                setItemSearch(value);
                if (!value) {
                  setItemCode("");
                  return;
                }
                const trimmed = value.trim().toLowerCase();
                const directMatch = itemOptions.find(
                  (option) => option.code.toLowerCase() === trimmed
                );
                if (directMatch) {
                  setItemCode(directMatch.code);
                } else {
                  setItemCode("");
                }
              }}
              style={[styles.input, { marginBottom: 10 }]}
              autoCapitalize="characters"
              placeholderTextColor={PLACEHOLDER_COLOR}
              selectionColor={INPUT_SELECTION_COLOR}
            />
            {itemOptions.length === 0 ? (
              <Text style={styles.helperText}>No items available. Sync from the office network first.</Text>
            ) : (
              <View
                style={{
                  marginBottom: 12,
                  borderWidth: filteredItems.length ? StyleSheet.hairlineWidth : 0,
                  borderColor: "#e2e8f0",
                  borderRadius: 10,
                  overflow: "hidden",
                  maxHeight: 220
                }}
              >
                {filteredItems.length === 0 ? (
                  <Text style={[styles.helperText, { padding: 8 }]}>No matches. Adjust your search.</Text>
                ) : (
                  filteredItems.map((item) => (
                    <TouchableOpacity
                      key={item.code}
                      onPress={() => {
                        setItemCode(item.code);
                        setItemSearch(`${item.name} (${item.code})`);
                      }}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: "#e2e8f0",
                        backgroundColor: item.code === itemCode ? "#e0f2fe" : "#f8fafc"
                      }}
                    >
                      <Text style={{ fontWeight: "600", color: "#0f172a" }}>{item.name}</Text>
                      <Text style={{ color: "#475569", fontSize: 12 }}>Code: {item.code}</Text>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}
            <View style={styles.smallInputGroup}>
              <TextInput
                placeholder="Qty"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="numeric"
                style={[styles.input, { flex: 1 }]}
                placeholderTextColor={PLACEHOLDER_COLOR}
                selectionColor={INPUT_SELECTION_COLOR}
              />
              <TextInput
                placeholder="Bonus"
                value={bonus}
                onChangeText={setBonus}
                keyboardType="numeric"
                style={[styles.input, { flex: 1 }]}
                placeholderTextColor={PLACEHOLDER_COLOR}
                selectionColor={INPUT_SELECTION_COLOR}
              />
            </View>
            <Text style={styles.helperText}>Use numeric values only. Bonus defaults to zero.</Text>
            <TouchableOpacity style={styles.addItemButton} onPress={addItem}>
              <Text style={styles.addItemButtonText}>Add Item</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.fieldLabel}>Remarks</Text>
            <TextInput
              multiline
              numberOfLines={4}
              style={styles.textArea}
              value={remarks}
              onChangeText={setRemarks}
              placeholder="Optional notes"
              textAlignVertical="top"
              placeholderTextColor={PLACEHOLDER_COLOR}
              selectionColor={INPUT_SELECTION_COLOR}
            />
          </View>

          <TouchableOpacity style={styles.addButton} onPress={submitOrder}>
            <Text style={styles.addButtonText}>Add to Queue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default OrderFormScreen;
