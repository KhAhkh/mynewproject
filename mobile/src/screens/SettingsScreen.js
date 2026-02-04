import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { DEFAULT_SERVER_URL } from "../config";

export default function SettingsScreen() {
  const { serverUrl, setServerUrl, user, logout } = useAuth();
  const [customUrl, setCustomUrl] = useState(serverUrl);
  const [isEditing, setIsEditing] = useState(false);

  const getLocalIpSuggestions = () => {
    return [
      { label: "localhost:4000", value: "http://localhost:4000" },
      { label: "192.168.1.x:4000", value: "http://192.168.1.x:4000" },
      { label: "192.168.8.x:4000", value: "http://192.168.8.x:4000" },
      { label: "10.0.2.2:4000 (Android Emulator)", value: "http://10.0.2.2:4000" }
    ];
  };

  const handleSaveUrl = async () => {
    if (!customUrl || customUrl.trim() === "") {
      Alert.alert("Error", "Please enter a valid server URL");
      return;
    }

    try {
      // Validate URL format
      new URL(customUrl);
      
      // Update the server URL
      setServerUrl(customUrl);
      setIsEditing(false);
      
      Alert.alert(
        "Server URL Updated",
        "The server URL has been updated. You may need to log in again for changes to take effect.",
        [
          {
            text: "Stay Logged In",
            style: "cancel"
          },
          {
            text: "Logout Now",
            onPress: () => logout()
          }
        ]
      );
    } catch (error) {
      Alert.alert(
        "Invalid URL",
        "Please enter a valid URL starting with http:// or https://"
      );
    }
  };

  const handleResetToDefault = () => {
    Alert.alert(
      "Reset to Default",
      "Reset server URL to default value?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            setCustomUrl(DEFAULT_SERVER_URL);
            setServerUrl(DEFAULT_SERVER_URL);
            setIsEditing(false);
          }
        }
      ]
    );
  };

  const applySuggestion = (value) => {
    setCustomUrl(value);
    setIsEditing(true);
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="settings" size={32} color="#2563eb" />
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      {/* User Info Section */}
      {user && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>User Information</Text>
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Ionicons name="person" size={20} color="#64748b" />
              <Text style={styles.infoLabel}>Username:</Text>
              <Text style={styles.infoValue}>{user.username || "N/A"}</Text>
            </View>
            {user.salesman_id && (
              <View style={styles.infoRow}>
                <Ionicons name="briefcase" size={20} color="#64748b" />
                <Text style={styles.infoLabel}>Salesman ID:</Text>
                <Text style={styles.infoValue}>{user.salesman_id}</Text>
              </View>
            )}
          </View>
        </View>
      )}

      {/* Server URL Configuration */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Server Configuration</Text>
        
        <View style={styles.card}>
          <View style={styles.urlHeader}>
            <Text style={styles.label}>Current Server URL</Text>
            {!isEditing && (
              <TouchableOpacity onPress={() => setIsEditing(true)}>
                <Ionicons name="pencil" size={20} color="#2563eb" />
              </TouchableOpacity>
            )}
          </View>

          {isEditing ? (
            <>
              <TextInput
                style={styles.input}
                value={customUrl}
                onChangeText={setCustomUrl}
                placeholder="http://192.168.x.x:4000"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    setCustomUrl(serverUrl);
                    setIsEditing(false);
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleSaveUrl}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <View style={styles.currentUrlContainer}>
              <Ionicons name="link" size={20} color="#64748b" />
              <Text style={styles.currentUrl}>{serverUrl}</Text>
            </View>
          )}
        </View>

        {/* Quick Suggestions */}
        <View style={styles.suggestionsCard}>
          <Text style={styles.suggestionsTitle}>Quick Setup Suggestions</Text>
          <Text style={styles.suggestionsSubtitle}>
            Tap to use (replace x with your computer's IP address)
          </Text>
          {getLocalIpSuggestions().map((suggestion, index) => (
            <TouchableOpacity
              key={index}
              style={styles.suggestionItem}
              onPress={() => applySuggestion(suggestion.value)}
            >
              <Ionicons name="globe-outline" size={18} color="#2563eb" />
              <Text style={styles.suggestionLabel}>{suggestion.label}</Text>
              <Ionicons name="arrow-forward" size={16} color="#94a3b8" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Help Text */}
        <View style={styles.helpCard}>
          <Ionicons name="information-circle" size={20} color="#2563eb" />
          <Text style={styles.helpText}>
            To find your computer's IP address:{"\n"}
            • Windows: Run "ipconfig" in Command Prompt{"\n"}
            • Mac/Linux: Run "ifconfig" in Terminal{"\n"}
            • Look for IPv4 Address (e.g., 192.168.x.x)
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleResetToDefault}
        >
          <Ionicons name="refresh" size={20} color="#2563eb" />
          <Text style={styles.actionButtonText}>Reset to Default URL</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionButton, styles.logoutButton]}
          onPress={() => {
            Alert.alert(
              "Logout",
              "Are you sure you want to logout?",
              [
                { text: "Cancel", style: "cancel" },
                { text: "Logout", style: "destructive", onPress: logout }
              ]
            );
          }}
        >
          <Ionicons name="log-out" size={20} color="#dc2626" />
          <Text style={[styles.actionButtonText, styles.logoutButtonText]}>
            Logout
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Inventory Mobile App v0.1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 20,
    paddingTop: Platform.OS === "ios" ? 60 : 40,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0"
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    marginLeft: 12,
    color: "#0f172a"
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  infoCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12
  },
  infoLabel: {
    fontSize: 14,
    color: "#64748b",
    marginLeft: 8,
    fontWeight: "500"
  },
  infoValue: {
    fontSize: 14,
    color: "#0f172a",
    marginLeft: 8,
    fontWeight: "600",
    flex: 1
  },
  urlHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569"
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff"
  },
  currentUrlContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f1f5f9",
    padding: 12,
    borderRadius: 8
  },
  currentUrl: {
    fontSize: 14,
    color: "#0f172a",
    marginLeft: 8,
    flex: 1
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 8
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: "center"
  },
  cancelButton: {
    backgroundColor: "#f1f5f9"
  },
  cancelButtonText: {
    color: "#475569",
    fontWeight: "600",
    fontSize: 14
  },
  saveButton: {
    backgroundColor: "#2563eb"
  },
  saveButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14
  },
  suggestionsCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  suggestionsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0f172a",
    marginBottom: 4
  },
  suggestionsSubtitle: {
    fontSize: 12,
    color: "#64748b",
    marginBottom: 12
  },
  suggestionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9"
  },
  suggestionLabel: {
    flex: 1,
    fontSize: 14,
    color: "#0f172a",
    marginLeft: 8
  },
  helpCard: {
    flexDirection: "row",
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12
  },
  helpText: {
    flex: 1,
    fontSize: 12,
    color: "#1e40af",
    marginLeft: 8,
    lineHeight: 18
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563eb",
    marginLeft: 12
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: "#fecaca"
  },
  logoutButtonText: {
    color: "#dc2626"
  },
  footer: {
    padding: 20,
    alignItems: "center"
  },
  footerText: {
    fontSize: 12,
    color: "#94a3b8"
  }
});
