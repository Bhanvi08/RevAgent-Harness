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
import { LinearGradient } from "expo-linear-gradient";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { NavigationContainer, useNavigation } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { MOCK_DATA } from "./mock/data";

const C = {
  bg: "#0A0F1B",
  bgDeep: "#080C15",
  card: "#182137",
  cardSoft: "#141C2E",
  border: "#2B3854",
  text: "#F5F6FB",
  muted: "#9BA6BB",
  faint: "#68758E",
  violet: "#8057F5",
  violetDeep: "#5D36D8",
  mint: "#16D9C0",
  mintSoft: "rgba(22,217,192,0.12)",
  coral: "#FF5B7A",
  coralSoft: "rgba(255,91,122,0.13)",
  blue: "#7EA2FF",
  blueSoft: "rgba(126,162,255,0.13)",
  amber: "#FFC15F",
  amberSoft: "rgba(255,193,95,0.13)",
  whiteSoft: "rgba(255,255,255,0.055)",
};

const DESKTOP = 860;
const API_BASE_URL = "http://127.0.0.1:8000";
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function normalize(item) {
  const status = String(item.status ?? "new").toLowerCase();
  const customer = item.customer ?? item.customer_name ?? "Unknown contact";
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
    history: Array.isArray(item.history) ? item.history : [],
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

const DataContext = createContext(null);

function DataProvider({ children }) {
  const [data, setData] = useState([]);
  const [connection, setConnection] = useState("connecting");
  const [loading, setLoading] = useState(true);

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
      setData(Array.isArray(records) ? records.map(normalize) : []);
      setConnection("live");
    } catch (error) {
      console.warn("RevAgent API unavailable; using demo data.", error);
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
      refresh: loadEnquiries,
    }),
    [data, updateStatus, runStatusAction, connection, loading, loadEnquiries],
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
    new: {
      label: "NEW",
      color: C.muted,
      bg: C.whiteSoft,
      icon: "circle-outline",
    },
    received: {
      label: "RECEIVED",
      color: C.muted,
      bg: C.whiteSoft,
      icon: "inbox-arrow-down-outline",
    },
    processing: {
      label: "PROCESSING",
      color: C.amber,
      bg: C.amberSoft,
      icon: "progress-clock",
    },
    processed: {
      label: "AI PROCESSED",
      color: C.blue,
      bg: C.blueSoft,
      icon: "robot-outline",
    },
    qualified: {
      label: "QUALIFIED",
      color: C.blue,
      bg: C.blueSoft,
      icon: "check-decagram-outline",
    },
    escalated: {
      label: "ESCALATED",
      color: C.coral,
      bg: C.coralSoft,
      icon: "alert-outline",
    },
    resolved: {
      label: "RESOLVED",
      color: C.mint,
      bg: C.mintSoft,
      icon: "check-circle-outline",
    },
  };
  return values[status] ?? values.new;
}

function channelMeta(channel) {
  const values = {
    whatsapp: { label: "WhatsApp", icon: "whatsapp", color: "#55D98A" },
    call: { label: "Call", icon: "phone-outline", color: C.blue },
    email: { label: "Email", icon: "email-outline", color: C.violet },
    sms: { label: "SMS", icon: "message-text-outline", color: C.amber },
  };
  return (
    values[channel] ?? {
      label: "Other",
      icon: "message-outline",
      color: C.muted,
    }
  );
}

function urgencyMeta(urgency) {
  const values = {
    high: { label: "URGENT", color: C.coral, bg: C.coralSoft },
    medium: { label: "REVIEW", color: C.amber, bg: C.amberSoft },
    low: { label: "NORMAL", color: C.faint, bg: C.whiteSoft },
  };
  return values[urgency] ?? values.low;
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - date.getTime()) / 60000),
  );
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
      Animated.timing(opacity, {
        toValue: 1,
        duration: 360,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 360,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, translateY]);

  return (
    <Animated.View style={{ flex: 1, opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

function PulseDot({ color = C.mint }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.55,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 950,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        styles.liveDot,
        { backgroundColor: color, transform: [{ scale: pulse }] },
      ]}
    />
  );
}

function Screen({ children, scroll = false, style }) {
  const { width } = useWindowDimensions();
  const desktop = width >= DESKTOP;
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
            contentContainerStyle={[
              styles.scrollContent,
              desktop && styles.scrollContentDesktop,
            ]}
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

function LiveHeader({
  title = "RevAgent",
  subtitle = "Autonomous revenue agent, watching your pipeline",
  connection = "live",
}) {
  const isLive = connection === "live";
  return (
    <View style={styles.liveHeader}>
      <View style={styles.liveLine}>
        <PulseDot color={isLive ? C.mint : C.amber} />
        <Text style={[styles.liveText, !isLive && { color: C.amber }]}>
          {isLive
            ? "LIVE"
            : connection === "connecting"
              ? "CONNECTING"
              : "DEMO MODE"}
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
    <View style={[styles.smallBadge, { backgroundColor: meta.bg }]}>
      <View style={[styles.smallBadgeDot, { backgroundColor: meta.color }]} />
      <Text style={[styles.smallBadgeText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function Urgency({ value }) {
  const meta = urgencyMeta(value);
  return (
    <View style={[styles.urgency, { backgroundColor: meta.bg }]}>
      <Text style={[styles.urgencyText, { color: meta.color }]}>
        {meta.label}
      </Text>
    </View>
  );
}

function Avatar({ initials, size = 42 }) {
  return (
    <LinearGradient
      colors={[C.violet, C.mint]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text
        style={[styles.avatarText, { fontSize: Math.max(11, size * 0.31) }]}
      >
        {initials}
      </Text>
    </LinearGradient>
  );
}

function PrimaryButton({ label, icon = "arrow-right", onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.primaryPress, pressed && styles.pressed]}
    >
      <LinearGradient
        colors={[C.violet, C.violetDeep]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryButton}
      >
        <Text style={styles.primaryButtonText}>{label}</Text>
        <Icon name={icon} size={16} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
}

function OutlineButton({ label, icon, onPress, danger = false }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.outlineButton,
        danger && styles.outlineDanger,
        pressed && styles.pressed,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={15} color={danger ? C.coral : C.muted} />
      ) : null}
      <Text style={[styles.outlineButtonText, danger && { color: C.coral }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <View style={styles.toast}>
      <Icon name="check-circle" size={17} color={C.mint} />
      <Text style={styles.toastText}>{message}</Text>
    </View>
  );
}

function StatCard({ label, value, caption, colors, icon }) {
  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.statCard}
    >
      <View style={styles.statTop}>
        <View style={styles.statIcon}>
          <Icon name={icon} size={17} color="#FFFFFF" />
        </View>
        <Icon name="arrow-top-right" size={17} color="rgba(255,255,255,0.7)" />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statCaption}>{caption}</Text>
    </LinearGradient>
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
          {item.status === "escalated"
            ? " needs human review"
            : item.status === "qualified"
              ? " qualified by AI"
              : item.status === "resolved"
                ? " was resolved"
                : " entered the pipeline"}
        </Text>
        <Text style={styles.activityTime}>{relativeTime(item.receivedAt)}</Text>
      </View>
      <SmallBadge status={item.status} />
    </View>
  );
}

function MiniPipeline({ data }) {
  const stages = [
    {
      label: "NEW",
      count: data.filter((item) => ["new", "received"].includes(item.status)),
      color: C.muted,
    },
    {
      label: "AI",
      count: data.filter((item) =>
        ["processing", "processed"].includes(item.status),
      ),
      color: C.amber,
    },
    {
      label: "QUALIFIED",
      count: data.filter((item) => item.status === "qualified"),
      color: C.blue,
    },
    {
      label: "DONE",
      count: data.filter((item) => item.status === "resolved"),
      color: C.mint,
    },
  ];
  return (
    <Surface style={styles.pipeline}>
      <View style={styles.pipelineHeading}>
        <Text style={styles.panelTitle}>Pipeline pulse</Text>
        <Text style={styles.panelHint}>today</Text>
      </View>
      <View style={styles.pipelineRow}>
        {stages.map((stage, index) => (
          <React.Fragment key={stage.label}>
            <View style={styles.pipelineStage}>
              <View
                style={[styles.pipelineDot, { backgroundColor: stage.color }]}
              />
              <Text style={styles.pipelineCount}>{stage.count.length}</Text>
              <Text style={styles.pipelineLabel}>{stage.label}</Text>
            </View>
            {index < stages.length - 1 ? (
              <Icon name="chevron-right" size={16} color={C.faint} />
            ) : null}
          </React.Fragment>
        ))}
      </View>
      <View style={styles.pipelineBottom}>
        <View style={styles.pipelineLiveDot} />
        <Text style={styles.pipelineBottomText}>
          {data.filter((item) => item.status === "escalated").length} escalation
          signal
          {data.filter((item) => item.status === "escalated").length === 1
            ? ""
            : "s"}{" "}
          active
        </Text>
        <Text style={styles.pipelineBottomRight}>AI watching</Text>
      </View>
    </Surface>
  );
}

function AttentionItem({ item, onPress }) {
  const channel = channelMeta(item.channel);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.attentionItem, pressed && styles.pressed]}
    >
      <View style={styles.attentionRail} />
      <Avatar initials={item.initials} size={40} />
      <View style={styles.attentionCopy}>
        <View style={styles.attentionNameRow}>
          <Text style={styles.attentionName}>{item.customer}</Text>
          <Urgency value={item.urgency} />
        </View>
        <Text style={styles.attentionReason} numberOfLines={1}>
          {item.reason}
        </Text>
        <View style={styles.metaLine}>
          <Icon name={channel.icon} size={13} color={channel.color} />
          <Text style={styles.metaText}>{channel.label}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{relativeTime(item.receivedAt)}</Text>
        </View>
      </View>
      <Icon name="chevron-right" size={19} color={C.faint} />
    </Pressable>
  );
}

function Dashboard() {
  const { data, connection } = useData();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const desktop = width >= DESKTOP;
  const escalations = data.filter((item) => item.status === "escalated");
  const processed = data.filter(
    (item) => !["new", "received"].includes(item.status),
  ).length;
  const qualified = data.filter((item) => item.status === "qualified").length;

  return (
    <Screen scroll>
      <LiveHeader connection={connection} />
      <View style={styles.dashboardIntro}>
        <View>
          <Text style={styles.introEyebrow}>PIPELINE CONTROL</Text>
          <Text style={styles.introTitle}>A quieter way to close.</Text>
          <Text style={styles.introText}>
            RevAgent catches the conversations that need a human touch.
          </Text>
        </View>
        <View style={styles.signalOrb}>
          <View style={styles.signalOrbInner}>
            <Icon name="radar" size={24} color={C.mint} />
          </View>
          <Text style={styles.signalLabel}>AGENT ACTIVE</Text>
        </View>
      </View>
      <View style={[styles.statsRow, desktop && styles.statsRowDesktop]}>
        <StatCard
          icon="account-multiple-outline"
          label="Total leads"
          value={data.length}
          caption="in your pipeline"
          colors={[C.violet, C.violetDeep]}
        />
        <StatCard
          icon="alert-outline"
          label="Escalations"
          value={escalations.length}
          caption={escalations.length ? "need attention" : "queue clear"}
          colors={[C.coral, "#C8325A"]}
        />
      </View>
      <View
        style={[
          styles.dashboardColumns,
          desktop && styles.dashboardColumnsDesktop,
        ]}
      >
        <View style={styles.dashboardPrimary}>
          <MiniPipeline data={data} />
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.panelTitle}>Needs attention</Text>
                <Text style={styles.panelHint}>
                  {escalations.length
                    ? "Highest priority first"
                    : "Nothing waiting"}
                </Text>
              </View>
              <Text style={styles.sectionLink}>
                {escalations.length ? "open queue" : "clear"}
              </Text>
            </View>
            <Surface>
              {escalations.length ? (
                escalations
                  .slice(0, 3)
                  .map((item) => (
                    <AttentionItem
                      key={item.id}
                      item={item}
                      onPress={() =>
                        navigation.navigate("Details", { leadId: item.id })
                      }
                    />
                  ))
              ) : (
                <View style={styles.clearInline}>
                  <Icon name="shield-check-outline" size={24} color={C.mint} />
                  <Text style={styles.clearInlineText}>
                    Your attention queue is clear.
                  </Text>
                </View>
              )}
            </Surface>
          </View>
        </View>
        <View style={styles.dashboardSecondary}>
          <View style={styles.section}>
            <View style={styles.sectionHeading}>
              <View>
                <Text style={styles.panelTitle}>Agent activity</Text>
                <Text style={styles.panelHint}>
                  the latest pipeline movement
                </Text>
              </View>
              <Text style={styles.liveMini}>LIVE</Text>
            </View>
            <Surface>
              {data.slice(0, 4).map((item, index) => (
                <ActivityItem
                  key={item.id}
                  item={item}
                  last={index === Math.min(data.length, 4) - 1}
                />
              ))}
            </Surface>
          </View>
          <Surface style={styles.agentNote}>
            <View style={styles.agentNoteTop}>
              <View style={styles.agentNoteIcon}>
                <Icon name="auto-fix" size={18} color={C.mint} />
              </View>
              <Text style={styles.agentNoteTitle}>What the agent is doing</Text>
            </View>
            <Text style={styles.agentNoteText}>
              Classifying intent, spotting uncertainty, and handing sensitive
              moments back to you.
            </Text>
            <View style={styles.agentNoteStats}>
              <View>
                <Text style={styles.agentNoteNumber}>{processed}</Text>
                <Text style={styles.agentNoteLabel}>processed</Text>
              </View>
              <View>
                <Text style={styles.agentNoteNumber}>{qualified}</Text>
                <Text style={styles.agentNoteLabel}>qualified</Text>
              </View>
              <View>
                <Text style={[styles.agentNoteNumber, { color: C.coral }]}>
                  {escalations.length}
                </Text>
                <Text style={styles.agentNoteLabel}>escalated</Text>
              </View>
            </View>
          </Surface>
        </View>
      </View>
    </Screen>
  );
}

function LeadRow({ item, onPress }) {
  const channel = channelMeta(item.channel);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.leadRow, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.leadRail,
          {
            backgroundColor:
              item.urgency === "high"
                ? C.coral
                : item.status === "qualified"
                  ? C.blue
                  : C.faint,
          },
        ]}
      />
      <Avatar initials={item.initials} size={42} />
      <View style={styles.leadCopy}>
        <View style={styles.leadTop}>
          <Text style={styles.leadName} numberOfLines={1}>
            {item.customer}
          </Text>
          <SmallBadge status={item.status} />
        </View>
        <Text style={styles.leadSummary} numberOfLines={1}>
          {item.summary}
        </Text>
        <View style={styles.metaLine}>
          <Icon name={channel.icon} size={13} color={channel.color} />
          <Text style={styles.metaText}>{channel.label}</Text>
          <Text style={styles.metaDot}>•</Text>
          <Text style={styles.metaText}>{timeLabel(item.receivedAt)}</Text>
          {item.urgency === "high" ? (
            <>
              <Text style={styles.metaDot}>•</Text>
              <Urgency value={item.urgency} />
            </>
          ) : null}
        </View>
      </View>
      <Icon name="chevron-right" size={19} color={C.faint} />
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
    () =>
      data.filter((item) => {
        const matchesFilter = filter === "all" || item.status === filter;
        const q = query.toLowerCase().trim();
        const matchesQuery =
          !q ||
          [item.customer, item.summary, item.reason, item.channel].some(
            (value) =>
              String(value ?? "")
                .toLowerCase()
                .includes(q),
          );
        return matchesFilter && matchesQuery;
      }),
    [data, filter, query],
  );
  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.simpleHeader}>
          <View>
            <Text style={styles.eyebrow}>ALL CONTACTS</Text>
            <Text style={styles.pageTitle}>Leads</Text>
          </View>
          <View style={styles.countBubble}>
            <Text style={styles.countNumber}>{filtered.length}</Text>
            <Text style={styles.countLabel}>shown</Text>
          </View>
        </View>
        <View style={styles.search}>
          <Icon name="magnify" size={19} color={C.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search your pipeline"
            placeholderTextColor={C.faint}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")}>
              <Icon name="close-circle" size={17} color={C.faint} />
            </Pressable>
          ) : null}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filters}
        >
          {filters.map((item) => (
            <Pressable
              key={item}
              onPress={() => setFilter(item)}
              style={[styles.filter, filter === item && styles.filterActive]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === item && styles.filterTextActive,
                ]}
              >
                {item === "all" ? "All" : item[0].toUpperCase() + item.slice(1)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.listHeading}>
          <Text style={styles.listTitle}>
            {filter === "all"
              ? "Recent enquiries"
              : `${filter[0].toUpperCase() + filter.slice(1)} enquiries`}
          </Text>
          <Text style={styles.listHint}>{filtered.length} total</Text>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LeadRow
              item={item}
              onPress={() =>
                navigation.navigate("Details", { leadId: item.id })
              }
            />
          )}
          contentContainerStyle={styles.leadsList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Icon name="magnify-close" size={28} color={C.faint} />
              <Text style={styles.emptyTitle}>No leads found</Text>
              <Text style={styles.emptyText}>
                Try a different filter or search term.
              </Text>
            </View>
          }
        />
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
            <Text style={styles.alertSub}>
              {item.customer} is waiting via {channel.label}
            </Text>
          </View>
        </View>
        <Urgency value={item.urgency} />
      </View>
      <View style={styles.alertLine}>
        <Icon name="clock-outline" size={14} color={C.coral} />
        <Text style={styles.alertLineText}>
          Waiting {relativeTime(item.receivedAt)}
        </Text>
        <Text style={styles.alertDot}>•</Text>
        <Text style={styles.alertLineText}>
          {item.recommendedAction || "Review conversation"}
        </Text>
      </View>
      <View style={styles.alertActions}>
        <OutlineButton
          label="View enquiry"
          icon="open-in-new"
          onPress={onOpen}
        />
        <PrimaryButton
          label="Take over"
          icon="hand-back-right-outline"
          onPress={onTakeOver}
        />
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
      const result = await runStatusAction(
        item.id,
        "resolved",
        "Operator took over conversation",
      );
      setToast(
        `${item.customer} moved to resolved${result.demo ? " (demo)" : ""}`,
      );
    } catch (error) {
      console.warn("Could not resolve enquiry", error);
      setToast("Could not update the enquiry");
    }
    setTimeout(() => setToast(""), 2400);
  };
  return (
    <Screen>
      <View style={styles.page}>
        <View style={styles.simpleHeader}>
          <View>
            <Text style={styles.eyebrow}>NEEDS ATTENTION</Text>
            <Text style={styles.pageTitle}>Alerts</Text>
          </View>
          <View style={styles.openBubble}>
            <View style={styles.openDot} />
            <Text style={styles.openText}>{list.length} open</Text>
          </View>
        </View>
        <Text style={styles.alertIntro}>
          {list.length
            ? "RevAgent paused these conversations for a human decision."
            : "RevAgent is monitoring the pipeline. Nothing needs you right now."}
        </Text>
        {list.length ? (
          <FlatList
            data={list}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <AlertCard
                item={item}
                onTakeOver={() => takeOver(item)}
                onOpen={() =>
                  navigation.navigate("Details", { leadId: item.id })
                }
              />
            )}
            contentContainerStyle={styles.alertList}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={styles.emptyAlerts}>
            <View style={styles.emptyAlertsIcon}>
              <Icon name="shield-check-outline" size={31} color={C.mint} />
            </View>
            <Text style={styles.emptyTitle}>Queue is clear</Text>
            <Text style={styles.emptyText}>
              New escalation signals will appear here.
            </Text>
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
        <Icon name={icon} size={15} color={color || C.faint} />
        <Text style={styles.infoLabel}>{label}</Text>
      </View>
      <Text style={[styles.infoValue, color && { color }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function DetailBlock({ eyebrow, title, icon, children }) {
  return (
    <Surface style={styles.detailBlock}>
      <View style={styles.detailBlockHeader}>
        <View style={styles.detailIcon}>
          <Icon name={icon} size={17} color={C.violet} />
        </View>
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
  if (!item)
    return (
      <Screen>
        <View style={styles.page}>
          <Pressable onPress={() => navigation.goBack()} style={styles.back}>
            <Icon name="arrow-left" size={18} color={C.muted} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <View style={styles.emptyAlerts}>
            <Text style={styles.emptyTitle}>Lead not found</Text>
          </View>
        </View>
      </Screen>
    );
  const channel = channelMeta(item.channel);
  const finish = async (status, message) => {
    try {
      const result = await runStatusAction(
        item.id,
        status,
        "Operator escalated for review",
      );
      setToast(`${message}${result.demo ? " (demo)" : ""}`);
    } catch (error) {
      console.warn("Could not update enquiry", error);
      setToast("Could not update the enquiry");
    }
    setTimeout(() => setToast(""), 2400);
  };
  return (
    <Screen scroll>
      <Pressable onPress={() => navigation.goBack()} style={styles.back}>
        <Icon name="arrow-left" size={18} color={C.muted} />
        <Text style={styles.backText}>Back to leads</Text>
      </Pressable>
      <Surface style={styles.detailHero}>
        <View style={styles.detailIdentity}>
          <Avatar initials={item.initials} size={54} />
          <View>
            <Text style={styles.detailName}>{item.customer}</Text>
            <View style={styles.metaLine}>
              <Icon name={channel.icon} size={13} color={channel.color} />
              <Text style={styles.metaText}>{channel.label}</Text>
              <Text style={styles.metaDot}>•</Text>
              <Text style={styles.metaText}>{timeLabel(item.receivedAt)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.detailBadges}>
          <SmallBadge status={item.status} />
          <Urgency value={item.urgency} />
        </View>
      </Surface>
      <View
        style={[
          styles.detailLayout,
          width >= DESKTOP && styles.detailLayoutDesktop,
        ]}
      >
        <View style={styles.detailMain}>
          <DetailBlock
            eyebrow="REVAGENT READ"
            title="AI summary"
            icon="robot-outline"
          >
            <Text style={styles.detailText}>{item.summary}</Text>
            <View style={styles.infoStack}>
              <InfoLine
                label="Classification"
                value={item.sopMatch || "Awaiting classification"}
                icon="shape-outline"
                color={item.sopMatch ? C.blue : undefined}
              />
              <InfoLine
                label="Confidence"
                value={
                  item.aiConfidence
                    ? `${Math.round(Number(item.aiConfidence) * 100)}%`
                    : "Not available"
                }
                icon="gauge"
                color={item.aiConfidence ? C.mint : undefined}
              />
              <InfoLine
                label="Next action"
                value={item.recommendedAction || "Review conversation manually"}
                icon="arrow-decision-outline"
              />
            </View>
          </DetailBlock>
          <DetailBlock
            eyebrow="CONVERSATION"
            title="Customer message"
            icon="message-text-outline"
          >
            <View style={styles.customerBubble}>
              <Text style={styles.bubbleText}>
                {item.message ||
                  "The original message is not included in this demo record."}
              </Text>
            </View>
            <LinearGradient
              colors={[C.violet, C.violetDeep]}
              style={styles.aiBubble}
            >
              <Text style={styles.aiBubbleLabel}>REVAGENT</Text>
              <Text style={styles.bubbleTextWhite}>
                {item.suggestedResponse ||
                  "No suggested response has been returned yet."}
              </Text>
            </LinearGradient>
          </DetailBlock>
          <DetailBlock
            eyebrow="AUDIT TRAIL"
            title="Activity"
            icon="timeline-outline"
          >
            {item.history.length ? (
              item.history.map((event, index) => (
                <View key={`${event}-${index}`} style={styles.historyLine}>
                  <View style={styles.historyDot} />
                  <Text style={styles.historyText}>{String(event)}</Text>
                </View>
              ))
            ) : (
              <Text style={styles.emptyText}>
                No additional events have been recorded yet.
              </Text>
            )}
          </DetailBlock>
        </View>
        <View style={styles.detailSide}>
          <Surface style={styles.actionCard}>
            <Text style={styles.actionEyebrow}>HUMAN IN THE LOOP</Text>
            <Text style={styles.actionTitle}>Your call, when it matters.</Text>
            <Text style={styles.actionText}>
              RevAgent handles the routine. You take over the moments that need
              judgment.
            </Text>
            {item.status === "escalated" ? (
              <PrimaryButton
                label="Take over conversation"
                icon="hand-back-right-outline"
                onPress={() =>
                  finish("resolved", `${item.customer} moved to resolved`)
                }
              />
            ) : (
              <PrimaryButton
                label="Mark as resolved"
                icon="check"
                onPress={() =>
                  finish("resolved", `${item.customer} marked as resolved`)
                }
              />
            )}
            <OutlineButton
              label="Escalate for review"
              icon="alert-outline"
              danger
              onPress={() =>
                finish("escalated", `${item.customer} escalated for review`)
              }
            />
          </Surface>
          <DetailBlock
            eyebrow="CONTACT DETAILS"
            title="Context"
            icon="card-account-details-outline"
          >
            <View style={styles.infoStack}>
              <InfoLine
                label="Channel"
                value={channel.label}
                icon={channel.icon}
                color={channel.color}
              />
              <InfoLine
                label="Urgency"
                value={urgencyMeta(item.urgency).label}
                icon="flag-outline"
                color={urgencyMeta(item.urgency).color}
              />
              <InfoLine
                label="Received"
                value={new Date(item.receivedAt).toLocaleDateString([], {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                icon="calendar-outline"
              />
            </View>
          </DetailBlock>
          {item.paymentLink ? (
            <DetailBlock
              eyebrow="AGENTIC COMMERCE"
              title="Payment link ready"
              icon="link-variant"
            >
              <Text style={styles.detailText}>
                RevAgent generated a payment link for this pricing enquiry.
              </Text>
              <OutlineButton
                label="Open payment link"
                icon="open-in-new"
                onPress={() => Linking.openURL(item.paymentLink)}
              />
            </DetailBlock>
          ) : null}
        </View>
      </View>
      <Toast message={toast} />
    </Screen>
  );
}

const tabs = {
  Home: { label: "Home", icon: "home-outline", active: "home" },
  Leads: {
    label: "Leads",
    icon: "account-multiple-outline",
    active: "account-multiple",
  },
  Alerts: { label: "Alerts", icon: "bell-outline", active: "bell" },
};

function AppTabBar({ state, navigation }) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const desktop = width >= DESKTOP;
  return (
    <View style={[styles.tabBarShell, desktop && styles.tabBarDesktop]}>
      <View
        style={[
          styles.tabDock,
          desktop && styles.tabDockDesktop,
          !desktop && { paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        {state.routes.map((route, index) => {
          const config = tabs[route.name];
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented)
              navigation.navigate(route.name);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={({ pressed }) => [
                styles.tabItem,
                focused && styles.tabItemFocused,
                pressed && styles.pressed,
              ]}
            >
              <Icon
                name={focused ? config.active : config.icon}
                size={22}
                color={focused ? C.mint : C.faint}
              />
              <Text
                style={[styles.tabLabel, focused && styles.tabLabelFocused]}
              >
                {config.label}
              </Text>
              {route.name === "Alerts" ? (
                <View style={styles.navAlertDot} />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TabGroup() {
  return (
    <Tab.Navigator
      tabBar={(props) => <AppTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tab.Screen name="Home" component={Dashboard} />
      <Tab.Screen name="Leads" component={LeadsScreen} />
      <Tab.Screen name="Alerts" component={AlertsScreen} />
    </Tab.Navigator>
  );
}

const navTheme = {
  dark: true,
  colors: {
    primary: C.mint,
    background: C.bg,
    card: C.card,
    text: C.text,
    border: C.border,
    notification: C.coral,
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <DataProvider>
        <NavigationContainer theme={navTheme}>
          <Stack.Navigator
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: C.bg },
            }}
          >
            <Stack.Screen name="Main" component={TabGroup} />
            <Stack.Screen name="Details" component={DetailScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </DataProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  safe: { flex: 1 },
  frame: { flex: 1, width: "100%", paddingHorizontal: 20 },
  frameDesktop: { maxWidth: 1180, alignSelf: "center", paddingHorizontal: 30 },
  scrollContent: { flexGrow: 1, paddingBottom: 108 },
  scrollContentDesktop: { paddingBottom: 120 },
  liveHeader: { paddingTop: 11, paddingBottom: 23 },
  liveLine: { flexDirection: "row", alignItems: "center", gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.mint },
  liveText: {
    color: C.mint,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.55,
  },
  liveRule: {
    width: 35,
    height: 1,
    backgroundColor: "rgba(22,217,192,0.35)",
    marginLeft: 3,
  },
  appTitle: {
    color: C.text,
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "900",
    letterSpacing: -1,
  },
  appSubtitle: { color: C.muted, fontSize: 13, marginTop: 3 },
  dashboardIntro: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
    marginBottom: 20,
  },
  introEyebrow: {
    color: C.violet,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.35,
    marginBottom: 5,
  },
  introTitle: {
    color: C.text,
    fontSize: 22,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  introText: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 450,
    marginTop: 4,
  },
  signalOrb: {
    alignItems: "center",
    justifyContent: "center",
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: C.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(22,217,192,0.25)",
  },
  signalOrbInner: {
    width: 43,
    height: 43,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(22,217,192,0.13)",
  },
  signalLabel: {
    color: C.mint,
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginTop: 3,
  },
  statsRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  statsRowDesktop: { gap: 14 },
  statCard: {
    flex: 1,
    minHeight: 145,
    borderRadius: 18,
    padding: 17,
    overflow: "hidden",
  },
  statTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statIcon: {
    width: 31,
    height: 31,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  statValue: {
    color: "#FFFFFF",
    fontSize: 31,
    fontWeight: "900",
    marginTop: 15,
  },
  statLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    marginTop: 1,
  },
  statCaption: { color: "rgba(255,255,255,0.7)", fontSize: 11, marginTop: 4 },
  dashboardColumns: { gap: 20 },
  dashboardColumnsDesktop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 20,
  },
  dashboardPrimary: { flex: 1.15, gap: 20 },
  dashboardSecondary: { flex: 0.85, gap: 20 },
  surface: {
    backgroundColor: C.card,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(143,164,204,0.15)",
    overflow: "hidden",
  },
  pipeline: { paddingTop: 15 },
  pipelineHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
  },
  panelTitle: { color: C.text, fontSize: 15, fontWeight: "900" },
  panelHint: { color: C.faint, fontSize: 10, marginTop: 3 },
  pipelineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 15,
    paddingVertical: 18,
  },
  pipelineStage: { flex: 1, alignItems: "center" },
  pipelineDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 6 },
  pipelineCount: { color: C.text, fontSize: 20, fontWeight: "900" },
  pipelineLabel: {
    color: C.faint,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.45,
    marginTop: 2,
  },
  pipelineBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 15,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(143,164,204,0.12)",
  },
  pipelineLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.coral,
  },
  pipelineBottomText: {
    color: C.muted,
    fontSize: 10,
    fontWeight: "700",
    flex: 1,
  },
  pipelineBottomRight: { color: C.mint, fontSize: 10, fontWeight: "900" },
  section: { gap: 10 },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionLink: { color: C.mint, fontSize: 10, fontWeight: "900" },
  liveMini: {
    color: C.mint,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  attentionItem: {
    minHeight: 77,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(143,164,204,0.12)",
  },
  attentionRail: {
    width: 3,
    height: 42,
    borderRadius: 4,
    backgroundColor: C.coral,
    marginLeft: -7,
  },
  attentionCopy: { flex: 1, minWidth: 0 },
  attentionNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 7,
  },
  attentionName: { color: C.text, fontSize: 13, fontWeight: "900", flex: 1 },
  attentionReason: { color: C.muted, fontSize: 11, marginTop: 3 },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
    marginTop: 6,
  },
  metaText: { color: C.faint, fontSize: 10, fontWeight: "700" },
  metaDot: { color: C.faint, fontSize: 10 },
  urgency: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  urgencyText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.55 },
  smallBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 6,
  },
  smallBadgeDot: { width: 5, height: 5, borderRadius: 3 },
  smallBadgeText: { fontSize: 8, fontWeight: "900", letterSpacing: 0.28 },
  clearInline: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  clearInlineText: { color: C.muted, fontSize: 12, fontWeight: "700" },
  activityItem: {
    minHeight: 67,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  activityBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(143,164,204,0.12)",
  },
  activityMarker: {
    width: 29,
    height: 29,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  activityCopy: { flex: 1, minWidth: 0 },
  activityText: { color: C.muted, fontSize: 11, lineHeight: 16 },
  activityName: { color: C.text, fontWeight: "900" },
  activityTime: { color: C.faint, fontSize: 9, marginTop: 2 },
  agentNote: { padding: 15 },
  agentNoteTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  agentNoteIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.mintSoft,
  },
  agentNoteTitle: { color: C.text, fontSize: 13, fontWeight: "900" },
  agentNoteText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 10,
  },
  agentNoteStats: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(143,164,204,0.12)",
  },
  agentNoteNumber: { color: C.mint, fontSize: 18, fontWeight: "900" },
  agentNoteLabel: { color: C.faint, fontSize: 9, marginTop: 2 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  page: { flex: 1, paddingTop: 19 },
  simpleHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  eyebrow: {
    color: C.mint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.45,
    marginBottom: 6,
  },
  pageTitle: {
    color: C.text,
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  countBubble: {
    alignItems: "center",
    minWidth: 52,
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: C.violetSoft,
  },
  countNumber: { color: C.violet, fontSize: 16, fontWeight: "900" },
  countLabel: { color: C.faint, fontSize: 9, marginTop: 1 },
  search: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: C.cardSoft,
    borderWidth: 1,
    borderColor: "rgba(143,164,204,0.15)",
  },
  searchInput: { flex: 1, color: C.text, fontSize: 13 },
  filterScroll: { flexGrow: 0 },
  filters: { alignItems: "center", gap: 7, paddingVertical: 12 },
  filter: {
    alignSelf: "flex-start",
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: C.whiteSoft,
  },
  filterActive: {
    backgroundColor: C.mintSoft,
    borderWidth: 1,
    borderColor: "rgba(22,217,192,0.27)",
  },
  filterText: { color: C.faint, fontSize: 10, fontWeight: "900" },
  filterTextActive: { color: C.mint },
  listHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 9,
  },
  listTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  listHint: { color: C.faint, fontSize: 10 },
  leadsList: { gap: 9, paddingBottom: 110 },
  leadRow: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 13,
    borderRadius: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: "rgba(143,164,204,0.15)",
  },
  leadRail: { width: 3, height: 44, borderRadius: 3, marginLeft: -6 },
  leadCopy: { flex: 1, minWidth: 0 },
  leadTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  leadName: { color: C.text, fontSize: 14, fontWeight: "900", flex: 1 },
  leadSummary: { color: C.muted, fontSize: 11, marginTop: 5 },
  emptyList: { alignItems: "center", paddingTop: 70 },
  emptyTitle: { color: C.text, fontSize: 15, fontWeight: "900", marginTop: 12 },
  emptyText: {
    color: C.faint,
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 5,
  },
  openBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 8,
    borderRadius: 9,
    backgroundColor: C.coralSoft,
  },
  openDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.coral },
  openText: { color: C.coral, fontSize: 10, fontWeight: "900" },
  alertIntro: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  alertList: { gap: 12, paddingBottom: 105 },
  alertCard: { padding: 15, position: "relative" },
  alertRail: {
    position: "absolute",
    left: 0,
    top: 15,
    bottom: 15,
    width: 3,
    backgroundColor: C.coral,
    borderRadius: 3,
  },
  alertTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  alertIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  alertReason: { color: C.coral, fontSize: 14, fontWeight: "900" },
  alertSub: { color: C.muted, fontSize: 11, marginTop: 4 },
  alertLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginLeft: 52,
    marginTop: 13,
    paddingTop: 11,
    borderTopWidth: 1,
    borderTopColor: "rgba(143,164,204,0.12)",
  },
  alertLineText: {
    color: C.faint,
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 1,
  },
  alertDot: { color: C.faint, fontSize: 10 },
  alertActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginLeft: 52,
    marginTop: 13,
  },
  primaryPress: { flex: 1 },
  primaryButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  primaryButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "900" },
  outlineButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: C.whiteSoft,
    borderWidth: 1,
    borderColor: "rgba(143,164,204,0.16)",
  },
  outlineDanger: {
    backgroundColor: C.coralSoft,
    borderColor: "rgba(255,91,122,0.25)",
  },
  outlineButtonText: { color: C.muted, fontSize: 10, fontWeight: "900" },
  emptyAlerts: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
  },
  emptyAlertsIcon: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.mintSoft,
  },
  toast: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 92,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 13,
    borderRadius: 11,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: "rgba(22,217,192,0.35)",
  },
  toastText: { color: C.text, fontSize: 11, fontWeight: "800" },
  back: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 4,
    marginBottom: 14,
  },
  backText: { color: C.muted, fontSize: 12, fontWeight: "800" },
  detailHero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: 15,
    marginBottom: 15,
  },
  detailIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  detailName: { color: C.text, fontSize: 19, fontWeight: "900" },
  detailBadges: { alignItems: "flex-end", gap: 6 },
  detailLayout: { gap: 15, paddingBottom: 95 },
  detailLayoutDesktop: { flexDirection: "row", alignItems: "flex-start" },
  detailMain: { flex: 1.1, gap: 14 },
  detailSide: { flex: 0.8, gap: 14 },
  detailBlock: { padding: 15 },
  detailBlockHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 13,
  },
  detailIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.violetSoft,
  },
  detailEyebrow: {
    color: C.faint,
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginBottom: 2,
  },
  detailBlockTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  detailText: { color: C.muted, fontSize: 13, lineHeight: 20 },
  infoStack: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(143,164,204,0.12)",
  },
  infoLine: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(143,164,204,0.12)",
  },
  infoLabelWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  infoLabel: { color: C.faint, fontSize: 10, fontWeight: "700" },
  infoValue: {
    color: C.muted,
    flex: 1,
    textAlign: "right",
    fontSize: 10,
    fontWeight: "800",
  },
  customerBubble: {
    alignSelf: "flex-start",
    maxWidth: "90%",
    padding: 12,
    borderRadius: 13,
    borderTopLeftRadius: 4,
    backgroundColor: C.whiteSoft,
  },
  aiBubble: {
    alignSelf: "flex-end",
    maxWidth: "90%",
    padding: 12,
    borderRadius: 13,
    borderTopRightRadius: 4,
    marginTop: 10,
  },
  aiBubbleLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 5,
  },
  bubbleText: { color: C.text, fontSize: 12, lineHeight: 18 },
  bubbleTextWhite: { color: "#FFFFFF", fontSize: 12, lineHeight: 18 },
  historyLine: { flexDirection: "row", gap: 9, paddingBottom: 10 },
  historyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 5,
    backgroundColor: C.violet,
  },
  historyText: { flex: 1, color: C.muted, fontSize: 10, lineHeight: 16 },
  actionCard: {
    padding: 16,
    backgroundColor: C.violetSoft,
    borderColor: "rgba(128,87,245,0.3)",
  },
  actionEyebrow: {
    color: C.violet,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  actionTitle: { color: C.text, fontSize: 17, fontWeight: "900", marginTop: 7 },
  actionText: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 6,
    marginBottom: 14,
  },
  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontWeight: "900" },
  tabBarShell: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
  },
  tabBarDesktop: { bottom: 18 },
  tabDock: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: "rgba(143,164,204,0.17)",
  },
  tabDockDesktop: {
    width: 350,
    paddingBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: "rgba(143,164,204,0.18)",
    backgroundColor: "rgba(24,33,55,0.97)",
  },
  tabItem: {
    position: "relative",
    minWidth: 80,
    minHeight: 59,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 10,
  },
  tabItemFocused: { backgroundColor: C.mintSoft },
  tabLabel: { color: C.faint, fontSize: 10, fontWeight: "800" },
  tabLabelFocused: { color: C.mint },
  navAlertDot: {
    position: "absolute",
    top: 9,
    right: "29%",
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.coral,
  },
});
