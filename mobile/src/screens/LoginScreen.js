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

const INPUT_TEXT_COLOR = "#0f172a";
const PLACEHOLDER_COLOR = "#94a3b8";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f9fc"
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center"
  },
  headline: {
    fontSize: 24,
    fontWeight: "600",
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
    marginTop: 8
  },
  buttonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16
  },
  footer: {
    marginTop: 24,
    alignItems: "center"
  },
  footerText: {
    color: "#64748b",
    fontSize: 12
  },
  secondaryButton: {
    marginTop: 16,
    alignItems: "center"
  },
  secondaryText: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600"
  }
});

const LoginScreen = ({ navigation }) => {
  const { login, serverUrl, error, clearError, isLoading } = useAuth();
  const [url, setUrl] = useState(serverUrl);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setUrl(serverUrl);
  }, [serverUrl]);

  useEffect(() => {
    if (error) {
      Alert.alert("Sign in failed", error, [{ text: "OK", onPress: () => clearError() }]);
    }
  }, [clearError, error]);

  const handleSubmit = async () => {
    if (!url || !username || !password) {
      Alert.alert("Missing information", "Provide server URL, username, and password.");
      return;
    }

    setSubmitting(true);
    try {
      await login({ url, username, password });
    } catch (submitError) {
      console.warn("Login failed", submitError);
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = submitting || isLoading;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: "padding", android: undefined })} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.headline}>Inventory Mobile</Text>

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

          <TouchableOpacity
            accessibilityRole="button"
            onPress={handleSubmit}
            disabled={disabled}
            style={[styles.button, disabled && { opacity: 0.6 }]}
          >
            {disabled ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => navigation?.navigate("RegisterSalesman")}
            disabled={disabled}
            style={styles.secondaryButton}
          >
            <Text style={[styles.secondaryText, disabled && { opacity: 0.6 }]}>Register new salesman</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Morning sync requires office Wi-Fi connectivity.</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;
