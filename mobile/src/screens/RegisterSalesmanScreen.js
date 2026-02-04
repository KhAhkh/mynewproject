import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { useAuth } from "../context/AuthContext";
import { createApiClient } from "../services/api";

const INPUT_TEXT_COLOR = "#0f172a";
const PLACEHOLDER_COLOR = "#94a3b8";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f9fc"
  },
  content: {
    flexGrow: 1,
    padding: 24
  },
  headline: {
    fontSize: 22,
    fontWeight: "600",
    marginBottom: 12,
    textAlign: "center"
  },
  description: {
    fontSize: 13,
    color: "#475569",
    marginBottom: 24,
    textAlign: "center"
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginBottom: 8
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d9e1ec",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
    color: INPUT_TEXT_COLOR
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16
  },
  cancelButton: {
    marginTop: 16,
    alignItems: "center"
  },
  cancelText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "500"
  }
});

const RegisterSalesmanScreen = ({ navigation }) => {
  const { serverUrl } = useAuth();
  const [url, setUrl] = useState(serverUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [salesmanId, setSalesmanId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUrl(serverUrl);
  }, [serverUrl]);

  const handleSubmit = async () => {
    const trimmedUrl = url?.trim();
    const trimmedUsername = username?.trim();

    if (!trimmedUrl || !trimmedUsername || !password || !confirmPassword) {
      Alert.alert("Missing information", "Please complete all required fields.");
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert("Password mismatch", "Password and confirmation must match.");
      return;
    }

    let parsedSalesmanId = null;
    if (salesmanId) {
      const parsedValue = Number.parseInt(salesmanId, 10);
      if (Number.isNaN(parsedValue)) {
        Alert.alert("Invalid salesman ID", "Enter digits only, or leave the field blank.");
        return;
      }
      parsedSalesmanId = parsedValue;
    }

    setSubmitting(true);
    try {
      const client = createApiClient(trimmedUrl);
      await client.registerSalesman({
        username: trimmedUsername,
        password,
        salesmanId: parsedSalesmanId
      });
      Alert.alert("Success", "Salesman account created.", [
        {
          text: "OK",
          onPress: () => navigation.goBack()
        }
      ]);
    } catch (error) {
      const message = error?.message || "Unable to register salesman.";
      Alert.alert("Registration failed", message);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.headline}>Register Salesman</Text>
          <Text style={styles.description}>Create a salesman login to enable mobile sync and order capture.</Text>

          <Text style={styles.label}>Server URL</Text>
          <TextInput
            accessibilityLabel="Server URL"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://192.168.0.10:4000"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            accessibilityLabel="Username"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="salesman"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            accessibilityLabel="Password"
            secureTextEntry
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            accessibilityLabel="Confirm Password"
            secureTextEntry
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="••••••••"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />

          <Text style={styles.label}>Salesman ID (optional)</Text>
          <TextInput
            accessibilityLabel="Salesman ID"
            keyboardType="number-pad"
            style={styles.input}
            value={salesmanId}
            onChangeText={setSalesmanId}
            placeholder="123"
            placeholderTextColor={PLACEHOLDER_COLOR}
          />

          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleSubmit}
            disabled={disabled}
            style={[styles.button, disabled && { opacity: 0.6 }]}
          >
            {disabled ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation.goBack()}
            disabled={disabled}
            style={styles.cancelButton}
          >
            <Text style={styles.cancelText}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default RegisterSalesmanScreen;
