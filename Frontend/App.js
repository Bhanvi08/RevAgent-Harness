import React from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, TouchableOpacity, StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

// 1. DATA
const DATA = [
  { id: "1", customer: "Sarah M.", channel: "WhatsApp", status: "escalated", time: "10:30 AM", reason: "Pricing complaint", summary: "Customer requested manager due to high quote." },
  { id: "2", customer: "Rajesh K.", channel: "Call", status: "qualified", time: "11:15 AM", reason: "None", summary: "Interested in premium plan. Scheduled demo." },
  { id: "3", customer: "Anshika T.", channel: "Email", status: "new", time: "12:00 PM", reason: "None", summary: "Inquiry about software integration." },
  { id: "4", customer: "John Doe", channel: "WhatsApp", status: "escalated", time: "01:45 PM", reason: "SOP Failure", summary: "Bot could not answer specific API query." }
];

// 2. DASHBOARD
function Dashboard() {
  return (
    <ScrollView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.headerTitle}>Closira Dashboard</Text>
      
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderTopColor: '#6366F1', borderTopWidth: 4 }]}>
          <Text style={styles.statNum}>12</Text>
          <Text style={styles.statLabel}>Total Leads</Text>
        </View>
        <View style={[styles.statCard, { borderTopColor: '#EF4444', borderTopWidth: 4 }]}>
          <Text style={[styles.statNum, {color: '#EF4444'}]}>3</Text>
          <Text style={styles.statLabel}>Escalations</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Recent Activity</Text>
      <View style={styles.activityBox}>
        {DATA.slice(0, 3).map((item) => (
          <View key={item.id} style={styles.activityItem}>
            <View style={[styles.dot, {backgroundColor: item.status === 'escalated' ? '#EF4444' : '#10B981'}]} />
            <Text style={styles.activityText}>
               <Text style={{fontWeight: '700'}}>{item.customer}</Text> moved to {item.status}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// 3. LEADS
function LeadsScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <FlatList data={DATA} keyExtractor={it => it.id} renderItem={({item}) => (
        <TouchableOpacity style={styles.listCard} onPress={() => navigation.navigate('Details', {item})}>
          <View style={styles.cardHeader}>
            <Text style={styles.customerName}>{item.customer}</Text>
            <View style={[styles.pill, {backgroundColor: item.status === 'escalated' ? '#FEE2E2' : '#DBEAFE'}]}>
              <Text style={[styles.pillText, {color: item.status === 'escalated' ? '#991B1B' : '#1E40AF'}]}>
                {item.status.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.cardSub}>{item.channel} • {item.time}</Text>
        </TouchableOpacity>
      )} />
    </View>
  );
}

// 4. ALERTS
function Escalations() {
  const list = DATA.filter(x => x.status === 'escalated');
  return (
    <View style={styles.container}>
      <FlatList data={list} keyExtractor={it => it.id} renderItem={({item}) => (
        <View style={styles.alertCard}>
          <Text style={styles.alertTitle}>⚠️ {item.reason}</Text>
          <Text style={styles.alertSub}>{item.customer} is waiting via {item.channel}</Text>
          <TouchableOpacity style={styles.resolveBtn}>
            <Text style={styles.btnText}>TAKE OVER CONVERSATION</Text>
          </TouchableOpacity>
        </View>
      )} />
    </View>
  );
}

// 5. DETAILS
function DetailScreen({ route }) {
  const { item } = route.params;
  return (
    <View style={styles.container}>
      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>{item.customer}</Text>
        <Text style={styles.summaryText}>{item.summary}</Text>
        <View style={styles.chatContainer}>
          <View style={styles.bubble}><Text>User: I need help with pricing.</Text></View>
          <View style={[styles.bubble, styles.aiBubble]}><Text style={{color: 'white'}}>AI: I can help! Our plans start at 5k.</Text></View>
        </View>
      </View>
    </View>
  );
}

// 6. NAV
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabGroup() {
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: true,
      headerStyle: { backgroundColor: '#1E293B' },
      headerTintColor: '#fff',
      tabBarActiveTintColor: '#6366F1',
      tabBarStyle: { height: 65, paddingBottom: 10, backgroundColor: '#fff' },
      tabBarIcon: ({ size }) => {
        const icons = { Home: '🏠', Leads: '👥', Alerts: '🔔' };
        return <Text style={{ fontSize: size }}>{icons[route.name]}</Text>;
      },
    })}>
      <Tab.Screen name="Home" component={Dashboard} />
      <Tab.Screen name="Leads" component={LeadsScreen} />
      <Tab.Screen name="Alerts" component={Escalations} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Main" component={TabGroup} options={{ headerShown: false }} />
        <Stack.Screen name="Details" component={DetailScreen} options={{ headerTitle: 'Lead Details' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC', padding: 20 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: '#0F172A', marginBottom: 25, marginTop: 10 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 25 },
  statCard: { backgroundColor: 'white', padding: 20, borderRadius: 16, width: '47%', 
              shadowColor: '#000', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.05, elevation: 4 },
  statNum: { fontSize: 32, fontWeight: '800', color: '#6366F1' },
  statLabel: { color: '#64748B', fontWeight: '600', fontSize: 13, marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#334155', marginBottom: 15 },
  activityBox: { backgroundColor: 'white', borderRadius: 16, padding: 15, elevation: 2 },
  activityItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  activityText: { color: '#475569', fontSize: 14 },
  listCard: { backgroundColor: 'white', padding: 18, borderRadius: 16, marginBottom: 12, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  customerName: { fontSize: 17, fontWeight: '700', color: '#1E293B' },
  cardSub: { color: '#94A3B8', marginTop: 6, fontSize: 13 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillText: { fontSize: 10, fontWeight: '800' },
  alertCard: { backgroundColor: 'white', padding: 20, borderRadius: 16, marginBottom: 15, elevation: 3 },
  alertTitle: { fontSize: 16, fontWeight: '800', color: '#991B1B' },
  alertSub: { color: '#64748B', marginVertical: 8 },
  resolveBtn: { backgroundColor: '#0F172A', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '800', fontSize: 12 },
  detailCard: { backgroundColor: 'white', padding: 20, borderRadius: 20, elevation: 4 },
  detailTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 10 },
  summaryText: { color: '#64748B', lineHeight: 20, marginBottom: 20 },
  bubble: { backgroundColor: '#F1F5F9', padding: 12, borderRadius: 12, marginBottom: 10, maxWidth: '85%' },
  aiBubble: { alignSelf: 'flex-end', backgroundColor: '#6366F1' }
});