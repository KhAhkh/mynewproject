import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import CustomerPicker from "../components/CustomerPicker";
import { useSync } from "../context/SyncContext";
import { toStorageDate } from "../utils/date";

const INPUT_TEXT_COLOR = "#0f172a";
const PLACEHOLDER_COLOR = "#0f172a";
const INPUT_SELECTION_COLOR = "#0f172a";

const paymentModes = ["cash", "online", "bank"];

const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: "#f7f9fc"
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 32
    },
    card: {
      backgroundColor: "#fff",
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "#e2e8f0"
    },
    label: {
      fontWeight: "600",
      marginBottom: 8,
      color: "#111827"
    },
    hint: {
      fontSize: 12,
      color: "#6b7280",
      marginBottom: 8
    },
    input: {
      borderWidth: 1,
      borderColor: "#d9e1ec",
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: "#fff",
      marginBottom: 12,
      color: INPUT_TEXT_COLOR
    },
    button: {
      backgroundColor: "#16a34a",
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: "center",
      marginTop: 12
    },
    buttonText: {
      color: "#fff",
      fontWeight: "600"
    },
    row: {
      flexDirection: "row",
      gap: 12
    },
    optionRow: {
      flexDirection: "row",
      gap: 10,
      marginBottom: 12
    },
    optionButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#d1d5db",
      borderRadius: 8,
      paddingVertical: 10,
      alignItems: "center",
      backgroundColor: "#fff"
    },
    optionButtonActive: {
      borderColor: "#16a34a",
      backgroundColor: "#dcfce7"
    },
    optionText: {
      fontWeight: "500",
      color: "#1f2937"
    },
    optionTextActive: {
      color: "#166534"
    },
    chip: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: "#dbeafe",
      marginBottom: 10
    },
    chipText: {
      fontSize: 12,
      fontWeight: "500",
      color: "#1d4ed8"
    },
    bankResult: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: "#e5e7eb",
      backgroundColor: "#f8fafc",
      marginBottom: 10
    },
    bankResultActive: {
      borderColor: "#16a34a",
      backgroundColor: "#dcfce7"
    },
    bankResultName: {
      fontWeight: "600",
      color: "#111827"
    },
    bankResultMeta: {
      fontSize: 12,
      color: "#4b5563",
      marginTop: 2
    },
    emptyState: {
      fontSize: 12,
      color: "#6b7280",
      marginTop: 6
    },
    bankMetaRow: {
      marginTop: 12
    },
    imagePreview: {
      width: 100,
      height: 100,
      borderRadius: 8,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: "#e2e8f0"
    },
    removeImageButton: {
      marginTop: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: "#fee2e2",
      alignItems: "center"
    },
    removeImageText: {
      color: "#991b1b",
      fontWeight: "500",
      fontSize: 12
    },
    uploadButton: {
      borderWidth: 2,
      borderColor: "#3b82f6",
      borderStyle: "dashed",
      borderRadius: 8,
      paddingVertical: 12,
      paddingHorizontal: 12,
      alignItems: "center",
      marginBottom: 12,
      backgroundColor: "#eff6ff"
    },
    uploadButtonText: {
      color: "#1d4ed8",
      fontWeight: "500"
    }
  });

const RecoveryFormScreen = () => {
    const { bundle, queueRecovery } = useSync();
    const [customerCode, setCustomerCode] = useState(null);
    const [amount, setAmount] = useState("");
    const [paymentMode, setPaymentMode] = useState("cash");
    const [details, setDetails] = useState("");
    const [bankCode, setBankCode] = useState("");
  const [slipNo, setSlipNo] = useState("");
  const [slipDate, setSlipDate] = useState("");
    const [bankSearch, setBankSearch] = useState("");
    const [hasImage, setHasImage] = useState("no");
    const [attachmentImage, setAttachmentImage] = useState(null);

    const customers = bundle?.customers ?? [];
    const banks = bundle?.banks ?? [];
    const selectedBank = banks.find((bank) => bank.code === bankCode) || null;

    const visibleBanks = useMemo(() => {
      if (!Array.isArray(banks) || banks.length === 0) {
        return [];
      }
      const trimmed = bankSearch.trim().toLowerCase();
      if (!trimmed) {
        return banks.slice(0, 8);
      }
      return banks.filter((bank) => {
        const nameMatch = bank.name?.toLowerCase().includes(trimmed);
        const codeMatch = bank.code?.toLowerCase().includes(trimmed);
        const accountMatch = typeof bank.accountNo === "string" && bank.accountNo.toLowerCase().includes(trimmed);
        return Boolean(nameMatch || codeMatch || accountMatch);
      });
    }, [bankSearch, banks]);

    const todayString = useCallback(() => toStorageDate(new Date()), []);

    const requestLibraryPermission = useCallback(async () => {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Allow photo access to attach receipts from gallery.");
        return false;
      }
      return true;
    }, []);

    const requestCameraPermission = useCallback(async () => {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission required", "Allow camera access to capture receipt photos.");
        return false;
      }
      return true;
    }, []);

    const handlePickedImage = useCallback((result) => {
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const base64Data = asset.base64 || "";
        if (base64Data) {
          setAttachmentImage(`data:image/jpeg;base64,${base64Data}`);
        } else if (asset.uri) {
          setAttachmentImage(asset.uri);
        }
      }
    }, []);

    const pickFromLibrary = useCallback(async () => {
      const hasPermission = await requestLibraryPermission();
      if (!hasPermission) return;

      try {
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.7,
          base64: true
        });

        handlePickedImage(result);
      } catch (error) {
        Alert.alert("Error", "Failed to pick image: " + (error?.message || "Unknown error"));
      }
    }, [handlePickedImage, requestLibraryPermission]);

    const pickFromCamera = useCallback(async () => {
      const hasPermission = await requestCameraPermission();
      if (!hasPermission) return;

      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 0.7,
          base64: true
        });

        handlePickedImage(result);
      } catch (error) {
        Alert.alert("Error", "Failed to capture image: " + (error?.message || "Unknown error"));
      }
    }, [handlePickedImage, requestCameraPermission]);

    const promptImageSource = useCallback(() => {
      Alert.alert("Add Image", "Choose how to attach the receipt.", [
        { text: "Camera", onPress: pickFromCamera },
        { text: "Gallery", onPress: pickFromLibrary },
        { text: "Cancel", style: "cancel" }
      ]);
    }, [pickFromCamera, pickFromLibrary]);

    const handlePaymentModeChange = (mode) => {
      setPaymentMode(mode);
      if (mode === "cash") {
        setBankCode("");
        setBankSearch("");
        setSlipNo("");
        setSlipDate("");
        setHasImage("no");
        setAttachmentImage(null);
        return;
      }
      setSlipDate(todayString());
    };

    const submit = async () => {
      if (!customerCode) {
        Alert.alert("Missing customer", "Select a customer.");
        return;
      }

      const normalizedAmount = amount.trim();
      if (!normalizedAmount) {
        Alert.alert("Missing amount", "Enter the amount received.");
        return;
      }

      const normalizedBankCode = paymentMode === "cash" ? null : bankCode.trim().toUpperCase();
      if (paymentMode !== "cash" && !normalizedBankCode) {
        Alert.alert("Bank required", "Select the bank for this payment.");
        return;
      }

      const normalizedSlipNo = paymentMode === "cash" ? "" : slipNo.trim();
      const normalizedSlipDate = paymentMode === "cash" ? "" : (slipDate?.trim() || todayString());

      if (paymentMode === "online" && !normalizedSlipNo) {
        Alert.alert("Transaction ID", "Enter the transaction reference for online payments.");
        return;
      }

      if (paymentMode === "bank") {
        if (!normalizedSlipNo) {
          Alert.alert("Slip number", "Enter the deposit slip number.");
          return;
        }
        if (!normalizedSlipDate) {
          Alert.alert("Slip date", "Enter the slip date (DD-MM-YYYY).");
          return;
        }
      }

      if (hasImage === "yes" && !attachmentImage && paymentMode !== "cash") {
        Alert.alert("Image required", "You selected 'Yes' for image. Please upload an image.");
        return;
      }

      try {
        console.log("Submitting recovery for customer:", customerCode, "amount:", normalizedAmount);
        const entry = await queueRecovery({
          customerCode,
          amount: normalizedAmount,
          paymentMode,
          details,
          bankCode: normalizedBankCode,
          slipNo: normalizedSlipNo,
          slipDate: normalizedSlipDate,
          attachmentImage: attachmentImage || null
        });
        console.log("Recovery queued successfully:", entry.reference);
        
        setAmount("");
        setDetails("");
        setBankCode("");
        setSlipNo("");
        setSlipDate("");
        setBankSearch("");
        setPaymentMode("cash");
        setHasImage("no");
        setAttachmentImage(null);
        Alert.alert("Queued", "Recovery added to offline queue.");
      } catch (error) {
        console.error("Error queueing recovery:", error);
        Alert.alert("Failed", error?.message || "Unable to queue recovery.");
      }
    };

    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View style={styles.card}>
              <Text style={styles.label}>Customer</Text>
              <CustomerPicker
                customers={customers}
                value={customerCode}
                onSelect={(customer) => setCustomerCode(customer.code)}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>Payment Details</Text>
              <Text style={styles.hint}>Record how much was collected and how it was received.</Text>
              <TextInput
                keyboardType="numeric"
                value={amount}
                onChangeText={setAmount}
                style={styles.input}
                placeholder="0.00"
                placeholderTextColor={PLACEHOLDER_COLOR}
                selectionColor={INPUT_SELECTION_COLOR}
                returnKeyType="done"
              />
              <View style={styles.optionRow}>
                {paymentModes.map((mode) => {
                  const active = paymentMode === mode;
                  return (
                    <TouchableOpacity
                      key={mode}
                      onPress={() => handlePaymentModeChange(mode)}
                      style={[styles.optionButton, active && styles.optionButtonActive]}
                    >
                      <Text style={[styles.optionText, active && styles.optionTextActive]}>{mode.toUpperCase()}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TextInput
                value={details}
                onChangeText={setDetails}
                style={styles.input}
                placeholder="Optional remarks"
                placeholderTextColor={PLACEHOLDER_COLOR}
                selectionColor={INPUT_SELECTION_COLOR}
                multiline
              />
            </View>

            {paymentMode !== "cash" ? (
              <View style={styles.card}>
                <Text style={styles.label}>Bank Information</Text>
                <Text style={styles.hint}>
                  Select the bank account used for the {paymentMode} payment. Start typing to narrow the list.
                </Text>
                {selectedBank ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      {selectedBank.name} ({selectedBank.code})
                      {selectedBank.accountNo ? ` • ${selectedBank.accountNo}` : ""}
                    </Text>
                  </View>
                ) : null}
                <TextInput
                  value={bankSearch}
                  onChangeText={setBankSearch}
                  style={styles.input}
                  placeholder="Search by name or code"
                  autoCapitalize="none"
                  placeholderTextColor={PLACEHOLDER_COLOR}
                  selectionColor={INPUT_SELECTION_COLOR}
                />
                {visibleBanks.map((bank) => {
                  const active = bank.code === bankCode;
                  return (
                    <TouchableOpacity
                      key={bank.code}
                      style={[styles.bankResult, active && styles.bankResultActive]}
                      onPress={() => {
                        setBankCode(bank.code);
                        setBankSearch("");
                      }}
                    >
                      <Text style={styles.bankResultName}>{bank.name}</Text>
                      <Text style={styles.bankResultMeta}>
                        {bank.code}
                        {bank.accountNo ? ` • ${bank.accountNo}` : ""}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                {visibleBanks.length === 0 ? <Text style={styles.emptyState}>No banks match the search.</Text> : null}
                <View style={[styles.row, styles.bankMetaRow]}>
                  <TextInput
                    value={slipNo}
                    onChangeText={setSlipNo}
                    style={[styles.input, { flex: 1 }]}
                    placeholder={paymentMode === "online" ? "Transaction ID" : "Slip number"}
                    autoCapitalize="characters"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                    selectionColor={INPUT_SELECTION_COLOR}
                  />
                  <TextInput
                    value={slipDate}
                    onChangeText={setSlipDate}
                    style={[styles.input, { flex: 1 }]}
                    placeholder="DD-MM-YYYY"
                    autoCapitalize="characters"
                    placeholderTextColor={PLACEHOLDER_COLOR}
                    selectionColor={INPUT_SELECTION_COLOR}
                  />
                </View>
              </View>
            ) : null}

            {paymentMode !== "cash" ? (
              <View style={styles.card}>
                <Text style={styles.label}>Attachment</Text>
                <Text style={styles.hint}>Do you have an image to attach to this recovery?</Text>
                <View style={styles.optionRow}>
                  {["no", "yes"].map((option) => {
                    const active = hasImage === option;
                    return (
                      <TouchableOpacity
                        key={option}
                        onPress={() => {
                          setHasImage(option);
                          if (option === "no") {
                            setAttachmentImage(null);
                          }
                        }}
                        style={[styles.optionButton, active && styles.optionButtonActive]}
                      >
                        <Text style={[styles.optionText, active && styles.optionTextActive]}>{option.toUpperCase()}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {hasImage === "yes" ? (
                  <>
                    {attachmentImage ? (
                      <View>
                        <Image source={{ uri: attachmentImage }} style={styles.imagePreview} />
                        <TouchableOpacity
                          onPress={() => setAttachmentImage(null)}
                          style={styles.removeImageButton}
                        >
                          <Text style={styles.removeImageText}>Remove Image</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={promptImageSource} style={styles.uploadButton}>
                        <Text style={styles.uploadButtonText}>+ Upload Image</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : null}
              </View>
            ) : null}

            <TouchableOpacity onPress={submit} style={styles.button}>
              <Text style={styles.buttonText}>Add to Queue</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  };

export default RecoveryFormScreen;
