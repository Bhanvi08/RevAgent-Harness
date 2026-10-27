import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Easing,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { 
  useFonts, 
  Inter_400Regular, 
  Inter_500Medium, 
  Inter_600SemiBold, 
  Inter_700Bold 
} from '@expo-google-fonts/inter';
import { 
  JetBrainsMono_400Regular, 
  JetBrainsMono_700Bold 
} from '@expo-google-fonts/jetbrains-mono';

import { MOCK_DATA } from "./mock/data";

// NEW VIBE: High-contrast, sharp, modular monochrome with restrained accents.
const C = {
  bg: "#000000",
  bgDeep: "#050505",
  card: "#0A0A0A",
  cardSoft: "#111111",
  border: "#27272A",
  text: "#FAFAFA",
  muted: "#A1A1AA",
  faint: "#52525B",
  
  // Replaced typical neon with sophisticated functional colors
  accent: "#FFFFFF",        // Primary actions are stark white
  accentDeep: "#E4E4E7",
  success: "#10B981",       // Sharp emerald
  successSoft: "rgba(16, 185, 129, 0.1)",
  danger: "#EF4444",        // Crisp red
  dangerSoft: "rgba(239, 68, 68, 0.12)",
  info: "#3B82F6",          // Clean blue
  infoSoft: "rgba(59, 130, 246, 0.12)",
  warning: "#F59E0B",       // Amber
  warningSoft: "rgba(245, 158, 11, 0.12)",
  whiteSoft: "rgba(255, 255, 255, 0.05)",
};

const DESKTOP = 860;
const API_BASE_URL = "http://127.0.0.1:8000";
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function normalize(item) {
  const status = String(item.status ?? "new").toLowerCase();
  const customer = item.customer ?? item.customer_name ?? "Unknown contact";
  const history = Array.isArray(item.history) ? item.history : [];
  const latestHarness = [...history]
    .reverse()
    .find((event) => event?.type === "harness_run");

  return {
    ...item,
    id: String(item.id),
    customer,
    initials: getInitials(customer),
    channel: String(item.channel ?? "other").toLowerCase(),
    status,
    urgency: String(
      item.urgency ?? (status === "escalated" ? "high" : "low"),
    ).toLowerCase(),
    reason:
      item.reason ??
      (status === "escalated" ? "Needs human review" : "General enquiry"),
    summary:
      item.summary ??
      item.suggested_response ??
      "AI summary is not available yet.",
    message: item.message ?? "",
    receivedAt: item.receivedAt ?? item.created_at ?? new Date().toISOString(),
    aiConfidence: item.aiConfidence ?? item.ai_confidence ?? null,
    sopMatch: item.sopMatch ?? item.sop_match ?? null,
    suggestedResponse:
      item.suggestedResponse ?? item.suggested_response ?? null,
    recommendedAction:
      item.recommendedAction ?? item.recommended_action ?? null,
    paymentLink: item.paymentLink ?? item.payment_link ?? null,
    history,
    harnessTrace: latestHarness?.trace ?? [],
    policyVerdict: latestHarness?.policy?.verdict ?? null,
    riskFlags: latestHarness?.policy?.risk_flags ?? [],
  };
}

function getInitials(name) {
  return (
    String(name)
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

function historyLabel(event) {
  if (typeof event === "string") return event;
  if (event?.type === "harness_run") {
    const verdict =
      event.policy?.verdict === "approved"
        ? "approved"
        : "sent to human review";
    return `Harness run ${String(event.run_id || "").slice(0, 8)} · policy ${verdict}`;
  }
  if (event?.type === "system_action") {
    return event.status === "completed"
      ? "Action completed: Razorpay Test Mode link generated"
      : event.detail || "System action recorded";
  }
  if (event?.type === "operator_action") {
    return event.detail || "Operator action recorded";
  }
  if (event?.detail) return `${event.agent || "system"}: ${event.detail}`;
  return "Activity recorded";
}

const DataContext = createContext(null);

function DataProvider({ children }) {
  const [data, setData] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [loading, setLoading] = useState(true);
  const [syncPulse, setSyncPulse] = useState(0);
  const [connectionError, setConnectionError] = useState("");
  const knownIdsRef = useRef(new Set());

  const updateStatus = useCallback((id, status) => {
    setData((current) =>
      current.map((item) => (item.id === id ? { ...item, status } : item)),
    );
  }, []);

  const loadEnquiries = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/enquiries`);
      if (!response.ok) throw new Error(`API returned ${response.status}`);
      const records = await response.json();
      const nextRecords = Array.isArray(records) ? records.map(normalize) : [];
      const nextIds = new Set(nextRecords.map((record) => record.id));
      const hasNewRecord = nextRecords.some((record) => !knownIdsRef.current.has(record.id));
      knownIdsRef.current = nextIds;
      setData(nextRecords);
      setConnection("live");
      setConnectionError("");
      if (hasNewRecord && nextRecords.length > 0) setSyncPulse((value) => value + 1);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.warn("RevAgent API unavailable; using demo data.", error);
      setConnectionError(detail);
      setData((current) =>
        current.length ? current : MOCK_DATA.map(normalize),
      );
      setConnection("demo");
    } finally {
      setLoading(false);
    }
  }, []);

  const runStatusAction = useCallback(
    async (id, status, reason = "Operator action") => {
      if (connection !== "live") {
        updateStatus(id, status);
        return { demo: true };
      }

      const endpoint = status === "resolved" ? "resolve" : "escalate";
      const query =
        status === "resolved" ? "" : `?reason=${encodeURIComponent(reason)}`;
      const response = await fetch(
        `${API_BASE_URL}/enquiry/${encodeURIComponent(id)}/${endpoint}${query}`,
        { method: "POST" },
      );
      if (!response.ok)
        throw new Error(`Action failed with ${response.status}`);
      await loadEnquiries();
      return { demo: false };
    },
    [connection, loadEnquiries, updateStatus],
  );

  useEffect(() => {
    loadEnquiries();
    const refreshTimer = setInterval(loadEnquiries, 5000);
    return () => clearInterval(refreshTimer);
  }, [loadEnquiries]);

  const value = useMemo(
    () => ({
      data,
      updateStatus,
      runStatusAction,
      connection,
      loading,
      syncPulse,
      connectionError,
      refresh: loadEnquiries,
    }),
    [data, updateStatus, runStatusAction, connection, loading, syncPulse, connectionError, loadEnquiries],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

function useData() {
  const value = useContext(DataContext);
  if (!value) throw new Error("useData must be used inside DataProvider");
  return value;
}

function Icon({ name, size = 20, color = C.muted }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}

function statusMeta(status) {
  const values = {
    new: { label: "NEW", color: C.muted, bg: C.whiteSoft, icon: "circle-outline" },
    received: { label: "RECEIVED", color: C.muted, bg: C.whiteSoft, icon: "inbox-arrow-down-outline" },
    processing: { label: "PROCESSING", color: C.warning, bg: C.warningSoft, icon: "progress-clock" },
    processed: { label: "AI PROCESSED", color: C.info, bg: C.infoSoft, icon: "robot-outline" },
    qualified: { label: "QUALIFIED", color: C.info, bg: C.infoSoft, icon: "check-decagram-outline" },
    escalated: { label: "ESCALATED", color: C.danger, bg: C.dangerSoft, icon: "alert-outline" },
    resolved: { label: "RESOLVED", color: C.success, bg: C.successSoft, icon: "check-circle-outline" },
  };
  return values[status] ?? values.new;
}

function channelMeta(channel) {
  const values = {
    whatsapp: { label: "WhatsApp", icon: "whatsapp", color: "#25D366" },
    call: { label: "Call", icon: "phone-outline", color: C.info },
    email: { label: "Email", icon: "email-outline", color: C.accent },
    sms: { label: "SMS", icon: "message-text-outline", color: C.warning },
  };
  return values[channel] ?? { label: "Other", icon: "message-outline", color: C.muted };
}

function urgencyMeta(urgency) {
  const values = {
    high: { label: "URGENT", color: C.danger, bg: C.dangerSoft },
    medium: { label: "REVIEW", color: C.warning, bg: C.warningSoft },
    low: { label: "NORMAL", color: C.faint, bg: C.whiteSoft },
  };
  return values[urgency] ?? values.low;
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function timeLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Surface({ children, style }) {
  return <View style={[styles.surface, style]}>{children}</View>;
}

function FadeIn({ children }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 360, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [opacity, translateY]);

  return <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

function PulseDot({ color = C.success }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.55, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 950, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return <Animated.View style={[styles.liveDot, { backgroundColor: color, transform: [{ scale: pulse }] }]} />;
}

function Screen({ children, scroll = false, style }) {
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP;
  
  // Wait for fonts to load before rendering text to prevent flickers
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded) return <View style={styles.screen} />;

  const content = (
    <View style={[styles.frame, desktop && styles.frameDesktop, style]}>
      <FadeIn>{children}</FadeIn>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
        {scroll ? (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[styles.scrollContent, desktop && styles.scrollContentDesktop]}
          >
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </SafeAreaView>
    </View>
  );
}

function LiveHeader({ title = "RevAgent", subtitle = "Autonomous revenue agent", connection = "live" }) {
  const isLive = connection === "live";
  return (
    <View style={styles.liveHeader}>
      <View style={styles.liveLine}>
        <PulseDot color={isLive ? C.success : C.warning} />
        <Text style={[styles.liveText, !isLive && { color: C.warning }]}>
          {isLive ? "LIVE / API" : connection === "connecting" ? "CONNECTING" : "DEMO / OFFLINE"}
        </Text>
        <View style={styles.liveRule} />
      </View>
      <Text style={styles.appTitle}>{title}</Text>
      <Text style={styles.appSubtitle}>{subtitle}</Text>
    </View>
  );
}

function SmallBadge({ status }) {
  const meta = statusMeta(status);
  return (
    <View style={[styles.smallBadge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
      <View style={[styles.smallBadgeDot, { backgroundColor: meta.color }]} />
      <Text style={[styles.smallBadgeText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function Urgency({ value }) {
  const meta = urgencyMeta(value);
  return (
    <View style={[styles.urgency, { backgroundColor: meta.bg }]}>
      <Text style={[styles.urgencyText, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

function Avatar({ initials, size = 42 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: 6 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.max(11, size * 0.35) }]}>{initials}</Text>
    </View>
  );
}

function PrimaryButton({ label, icon = "arrow-right", onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.primaryPress, pressed && styles.pressed]}>
      <View style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{label}</Text>
        <Icon name={icon} size={16} color="#000000" />
      </View>
    </Pressable>
  );
}

function OutlineButton({ label, icon, onPress, danger = false }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.outlineButton, danger && styles.outlineDanger, pressed && styles.pressed]}>
      {icon ? <Icon name={icon} size={15} color={danger ? C.danger : C.text} /> : null}
      <Text style={[styles.outlineButtonText, danger && { color: C.danger }]}>{label}</Text>
    </Pressable>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <View style={styles.toast}>
      <Icon name="check-circle" size={17} color={C.success} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

function ActivityItem({ item, last }) {
  const meta = statusMeta(item.status);
  return (
    <View style={[styles.activityItem, !last && styles.activityBorder]}>
      <View style={[styles.activityMarker, { backgroundColor: meta.bg }]}>
        <Icon name={meta.icon} size={15} color={meta.color} />
      </View>
      <View style={styles.activityCopy}>
        <Text style={styles.activityText}>
          <Text style={styles.activityName}>{item.customer}</Text>
          {item.status === "escalated" ? " needs human review" : item.status === "qualified" ? " qualified by AI" : item.status === "resolved" ? " was resolved" : " entered the pipeline"}
        </Text>
        <Text style={styles.activityTime}>{relativeTime(item.receivedAt)}</Text>
      </View>
      <SmallBadge status={item.status} />
    </View>
  );
}

function MiniPipeline({ data }) {
  const stages = [
    { label: "NEW", count: data.filter((item) => ["new", "received"].includes(item.status)), color: C.muted },
    { label: "AI", count: data.filter((item) => ["processing", "processed"].includes(item.status)), color: C.warning },
    { label: "QUAL", count: data.filter((item) => item.status === "qualified"), color: C.info },
    { label: "DONE", count: data.filter((item) => item.status === "resolved"), color: C.success },
  ];
  return (
    <Surface style={styles.pipeline}>
      <View style={styles.pipelineHeading}>
        <Text style={styles.panelTitle}>Pipeline State</Text>
        <Text style={styles.panelHint}>TODAY</Text>
      </View>
      <View style={styles.pipelineRow}>
        {stages.map((stage, index) => (
          <React.Fragment key={stage.label}>
            <View style={styles.pipelineStage}>
              <View style={[styles.pipelineDot, { backgroundColor: stage.color }]} />
              <Text style={styles.pipelineCount}>{stage.count.length}</Text>
              <Text style={styles.pipelineLabel}>{stage.label}</Text>
            </View>
            {index < stages.length - 1 ? <Icon name="chevron-right" size={16} color={C.border} /> : null}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.pipelineBottom}>
        <View style={styles.pipelineLiveDot} />
        <Text style={styles.pipelineBottomText}>
          {data.filter((item) => item.status === "escalated").length} Escalation{data.filter((item) => item.status === "escalated").length === 1 ? "" : "s"} active
        </Text>
        <Text style={styles.pipelineBottomRight}>WATCHING</Text>
      </View>
    </Surface>
  );
}

function AttentionItem({ item, onPress }) {
  const channel = channelMeta(item.channel);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.attentionItem, pressed && styles.pressed]}>
      <View style={styles.attentionRail} />
      <Avatar initials={item.initials} size={40} />
      <View style={styles.attentionCopy}>
        <View style={styles.attentionNameRow}>
          <Text style={styles.attentionName}>{item.customer}</Text>
          <Urgency value={item.urgency} />
        </View>
        <Text style={styles.attentionReason} numberOfLines={1}>{item.reason}</Text>
        <View style={styles.metaLine}>
          <Icon name={channel.icon} size={13} color={channel.color} />
          <Text style={styles.metaText}>{channel.label}</Text>
          <Text style={styles.metaDot}>/</Text>
          <Text style={styles.metaText}>{relativeTime(item.receivedAt)}</Text>
        </View>
      </View>
      <Icon name="arrow-right" size={17} color={C.muted} />
    </Pressable>
  );
}

function HarnessSummary({ data }) {
  const latest = data.find((item) => item.harnessTrace?.length);
  const trace = latest?.harnessTrace || [];
  const blocked = latest?.policyVerdict === "human_review";
  return (
    <Surface style={styles.harnessSummary}>
      <View style={styles.harnessSummaryTop}>
        <View style={styles.harnessSummaryTitleRow}>
          <View style={styles.harnessSummaryIcon}>
            <Icon name="transit-connection-variant" size={16} color={C.success} />
          </View>
          <View>
            <Text style={styles.harnessSummaryEyebrow}>HARNESS STATUS</Text>
            <Text style={styles.harnessSummaryTitle}>{trace.length ? "Decision path recorded" : "Harness ready"}</Text>
          </View>
        </View>
        <View style={[styles.harnessVerdict, blocked && styles.harnessVerdictBlocked]}>
          <View style={[styles.harnessVerdictDot, { backgroundColor: blocked ? C.danger : C.success }]} />
          <Text style={[styles.harnessVerdictText, { color: blocked ? C.danger : C.success }]}>
            {blocked ? "HUMAN REVIEW" : trace.length ? "POLICY APPROVED" : "AWAITING RUN"}
          </Text>
        </View>
      </View>
      <View style={styles.harnessStages}>
        {["intake", "qualification", "critic_policy", "action_handoff"].map((stage, index) => {
          const step = trace.find((entry) => entry.agent === stage);
          return (
            <View key={stage} style={styles.harnessStage}>
              <View
                style={[
                  styles.harnessStageDot,
                  { backgroundColor: step?.status === "blocked" || step?.status === "handoff" ? C.danger : step ? C.success : C.border },
                ]}
              />
              <Text style={styles.harnessStageLabel}>{stage.replaceAll("_", " ")}</Text>
              {index < 3 ? <View style={styles.harnessStageLine} /> : null}
            </View>
          );
        })}
      </View>
    </Surface>
  );
}

function SignalPill({ label, value, tone = "success" }) {
  const colors = {
    success: { fg: C.success, bg: C.successSoft, border: "rgba(16, 185, 129, 0.2)" },
    danger: { fg: C.danger, bg: C.dangerSoft, border: "rgba(239, 68, 68, 0.2)" },
    info: { fg: C.info, bg: C.infoSoft, border: "rgba(59, 130, 246, 0.2)" },
    neutral: { fg: C.text, bg: C.whiteSoft, border: C.border },
  }[tone];
  return (
    <View style={[styles.signalPill, { backgroundColor: colors.bg, borderColor: colors.border }]}>
      <Text style={[styles.signalPillValue, { color: colors.fg }]}>{value}</Text>
      <Text style={styles.signalPillLabel}>{label}</Text>
    </View>
  );
}

function DecisionOrbit({ approved, escalations, refreshSignal = 0 }) {
  const spin = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  useEffect(() => {
    if (!refreshSignal) return;
    Animated.sequence([
      Animated.timing(flash, { toValue: 1.1, duration: 120, useNativeDriver: true }),
      Animated.timing(flash, { toValue: 1, duration: 300, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [refreshSignal, flash]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.orbitStage}>
      <Animated.View style={[styles.orbitOuter, { transform: [{ rotate }] }]}>
        <View style={[styles.orbitNode, styles.orbitNodeTop]} />
        <View style={[styles.orbitNode, styles.orbitNodeRight]} />
        <View style={[styles.orbitNode, styles.orbitNodeBottom]} />
      </Animated.View>
      <Animated.View style={[styles.orbitCore, { transform: [{ scale: flash }] }]}>
        <Icon name={escalations ? "shield-alert-outline" : "shield-check-outline"} size={26} color={escalations ? C.danger : C.success} />
        <Text style={[styles.orbitCoreLabel, { color: escalations ? C.danger : C.success }]}>
          {escalations ? "REVIEW" : "CLEAR"}
        </Text>
      </Animated.View>
      <View style={styles.orbitCaption}>
        <Text style={styles.orbitCaptionTop}>POLICY GATE</Text>
        <Text style={styles.orbitCaptionBottom}>{approved} APPROVED · {escalations} ESCALATED</Text>
      </View>
    </View>
  );
}

function DecisionCard({ item, navigation }) {
  if (!item) {
    return (
      <Surface style={styles.decisionCard}>
        <Text style={styles.decisionEyebrow}>DECISION STREAM</Text>
        <Text style={styles.decisionTitle}>Awaiting Input</Text>
        <Text style={styles.decisionBody}>RevAgent will display the decision path here when a new payload arrives.</Text>
      </Surface>
    );
  }

  const blocked = item.policyVerdict === "human_review" || item.status === "escalated";
  const accent = blocked ? C.danger : C.success;
  const verdict = blocked ? "HUMAN REVIEW REQ." : "POLICY APPROVED";
  
  return (
    <Pressable onPress={() => navigation.navigate("Details", { leadId: item.id })} style={({ pressed }) => [styles.decisionCard, pressed && styles.pressed]}>
      <View style={styles.decisionHeader}>
        <View>
          <Text style={[styles.decisionEyebrow, { color: accent }]}>LATEST EVALUATION</Text>
          <Text style={styles.decisionTitle}>{item.customer}</Text>
        </View>
        <View style={[styles.decisionVerdict, { backgroundColor: blocked ? C.dangerSoft : C.successSoft, borderColor: accent }]}>
          <View style={[styles.decisionVerdictDot, { backgroundColor: accent }]} />
          <Text style={[styles.decisionVerdictText, { color: accent }]}>{verdict}</Text>
        </View>
      </View>
      <Text style={styles.decisionMessage} numberOfLines={2}>{item.message || item.summary}</Text>
      <View style={styles.decisionFooter}>
        <View style={styles.decisionMeta}>
          <Icon name="transit-connection-variant" size={15} color={C.muted} />
          <Text style={styles.decisionMetaText}>{item.harnessTrace?.length || 0} stages recorded</Text>
        </View>
        <Icon name="arrow-right" size={16} color={accent} />
      </View>
    </Pressable>
  );
}

function ConnectionBanner({ connection, error }) {
  if (connection === "live") return null;
  const connecting = connection === "connecting";
  return (
    <View style={[styles.connectionBanner, connecting ? styles.connectionBannerConnecting : styles.connectionBannerOffline]}>
      <Icon name={connecting ? "access-point" : "lan-disconnect"} size={16} color={connecting ? C.warning : C.danger} />
      <View style={styles.connectionBannerCopy}>
        <Text style={[styles.connectionBannerTitle, { color: connecting ? C.warning : C.danger }]}>
          {connecting ? "CONNECTING TO API" : "API OFFLINE"}
        </Text>
        <Text style={styles.connectionBannerText}>
          {connecting ? "Awaiting http://127.0.0.1:8000" : error || "Start uvicorn on port 8000 for live data."}
        </Text>
      </View>
    </View>
  );
}

function Dashboard() {
  const { data, connection, syncPulse, connectionError } = useData();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const desktop = width >= DESKTOP;
  const escalations = data.filter((item) => item.status === "escalated");
  const processed = data.filter((item) => !["new", "received"].includes(item.status)).length;
  const qualified = data.filter((item) => item.status === "qualified").length;
  const approved = data.filter((item) => item.policyVerdict === "approved" || item.paymentLink).length;
  const latest = data[0];

  return (
    <Screen scroll>
      <LiveHeader connection={connection} subtitle="Autonomous revenue guardrails." />
      <ConnectionBanner connection={connection} error={connectionError} />

      <View style={styles.commandHero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroKicker}>SYSTEM OVERVIEW</Text>
          <Text style={styles.heroTitle}>Revenue control,{"\n"}with brakes.</Text>
          <Text style={styles.heroBody}>Routine tasks execute immediately. Sensitive edge cases block for manual operator review.</Text>
          <View style={styles.heroActions}>
            <PrimaryButton label="Open Pipeline" onPress={() => navigation.navigate("Leads")} />
            <View style={styles.heroLiveNote}><PulseDot color={C.success} /><Text style={styles.heroLiveText}>SYNC ACTIVE</Text></View>
          </View>
        </View>
        <DecisionOrbit approved={approved} escalations={escalations.length} refreshSignal={syncPulse} />
      </View>

      <View style={styles.signalRail}>
        <SignalPill label="TOTAL" value={data.length} tone="neutral" />
        <SignalPill label="PROCESSED" value={processed} tone="success" />
        <SignalPill label="REVIEW" value={escalations.length} tone="danger" />
        <SignalPill label="QUALIFIED" value={qualified} tone="info" />
      </View>

      <DecisionCard item={latest} navigation={navigation} />
      <HarnessSummary data={data} />

      <View style={[styles.dashboardColumns, desktop && styles.dashboardColumnsDesktop]}>
        <View style={styles.dashboardPrimary}>
          <MiniPipeline data={data} />
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View><Text style={styles.panelTitle}>Operator Queue</Text><Text style={styles.panelHint}>{escalations.length ? "ACTION REQUIRED" : "NO INTERVENTION NEEDED"}</Text></View>
              <Text style={styles.sectionLink}>{escalations.length ? "VIEW ALL" : "CLEAR"}</Text>
            </View>
            <Surface>
              {escalations.length ? escalations.slice(0, 3).map((item) => <AttentionItem key={item.id} item={item} onPress={() => navigation.navigate("Details", { leadId: item.id })} />) : <View style={styles.clearInline}><Icon name="check" size={20} color={C.success} /><Text style={styles.clearInlineText}>Attention queue is empty.</Text></View>}
            </Surface>
          </View>
        </View>
        <View style={styles.dashboardSecondary}>
          <View style={styles.section}>
            <View style={styles.sectionHeading}><View><Text style={styles.panelTitle}>Audit Log</Text><Text style={styles.panelHint}>HARNESS ACTIVITY</Text></View><Text style={styles.liveMini}>LIVE</Text></View>
            <Surface>{data.slice(0, 4).map((item, index) => <ActivityItem key={item.id} item={item} last={index === Math.min(data.length, 4) - 1} />)}</Surface>
          </View>
        </View>
      </View>
    </Screen>
  );
}

function LeadRow({ item, onPress }) {
  const channel = channelMeta(item.channel);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.leadRow, pressed && styles.pressed]}>
      <View style={[styles.leadRail, { backgroundColor: item.urgency === "high" ? C.danger : item.status === "qualified" ? C.info : C.border }]} />
      <Avatar initials={item.initials} size={42} />
      <View style={styles.leadCopy}>
        <View style={styles.leadTop}>
          <Text style={styles.leadName} numberOfLines={1}>{item.customer}</Text>
          <SmallBadge status={item.status} />
        </View>
        <Text style={styles.leadSummary} numberOfLines={1}>{item.summary}</Text>
        <View style={styles.metaLine}>
          <Icon name={channel.icon} size={13} color={channel.color} />
          <Text style={styles.metaText}>{channel.label}</Text>
          <Text style={styles.metaDot}>/</Text>
          <Text style={styles.metaText}>{timeLabel(item.receivedAt)}</Text>
          {item.urgency === "high" ? (
            <><Text style={styles.metaDot}>/</Text><Urgency value={item.urgency} /></>
          ) : null}
        </View>
      </View>
      <Icon name="arrow-right" size={17} color={C.muted} />
    </Pressable>
  );
}

function LeadsScreen() {
  const { data } = useData();
  const navigation = useNavigation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const filters = ["all", "new", "qualified", "escalated", "resolved"];
  const filtered = useMemo(
    () => data.filter((item) => {
      const matchesFilter = filter === "all" || item.status === filter;
      const q = query.toLowerCase().trim();
      const matchesQuery = !q || [item.customer, item.summary, item.reason, item.channel].some((value) => String(value ?? "").toLowerCase().includes(q));
      return matchesFilter && matchesQuery;
    }),
    [data, filter, query],
  );
  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.simpleHeader}>
          <View>
            <Text style={styles.eyebrow}>DATA TABLE</Text>
            <Text style={styles.pageTitle}>Pipeline</Text>
          </View>
          <View style={styles.countBubble}>
            <Text style={styles.countNumber}>{filtered.length}</Text>
            <Text style={styles.countLabel}>RECORDS</Text>
          </View>
        </View>
        <View style={styles.search}>
          <Icon name="magnify" size={18} color={C.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search records..."
            placeholderTextColor={C.faint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? <Pressable onPress={() => setQuery("")}><Icon name="close" size={16} color={C.faint} /></Pressable> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters}>
          {filters.map((item) => (
            <Pressable key={item} onPress={() => setFilter(item)} style={[styles.filter, filter === item && styles.filterActive]}>
              <Text style={[styles.filterText, filter === item && styles.filterTextActive]}>{item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.listHeading}>
          <Text style={styles.listTitle}>{filter === "all" ? "Latest Records" : `${filter[0].toUpperCase() + filter.slice(1)} Records`}</Text>
        </View>
        <ScrollView style={styles.leadsListScroll} contentContainerStyle={styles.leadsList} showsVerticalScrollIndicator={false}>
          {filtered.length ? filtered.map((item) => <LeadRow key={item.id} item={item} onPress={() => navigation.navigate("Details", { leadId: item.id })} />) : (
            <View style={styles.emptyList}>
              <Icon name="database-off-outline" size={28} color={C.border} />
              <Text style={styles.emptyTitle}>No records found</Text>
              <Text style={styles.emptyText}>Adjust filters or search term.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </Screen>
  );
}

function AlertCard({ item, onTakeOver, onOpen }) {
  const channel = channelMeta(item.channel);
  return (
    <Surface style={styles.alertCard}>
      <View style={styles.alertRail} />
      <View style={styles.alertTop}>
        <View style={styles.alertIdentity}>
          <Avatar initials={item.initials} size={42} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alertReason}>{item.reason}</Text>
            <Text style={styles.alertSub}>{item.customer} • {channel.label}</Text>
          </View>
        </View>
        <Urgency value={item.urgency} />
      </View>
      <View style={styles.alertLine}>
        <Icon name="clock-outline" size={14} color={C.danger} />
        <Text style={styles.alertLineText}>WAITING {relativeTime(item.receivedAt).toUpperCase()}</Text>
        <Text style={styles.alertDot}>/</Text>
        <Text style={styles.alertLineText}>{item.recommendedAction?.toUpperCase() || "MANUAL REVIEW"}</Text>
      </View>
      <View style={styles.alertActions}>
        <OutlineButton label="View Details" icon="arrow-right" onPress={onOpen} />
        <PrimaryButton label="Take Over" icon="hand-back-right-outline" onPress={onTakeOver} />
      </View>
    </Surface>
  );
}

function AlertsScreen() {
  const { data, runStatusAction } = useData();
  const navigation = useNavigation();
  const [toast, setToast] = useState("");
  const list = data.filter((item) => item.status === "escalated");
  const takeOver = async (item) => {
    try {
      const result = await runStatusAction(item.id, "resolved", "Operator assumed control");
      setToast(`Operator assigned to ${item.customer}${result.demo ? " (demo)" : ""}`);
    } catch (error) {
      setToast("Failed to update state.");
    }
    setTimeout(() => setToast(""), 2400);
  };
  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.simpleHeader}>
          <View>
            <Text style={styles.eyebrow}>REQUIRES ACTION</Text>
            <Text style={styles.pageTitle}>Alerts</Text>
          </View>
          <View style={styles.openBubble}>
            <View style={styles.openDot} />
            <Text style={styles.openText}>{list.length} PENDING</Text>
          </View>
        </View>
        <Text style={styles.alertIntro}>{list.length ? "System blocked these executions pending human approval." : "No active escalations."}</Text>
        {list.length ? (
          <FlatList data={list} keyExtractor={(item) => item.id} renderItem={({ item }) => <AlertCard item={item} onTakeOver={() => takeOver(item)} onOpen={() => navigation.navigate("Details", { leadId: item.id })} />} contentContainerStyle={styles.alertList} showsVerticalScrollIndicator={false} />
        ) : (
          <View style={styles.emptyAlerts}>
            <View style={styles.emptyAlertsIcon}><Icon name="check" size={26} color={C.success} /></View>
            <Text style={styles.emptyTitle}>Queue Clear</Text>
            <Text style={styles.emptyText}>All systems operating autonomously.</Text>
          </View>
        )}
      </View>
      <Toast message={toast} />
    </Screen>
  );
}

function InfoLine({ label, value, icon, color }) {
  return (
    <View style={styles.infoLine}>
      <View style={styles.infoLabelWrap}>
        <Icon name={icon} size={14} color={color || C.muted} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, color && { color }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function DetailBlock({ eyebrow, title, icon, children }) {
  return (
    <Surface style={styles.detailBlock}>
      <View style={styles.detailBlockHeader}>
        <Icon name={icon} size={18} color={C.text} />
        <View>
          <Text style={styles.detailEyebrow}>{eyebrow}</Text>
          <Text style={styles.detailBlockTitle}>{title}</Text>
        </View>
      </View>
      {children}
    </Surface>
  );
}

function DetailScreen({ route }) {
  const { data, runStatusAction } = useData();
  const navigation = useNavigation();
  const { width } = useWindowDimensions();
  const [toast, setToast] = useState("");
  const item = data.find((entry) => entry.id === route.params?.leadId);
  if (!item) return <Screen><View style={styles.page}><Pressable onPress={() => navigation.navigate("Leads")} style={styles.back}><Icon name="arrow-left" size={16} color={C.muted} /><Text style={styles.backText}>BACK</Text></Pressable><Text style={styles.emptyTitle}>Record Not Found</Text></View></Screen>;
  const channel = channelMeta(item.channel);
  const finish = async (status, message) => {
    try {
      const result = await runStatusAction(item.id, status, "Operator override");
      setToast(`${message}${result.demo ? " (demo)" : ""}`);
    } catch (error) {
      setToast("Failed to mutate record.");
    }
    setTimeout(() => setToast(""), 2400);
  };
  return (
    <Screen scroll>
      <Pressable onPress={() => navigation.goBack()} style={styles.back}>
        <Icon name="arrow-left" size={14} color={C.muted} />
        <Text style={styles.backText}>BACK TO PIPELINE</Text>
      </Pressable>
      <Surface style={styles.detailHero}>
        <View style={styles.detailIdentity}>
          <Avatar initials={item.initials} size={48} />
          <View>
            <Text style={styles.detailName}>{item.customer}</Text>
            <View style={styles.metaLine}>
              <Icon name={channel.icon} size={12} color={channel.color} />
              <Text style={styles.metaText}>{channel.label}</Text>
              <Text style={styles.metaDot}>/</Text>
              <Text style={styles.metaText}>{timeLabel(item.receivedAt)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.detailBadges}>
          <SmallBadge status={item.status} />
          <Urgency value={item.urgency} />
        </View>
      </Surface>
      <View style={[styles.detailLayout, width >= DESKTOP && styles.detailLayoutDesktop]}>
        <View style={styles.detailMain}>
          <DetailBlock eyebrow="SYNTHESIS" title="AI Summary" icon="cpu-64-bit">
            <Text style={styles.detailText}>{item.summary}</Text>
            <View style={styles.infoStack}>
              <InfoLine label="Classification" value={item.sopMatch || "Pending"} icon="tag" color={item.sopMatch ? C.info : undefined} />
              <InfoLine label="Confidence" value={item.aiConfidence ? `${Math.round(Number(item.aiConfidence) * 100)}%` : "N/A"} icon="chart-bar" color={item.aiConfidence ? C.text : undefined} />
              <InfoLine label="Recommendation" value={item.recommendedAction || "Manual Override"} icon="arrow-right-bottom" />
            </View>
          </DetailBlock>
          <DetailBlock eyebrow="TRANSCRIPT" title="Raw Payload" icon="message-text-outline">
            <View style={styles.customerBubble}>
              <Text style={styles.bubbleText}>{item.message || "No payload body found."}</Text>
            </View>
            <View style={styles.aiBubble}>
              <Text style={styles.aiBubbleLabel}>REVAGENT GENERATED</Text>
              <Text style={styles.bubbleText}>{item.suggestedResponse || "Response empty."}</Text>
            </View>
          </DetailBlock>
          {item.harnessTrace.length ? (
            <DetailBlock eyebrow="SYSTEM LOG" title="Decision Graph" icon="graph-outline">
              <Text style={styles.traceIntro}>Bounded execution blocks evaluating state.</Text>
              {item.harnessTrace.map((step, index) => {
                const blocked = ["blocked", "handoff"].includes(step.status);
                return (
                  <View key={`${step.agent}-${index}`} style={styles.traceItem}>
                    <View style={[styles.traceDot, { backgroundColor: blocked ? C.danger : C.border }]} />
                    <View style={styles.traceBody}>
                      <View style={styles.traceTop}>
                        <Text style={styles.traceAgent}>{String(step.agent || "node").toUpperCase().replaceAll("_", " ")}</Text>
                        <Text style={[styles.traceStatus, { color: blocked ? C.danger : C.muted }]}>{String(step.status || "complete").toUpperCase()}</Text>
                      </View>
                      <Text style={styles.traceStage}>{step.stage}</Text>
                      <Text style={styles.traceDetail}>{step.detail}</Text>
                    </View>
                  </View>
                );
              })}
            </DetailBlock>
          ) : null}
        </View>
        <View style={styles.detailSide}>
          <Surface style={styles.actionCard}>
            <Text style={styles.actionEyebrow}>OPERATOR CONTROLS</Text>
            <Text style={styles.actionTitle}>Override Protocol</Text>
            <Text style={styles.actionText}>Inject human judgment into the pipeline.</Text>
            {item.status === "escalated" ? (
              <PrimaryButton label="Assume Control" icon="hand-back-right-outline" onPress={() => finish("resolved", `Assumed control of ${item.customer}`)} />
            ) : (
              <PrimaryButton label="Force Resolve" icon="check" onPress={() => finish("resolved", `Forced resolve on ${item.customer}`)} />
            )}
            <View style={{ height: 10 }} />
            <OutlineButton label="Halt & Escalate" icon="stop" danger onPress={() => finish("escalated", `Halted ${item.customer}`)} />
          </Surface>
        </View>
      </View>
      <Toast message={toast} />
    </Screen>
  );
}

const tabs = {
  Home: { label: "OVERVIEW", icon: "view-dashboard-outline", active: "view-dashboard" },
  Leads: { label: "PIPELINE", icon: "database-outline", active: "database" },
  Alerts: { label: "ALERTS", icon: "bell-outline", active: "bell" },
};

function AppTabBar({ state, navigation }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= DESKTOP;
  return (
    <View style={[styles.tabBarShell, desktop && styles.tabBarDesktop]}>
      <View style={[styles.tabDock, desktop && styles.tabDockDesktop, !desktop && { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {state.routes.map((route, index) => {
          const config = tabs[route.name];
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
          };
          return (
            <Pressable key={route.key} onPress={onPress} style={({ pressed }) => [styles.tabItem, focused && styles.tabItemFocused, pressed && styles.pressed]}>
              <Icon name={focused ? config.active : config.icon} size={20} color={focused ? C.text : C.muted} />
              <Text style={[styles.tabLabel, focused && styles.tabLabelFocused]}>{config.label}</Text>
              {route.name === "Alerts" ? <View style={styles.navAlertDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabGroup() {
  return (
    <Tab.Navigator tabBar={(props) => <AppTabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg } }}>
      <Tab.Screen name="Home" component={Dashboard} />
      <Tab.Screen name="Leads" component={LeadsScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  dark: true,
  colors: {
    primary: C.text,
    background: C.bg,
    card: C.card,
    text: C.text,
    border: C.border,
    notification: C.danger,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
            <Stack.Screen name="Main" component={TabGroup} />
            <Stack.Screen name="Details" component={DetailScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </DataProvider>
    </SafeAreaProvider>
  );
}

// VIBE CODED STYLES: Brutalist, Sharp, High Contrast, Geometric
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  frame: { flex: 1, width: "100%", paddingHorizontal: 20 },
  frameDesktop: { maxWidth: 1040, alignSelf: "center", paddingHorizontal: 30 },
  scrollContent: { flexGrow: 1, paddingBottom: 108 },
  scrollContentDesktop: { paddingBottom: 120 },
  
  // HEADERS
  liveHeader: { paddingTop: 24, paddingBottom: 32 },
  liveLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, backgroundColor: C.success }, // Removed border radius for sharp square
  liveText: { color: C.text, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1.5 },
  liveRule: { flex: 1, height: 1, backgroundColor: C.border, marginLeft: 12 },
  appTitle: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 32, letterSpacing: -1.5, marginTop: 16 },
  appSubtitle: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 4 },
  
  // BANNERS
  connectionBanner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderRadius: 4 },
  connectionBannerConnecting: { backgroundColor: C.warningSoft, borderColor: "rgba(245,158,11,0.3)" },
  connectionBannerOffline: { backgroundColor: C.dangerSoft, borderColor: "rgba(239,68,68,0.3)" },
  connectionBannerCopy: { flex: 1 },
  connectionBannerTitle: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1 },
  connectionBannerText: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 },
  
  // HERO
  commandHero: {
    minHeight: 280,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    padding: 32,
    marginBottom: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
  },
  heroCopy: { flex: 1 },
  heroKicker: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 12 },
  heroTitle: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 36, lineHeight: 40, letterSpacing: -1.5 },
  heroBody: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, maxWidth: 400, marginTop: 12 },
  heroActions: { flexDirection: "row", alignItems: "center", gap: 16, marginTop: 24 },
  heroLiveNote: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroLiveText: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1 },
  
  // ORBIT ANIMATION
  orbitStage: { width: 180, height: 180, alignItems: "center", justifyContent: "center" },
  orbitOuter: { position: "absolute", width: 160, height: 160, borderRadius: 80, borderWidth: 1, borderColor: C.border, borderStyle: "dashed" },
  orbitNode: { position: "absolute", width: 8, height: 8, backgroundColor: C.muted }, // Removed glow and border radius
  orbitNodeTop: { top: -4, left: 76 },
  orbitNodeRight: { right: -4, top: 76, backgroundColor: C.text },
  orbitNodeBottom: { bottom: -4, left: 76 },
  orbitCore: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border },
  orbitCoreLabel: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 4 },
  orbitCaption: { position: "absolute", bottom: -10, alignItems: "center" },
  orbitCaptionTop: { color: C.text, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1 },
  orbitCaptionBottom: { color: C.muted, fontFamily: 'Inter_500Medium', fontSize: 9, marginTop: 4 },
  
  // PILLS
  signalRail: { flexDirection: "row", gap: 8, marginBottom: 24 },
  signalPill: { flex: 1, minHeight: 64, justifyContent: "center", paddingHorizontal: 12, borderRadius: 6, borderWidth: 1 },
  signalPillValue: { fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: -1 },
  signalPillLabel: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 0.5, marginTop: 4 },
  
  // CARDS
  surface: { backgroundColor: C.cardSoft, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  decisionCard: { padding: 20, marginBottom: 16, backgroundColor: C.bgDeep, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  decisionHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  decisionEyebrow: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1, marginBottom: 8 },
  decisionTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 18, letterSpacing: -0.5 },
  decisionVerdict: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, borderWidth: 1 },
  decisionVerdictDot: { width: 6, height: 6 },
  decisionVerdictText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 0.5 },
  decisionMessage: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 16, maxWidth: "90%" },
  decisionFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  decisionMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  decisionMetaText: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9 },
  
  // DASHBOARD LAYOUT
  dashboardColumns: { gap: 24 },
  dashboardColumnsDesktop: { flexDirection: "row", alignItems: "flex-start", gap: 24 },
  dashboardPrimary: { flex: 1.2, gap: 24 },
  dashboardSecondary: { flex: 0.8, gap: 24 },
  
  // PIPELINE STATE
  pipeline: { paddingTop: 16 },
  pipelineHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  panelTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  panelHint: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 2 },
  pipelineRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 20 },
  pipelineStage: { flex: 1, alignItems: "flex-start" }, // Aligned left instead of center for brutalist look
  pipelineDot: { width: 12, height: 4, marginBottom: 8 }, // Line instead of dot
  pipelineCount: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: -1 },
  pipelineLabel: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1, marginTop: 4 },
  pipelineBottom: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border },
  pipelineLiveDot: { width: 6, height: 6, backgroundColor: C.danger },
  pipelineBottomText: { color: C.muted, fontFamily: 'Inter_500Medium', fontSize: 11, flex: 1 },
  pipelineBottomRight: { color: C.text, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1 },
  
  // LISTS & SECTIONS
  section: { gap: 12 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLink: { color: C.text, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1 },
  liveMini: { color: C.success, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1.5 },
  attentionItem: { minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  attentionRail: { width: 4, height: 32, backgroundColor: C.danger, marginLeft: -16 },
  attentionCopy: { flex: 1 },
  attentionNameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  attentionName: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
  attentionReason: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  metaLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
  metaText: { color: C.muted, fontFamily: 'JetBrainsMono_400Regular', fontSize: 10 },
  metaDot: { color: C.faint, fontFamily: 'JetBrainsMono_400Regular', fontSize: 10 },
  
  // BADGES & BUTTONS
  urgency: { paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4 },
  urgencyText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 0.5 },
  smallBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 4, borderRadius: 4, borderWidth: 1 },
  smallBadgeDot: { width: 4, height: 4 },
  smallBadgeText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 8, letterSpacing: 0.5 },
  primaryPress: { alignSelf: 'flex-start' },
  primaryButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, backgroundColor: C.accent, borderRadius: 4 },
  primaryButtonText: { color: "#000000", fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  outlineButton: { minHeight: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, backgroundColor: "transparent", borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  outlineDanger: { borderColor: C.danger },
  outlineButtonText: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  pressed: { opacity: 0.6 },
  
  // AVATAR
  avatar: { backgroundColor: C.border, alignItems: "center", justifyContent: "center" },
  avatarText: { color: C.text, fontFamily: 'Inter_600SemiBold' },
  
  // ACTIVITY LOG
  activityItem: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  activityMarker: { width: 32, height: 32, borderRadius: 4, alignItems: "center", justifyContent: "center" },
  activityCopy: { flex: 1 },
  activityText: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 },
  activityName: { color: C.text, fontFamily: 'Inter_600SemiBold' },
  activityTime: { color: C.faint, fontFamily: 'JetBrainsMono_400Regular', fontSize: 10, marginTop: 4 },
  
  // HARNESS LOG
  harnessSummary: { padding: 16, marginBottom: 24, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  harnessSummaryTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  harnessSummaryTitleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  harnessSummaryIcon: { width: 32, height: 32, borderRadius: 4, alignItems: "center", justifyContent: "center", backgroundColor: C.whiteSoft },
  harnessSummaryEyebrow: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1 },
  harnessSummaryTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 4 },
  harnessVerdict: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 4, backgroundColor: C.successSoft },
  harnessVerdictBlocked: { backgroundColor: C.dangerSoft },
  harnessVerdictDot: { width: 6, height: 6 },
  harnessVerdictText: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 0.5 },
  harnessStages: { flexDirection: "row", alignItems: "center", marginTop: 16 },
  harnessStage: { flex: 1, flexDirection: "row", alignItems: "center" },
  harnessStageDot: { width: 8, height: 8, flexShrink: 0 },
  harnessStageLabel: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 8, letterSpacing: 0.5, marginLeft: 8 },
  harnessStageLine: { flex: 1, height: 1, marginHorizontal: 8, backgroundColor: C.border },
  
  // SUBPAGES
  page: { flex: 1, paddingTop: 24 },
  simpleHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 },
  eyebrow: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  pageTitle: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 32, letterSpacing: -1 },
  countBubble: { alignItems: "center", minWidth: 64, padding: 8, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  countNumber: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 16 },
  countLabel: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, marginTop: 4 },
  
  search: { height: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, borderRadius: 4, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border },
  searchInput: { flex: 1, color: C.text, fontFamily: 'Inter_400Regular', fontSize: 14 },
  
  filterScroll: { flexGrow: 0, flexShrink: 0 },
  filters: { alignItems: "center", gap: 8, paddingVertical: 16 },
  filter: { alignSelf: "flex-start", height: 32, justifyContent: "center", paddingHorizontal: 12, borderRadius: 4, backgroundColor: "transparent", borderWidth: 1, borderColor: C.border },
  filterActive: { backgroundColor: C.text, borderColor: C.text },
  filterText: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 0.5 },
  filterTextActive: { color: C.bg },
  
  listHeading: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 8 },
  listTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  leadsListScroll: { flex: 1 },
  leadsList: { gap: 12, paddingBottom: 120 },
  leadRow: { minHeight: 88, flexDirection: "row", alignItems: "center", gap: 16, padding: 16, borderRadius: 8, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border },
  leadRail: { width: 4, height: 48, marginLeft: -16 },
  leadCopy: { flex: 1 },
  leadTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  leadName: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 14, flex: 1 },
  leadSummary: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 6 },
  
  emptyList: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 16 },
  emptyText: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 8 },
  
  // ALERTS SPECIFIC
  openBubble: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: C.danger, borderRadius: 4, backgroundColor: C.dangerSoft },
  openDot: { width: 6, height: 6, backgroundColor: C.danger },
  openText: { color: C.danger, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1 },
  alertIntro: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 24 },
  alertList: { gap: 16, paddingBottom: 120 },
  alertCard: { padding: 20, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  alertRail: { position: "absolute", left: 0, top: 20, bottom: 20, width: 4, backgroundColor: C.danger },
  alertTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  alertIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  alertReason: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 15 },
  alertSub: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  alertLine: { flexDirection: "row", alignItems: "center", gap: 8, marginLeft: 54, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.border },
  alertLineText: { color: C.faint, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, flexShrink: 1 },
  alertDot: { color: C.border, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10 },
  alertActions: { flexDirection: "row", alignItems: "center", gap: 12, marginLeft: 54, marginTop: 16 },
  emptyAlerts: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 100 },
  emptyAlertsIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border },
  
  // DETAILS PAGE
  back: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", paddingVertical: 8, marginBottom: 20 },
  backText: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 10, letterSpacing: 1 },
  detailHero: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 20, marginBottom: 24, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  detailIdentity: { flexDirection: "row", alignItems: "center", gap: 16, flex: 1 },
  detailName: { color: C.text, fontFamily: 'Inter_700Bold', fontSize: 20 },
  detailBadges: { alignItems: "flex-end", gap: 8 },
  detailLayout: { gap: 24, paddingBottom: 100 },
  detailLayoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  detailMain: { flex: 1.2, gap: 24 },
  detailSide: { flex: 0.8, gap: 24 },
  detailBlock: { padding: 20, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  detailBlockHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  detailEyebrow: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1.5, marginBottom: 4 },
  detailBlockTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  detailText: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22 },
  infoStack: { marginTop: 20, borderTopWidth: 1, borderTopColor: C.border },
  infoLine: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  infoLabelWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  infoLabel: { color: C.muted, fontFamily: 'JetBrainsMono_400Regular', fontSize: 11 },
  infoValue: { color: C.text, flex: 1, textAlign: "right", fontFamily: 'Inter_500Medium', fontSize: 12 },
  
  // CHAT BUBBLES
  customerBubble: { alignSelf: "flex-start", maxWidth: "90%", padding: 16, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 8, borderTopLeftRadius: 0 },
  aiBubble: { alignSelf: "flex-end", maxWidth: "90%", padding: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 8, borderTopRightRadius: 0, marginTop: 16 },
  aiBubbleLabel: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1, marginBottom: 8 },
  bubbleText: { color: C.text, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20 },
  
  // TRACE LOG
  traceIntro: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 20 },
  traceItem: { flexDirection: "row", gap: 12, paddingBottom: 20 },
  traceDot: { width: 8, height: 8, marginTop: 6 },
  traceBody: { flex: 1 },
  traceTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  traceAgent: { color: C.text, fontFamily: 'JetBrainsMono_700Bold', fontSize: 11, letterSpacing: 0.5 },
  traceStatus: { fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1 },
  traceStage: { color: C.muted, fontFamily: 'JetBrainsMono_400Regular', fontSize: 9, marginTop: 4, textTransform: "uppercase" },
  traceDetail: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 8 },
  
  // ACTION CARD
  actionCard: { padding: 20, backgroundColor: C.bgDeep, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  actionEyebrow: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 1 },
  actionTitle: { color: C.text, fontFamily: 'Inter_600SemiBold', fontSize: 16, marginTop: 8 },
  actionText: { color: C.muted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 8, marginBottom: 20 },
  
  // NAVIGATION
  tabBarShell: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center" },
  tabBarDesktop: { bottom: 24 },
  tabDock: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingTop: 12, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.border },
  tabDockDesktop: { width: 400, paddingBottom: 12, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  tabItem: { position: "relative", minWidth: 80, minHeight: 64, alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 8 },
  tabItemFocused: { backgroundColor: C.bgDeep },
  tabLabel: { color: C.muted, fontFamily: 'JetBrainsMono_700Bold', fontSize: 9, letterSpacing: 0.5 },
  tabLabelFocused: { color: C.text },
  navAlertDot: { position: "absolute", top: 12, right: "32%", width: 6, height: 6, backgroundColor: C.danger },
  
  // TOAST
  toast: { position: "absolute", left: 20, right: 20, bottom: 100, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  toastText: { color: C.text, fontFamily: 'Inter_500Medium', fontSize: 12 },
});