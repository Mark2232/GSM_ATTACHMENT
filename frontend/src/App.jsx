import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import DashboardTab from './components/DashboardTab';
import DispatchTab from './components/DispatchTab';
import QueueTab from './components/QueueTab';
import ContactsTab from './components/ContactsTab';
import AppointmentsTab from './components/AppointmentsTab';
import TemplatesTab from './components/TemplatesTab';
import ConfigTab from './components/ConfigTab';

export default function App() {
  // App & Hardware State
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [hwStatus, setHwStatus] = useState(null);
  const [queueInfo, setQueueInfo] = useState({ queue: [], isProcessing: false, isPaused: false });
  const [stats, setStats] = useState({ sentCount: 0, failedCount: 0, busyRetryCount: 0 });
  const [contacts, setContacts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [config, setConfig] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [templates, setTemplates] = useState([]);

  // Fetch REST data from Gateway API
  const fetchData = async () => {
    try {
      const [hwRes, qRes, msgRes, cfgRes, aptRes, tmplRes, cntRes] = await Promise.all([
        fetch('/api/hardware/status').then(r => r.json()),
        fetch('/api/queue').then(r => r.json()),
        fetch('/api/messages').then(r => r.json()),
        fetch('/api/config').then(r => r.json()),
        fetch('/api/appointments').then(r => r.json()),
        fetch('/api/templates').then(r => r.json()),
        fetch('/api/contacts').then(r => r.json())
      ]);

      setHwStatus(hwRes);
      setQueueInfo(qRes);
      if (qRes.stats) setStats(qRes.stats);
      setMessages(msgRes);
      setConfig(cfgRes);
      setAppointments(aptRes);
      setTemplates(tmplRes);
      setContacts(cntRes);
    } catch (err) {
      console.error('[API Fetch Error]', err);
    }
  };

  useEffect(() => {
    fetchData();

    // Setup WebSocket Connection
    let ws = null;
    let isSubscribed = true;

    function connectWs() {
      if (!isSubscribed) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${proto}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          if (isSubscribed) setIsConnected(true);
        };

        ws.onclose = () => {
          if (isSubscribed) {
            setIsConnected(false);
            setTimeout(connectWs, 2500);
          }
        };

        ws.onerror = () => {
          if (isSubscribed) setIsConnected(false);
        };

        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (payload.type === 'HARDWARE_STATUS') {
              setHwStatus(payload.payload);
            } else if (payload.type === 'QUEUE_UPDATE') {
              const qData = payload.payload;
              setQueueInfo(qData);
              if (qData.stats) setStats(qData.stats);
              fetchData();
            } else if (payload.type === 'INBOUND_SMS') {
              setMessages(prev => [payload.payload, ...prev]);
            }
          } catch (err) {
            console.error('[WS Parse Error]', err);
          }
        };
      } catch (e) {
        setTimeout(connectWs, 3000);
      }
    }

    connectWs();

    return () => {
      isSubscribed = false;
      if (ws) ws.close();
    };
  }, []);

  // SMS Actions
  const handleSendSingleSms = async (recipient, message) => {
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, message })
      });
      fetchData();
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleSendBulkSms = async (recipients, message) => {
    try {
      const res = await fetch('/api/sms/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message })
      });
      fetchData();
      return await res.json();
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  const handleSaveConfig = async (newConfig) => {
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      const data = await res.json();
      setConfig(data.config);
      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-main)', paddingBottom: '60px' }}>
      
      {/* Auto-detected Server / Hardware Offline Banner */}
      {!isConnected && (
        <div style={{
          background: '#fee2e2',
          borderBottom: '1px solid #fca5a5',
          color: '#991b1b',
          padding: '8px 20px',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 700
        }}>
          🔴 Backend Server Offline — Auto-reconnecting in background...
        </div>
      )}

      {isConnected && hwStatus?.status === 'OFFLINE' && (
        <div style={{
          background: '#fef3c7',
          borderBottom: '1px solid #fde68a',
          color: '#92400e',
          padding: '8px 20px',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 700
        }}>
          ⚠️ GoIP-1 Hardware Device Unreachable at {hwStatus?.lanIp || '192.168.8.190'} — Check Wi-Fi router / LAN cable.
        </div>
      )}

      {isConnected && hwStatus?.status === 'ONLINE' && hwStatus?.simState === 'EMPTY' && (
        <div style={{
          background: '#fef2f2',
          borderBottom: '1px solid #fca5a5',
          color: '#dc2626',
          padding: '8px 20px',
          textAlign: 'center',
          fontSize: '0.82rem',
          fontWeight: 700
        }}>
          ⚠️ No SIM Card Detected in GoIP-1 Hardware — Please insert a GSM SIM card into Line 1.
        </div>
      )}

      {/* Top Header Navigation */}
      <Header
        isConnected={isConnected}
        hwStatus={hwStatus}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Tab Views */}
      <main style={{ maxWidth: '1440px', margin: '24px auto 0', padding: '0 28px' }}>
        
        {activeTab === 'dashboard' && (
          <DashboardTab
            hwStatus={hwStatus}
            queueInfo={queueInfo}
            stats={stats}
            contacts={contacts}
            appointments={appointments}
            templates={templates}
            onNavigate={setActiveTab}
            onTriggerTest={handleSendSingleSms}
          />
        )}

        {activeTab === 'dispatch' && (
          <DispatchTab
            hwStatus={hwStatus}
            queueInfo={queueInfo}
            contacts={contacts}
            onSendSingle={handleSendSingleSms}
            onSendBulk={handleSendBulkSms}
          />
        )}

        {activeTab === 'queue' && (
          <QueueTab
            queueInfo={queueInfo}
            stats={stats}
            messages={messages}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'contacts' && (
          <ContactsTab
            onSendBulkSms={handleSendBulkSms}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'templates' && (
          <TemplatesTab />
        )}

        {activeTab === 'appointments' && (
          <AppointmentsTab
            appointments={appointments}
            contacts={contacts}
            templates={templates}
            onRefresh={fetchData}
          />
        )}

        {activeTab === 'config' && (
          <ConfigTab
            config={config}
            hwStatus={hwStatus}
            onSave={handleSaveConfig}
          />
        )}

      </main>
    </div>
  );
}
