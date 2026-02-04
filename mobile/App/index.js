import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AuthProvider, useAuth } from "../src/context/AuthContext";
import { SyncProvider } from "../src/context/SyncContext";
import LoginScreen from "../src/screens/LoginScreen";
import DashboardScreen from "../src/screens/DashboardScreen";
import OrderFormScreen from "../src/screens/OrderFormScreen";
import RecoveryFormScreen from "../src/screens/RecoveryFormScreen";
import SyncStatusScreen from "../src/screens/SyncStatusScreen";
import RegisterSalesmanScreen from "../src/screens/RegisterSalesmanScreen";
import SettingsScreen from "../src/screens/SettingsScreen";

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const queryClient = new QueryClient();

const AppTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ color, size }) => {
        const iconMap = {
          Dashboard: "speedometer",
          Orders: "cart",
          Recovery: "cash",
          Sync: "refresh",
          Settings: "settings"
        };
        return <Ionicons name={iconMap[route.name] || "ellipse"} size={size} color={color} />;
      },
      tabBarActiveTintColor: "#2563eb",
      tabBarInactiveTintColor: "#94a3b8",
      tabBarLabelStyle: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
      tabBarStyle: {
        height: 60,
        paddingTop: 6,
        paddingBottom: 6,
        borderTopColor: "#e2e8f0",
        backgroundColor: "#fff"
      }
    })}
  >
    <Tab.Screen name="Dashboard" component={DashboardScreen} />
    <Tab.Screen name="Orders" component={OrderFormScreen} />
    <Tab.Screen name="Recovery" component={RecoveryFormScreen} />
    <Tab.Screen name="Sync" component={SyncStatusScreen} />
    <Tab.Screen name="Settings" component={SettingsScreen} />
  </Tab.Navigator>
);

const RootNavigator = () => {
  const { token, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <Stack.Screen name="Tabs" component={AppTabs} />
      ) : (
        <>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen
            name="RegisterSalesman"
            component={RegisterSalesmanScreen}
            options={{ headerShown: true, title: "Register Salesman" }}
          />
        </>
      )}
    </Stack.Navigator>
  );
};

const AppProviders = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <SyncProvider>{children}</SyncProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default function App() {
  return (
    <AppProviders>
      <NavigationContainer>
        <RootNavigator />
        <StatusBar style="dark" />
      </NavigationContainer>
    </AppProviders>
  );
}
