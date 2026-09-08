import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import api from '../lib/api';
import { useMessagingConnection } from '../hooks/useMessagingConnection';
import { messagingStatusLabel } from '../lib/messagingConnection';
import { 
  Smartphone, Send, Users, MessageSquare, Clock, 
  Wifi, WifiOff, RefreshCw, CheckCircle2, 
  AlertCircle, Search, ShieldCheck, Terminal, BookOpen, Plus, CheckSquare, Square, 
  LayoutDashboard, ArrowRight, Activity, Signal, Zap, Inbox, Reply, Check, MessageCircle, Trash2,
  Calendar, ChevronDown, CalendarPlus, Clock3, UserCheck, CheckCheck,
  Bot, Sparkles, Sliders, ToggleLeft, ToggleRight, HelpCircle, FileText, CheckCircle, XCircle, Save,
  Phone, Copy, Filter, ArrowDown, ExternalLink, CreditCard, FileSpreadsheet, ChevronUp, DollarSign,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import toast from 'react-hot-toast';

interface InboundMessage {
  id: string;
  from: string;
  senderName: string;
  senderAddress?: string | null;
  senderAccountId?: number | null;
  message: string;
  line: number;
  receivedAt: string;
  read: boolean;
  autoReply?: {
    enabled?: boolean;
    customerFound?: boolean;
    matchedCustomer?: any;
    intent?: string;
    reasoning?: string;
    replyText?: string;
    dispatchResult?: any;
  } | null;
}

interface AutoReplyConfig {
  enabled: boolean;
  aiMode?: 'HYBRID_AI' | 'RULES_ONLY' | 'AI_ONLY';
  geminiApiKey?: string;
  geminiModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  customerFoundTemplate: string;
  balanceInquiryTemplate: string;
  appointmentInquiryTemplate: string;
  noAppointmentTemplate: string;
  customerNotFoundTemplate: string;
  keywords?: {
    balance: string[];
    appointment: string[];
  };
}

interface ReminderStageInfo {
  sent?: boolean;
  sentAt?: string;
  msgId?: string;
  lastError?: string;
  status?: string;
}

interface Appointment {
  id: string;
  clientName: string;
  clientPhone: string;
  serviceType: string;
  date: string;
  time: string;
  notes?: string;
  sendAutoReminder: boolean;
  status: string;
  createdAt: string;
  reminders?: {
    threeDays?: ReminderStageInfo;
    twentyFourHours?: ReminderStageInfo;
    dayOf?: ReminderStageInfo;
  };
}

interface AppointmentReminderTemplates {
  threeDays: string;
  twentyFourHours: string;
  dayOf8Am: string;
}

interface SchedulerStatus {
  active: boolean;
  isChecking: boolean;
  phtCurrentDate: string;
  phtCurrentTime: string;
  timezone: string;
  lastCheckResult?: any;
}

interface SystemCustomer {
  id: string;
  accountId: number | null;
  name: string;
  phone: string;
  rawPhone: string;
  address?: string;
  type: string;
  totalTransactions: number;
  latestSaleDate?: string;
  balance?: string;
  rawBalance?: number;
  creditLimit?: string;
  appointment?: any;
}

interface Template {
  id: string;
  title: string;
  category: string;
  content: string;
}

interface MessageLog {
  id: string;
  recipient: string;
  message: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED';
  createdAt: string;
  error?: string;
  metadata?: {
    recipientName?: string;
    appointmentId?: string;
  };
}

export default function GsmPage() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'dispatch' | 'appointments' | 'inbox' | 'customers' | 'templates' | 'history' | 'ussd'>('dashboard');
  
  // Hardware State
  const { connection, checking: checkingConnection, refresh: fetchStatus } = useMessagingConnection();
  const hwStatus = connection.hardware;
  const connectionLabel = messagingStatusLabel(connection);
  const gatewayReady = connection.backend === 'online' && hwStatus?.status === 'ONLINE' && hwStatus.mode !== 'MOCK_SIMULATOR';
  
  // Inbound SMS / Replies
  const [inbox, setInbox] = useState<InboundMessage[]>([]);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [loadingInbox, setLoadingInbox] = useState(false);
  const [inboxSearch, setInboxSearch] = useState('');
  const [selectedThreadPhone, setSelectedThreadPhone] = useState<string | null>(null);
  const [threadReplyText, setThreadReplyText] = useState('');
  const [inboxFilter, setInboxFilter] = useState<'all' | 'unread' | 'registered'>('all');
  const [sendingThreadReply, setSendingThreadReply] = useState(false);
  const threadMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // Dispatcher State
  const [recipientInput, setRecipientInput] = useState('');
  const [selectedCustomerNames, setSelectedCustomerNames] = useState<string[]>([]);
  const [messageText, setMessageText] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [sending, setSending] = useState(false);

  // Dynamic Customer Inquiry Puller State (Balance, Appointment, Statement)
  const [inquiryMode, setInquiryMode] = useState<'none' | 'balance' | 'appointment' | 'statement' | 'template'>('none');
  const [inquirySearch, setInquirySearch] = useState('');
  const [inquiryLoading, setInquiryLoading] = useState(false);
  const [inquiryResults, setInquiryResults] = useState<any[]>([]);

  // Inbound Conversation Inquiry State
  const [inboxInquiryMode, setInboxInquiryMode] = useState<'none' | 'balance' | 'appointment' | 'statement' | 'template'>('none');
  const [inboxInquirySearch, setInboxInquirySearch] = useState('');
  const [inboxInquiryResults, setInboxInquiryResults] = useState<any[]>([]);

  // Quick Test State (for Dashboard)
  const [quickTestPhone, setQuickTestPhone] = useState('09173079499');
  const [quickTestSending, setQuickTestSending] = useState(false);

  // System Customers from DB & Custom Contacts
  const [systemCustomers, setSystemCustomers] = useState<SystemCustomer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
  const [pickerPage, setPickerPage] = useState(1);
  const [directoryPage, setDirectoryPage] = useState(1);

  // Add Contact Modal State
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    phone: '',
    address: '',
    group: 'General',
    notes: ''
  });
  const [savingContact, setSavingContact] = useState(false);

  // Templates & Logs
  const [templates, setTemplates] = useState<Template[]>([]);
  const [messages, setMessages] = useState<MessageLog[]>([]);
  const [ussdCmd, setUssdCmd] = useState('*143#');
  const [ussdResponse, setUssdResponse] = useState('');
  const [loadingUssd, setLoadingUssd] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: '', category: 'General', content: '' });
  const [showNewTemplateModal, setShowNewTemplateModal] = useState(false);

  // Appointments State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(false);
  const [apptSearch, setApptSearch] = useState('');
  const [dispatchMenuOpen, setDispatchMenuOpen] = useState(false);
  const [schedulingAppt, setSchedulingAppt] = useState(false);
  const [apptSelectedCustId, setApptSelectedCustId] = useState('');
  const [isCustomApptClient, setIsCustomApptClient] = useState(false);
  const [apptForm, setApptForm] = useState({
    clientName: '',
    clientPhone: '',
    serviceType: 'General Consultation & Service',
    date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0],
    time: '10:00 AM',
    notes: '',
    sendAutoReminder: true
  });

  // 3-Stage Appointment Reminder Scheduler State
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus | null>(null);
  const [apptTemplates, setApptTemplates] = useState<AppointmentReminderTemplates>({
    threeDays: '',
    twentyFourHours: '',
    dayOf8Am: ''
  });
  const [showApptTemplatesModal, setShowApptTemplatesModal] = useState(false);
  const [savingApptTemplates, setSavingApptTemplates] = useState(false);
  const [triggeringStage, setTriggeringStage] = useState<{ apptId: string; stage: string } | null>(null);
  const [runningCheck, setRunningCheck] = useState(false);

  // Fetch Scheduler Status & Templates
  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const { data } = await api.get('/gsm/appointments/reminder-status');
      setSchedulerStatus(data);
    } catch (err) {
      console.warn('Could not fetch reminder scheduler status', err);
    }
  }, []);

  const fetchApptTemplates = useCallback(async () => {
    try {
      const { data } = await api.get('/gsm/appointments/templates');
      if (data) setApptTemplates(data);
    } catch (err) {
      console.warn('Could not fetch appt templates', err);
    }
  }, []);

  // Fetch Inbound Replies
  const fetchInbox = useCallback(async () => {
    setLoadingInbox(true);
    try {
      const { data } = await api.get('/gsm/inbox');
      setInbox(data.messages || []);
      setUnreadInboxCount(data.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load inbound replies', err);
    } finally {
      setLoadingInbox(false);
    }
  }, []);

  // Fetch system customers with phone numbers from database
  const fetchSystemCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    try {
      const { data } = await api.get('/gsm/system-contacts');
      setSystemCustomers(data.customers || []);
    } catch (err) {
      console.error('Failed to fetch system contacts', err);
    } finally {
      setLoadingCustomers(false);
    }
  }, []);

  // Fetch Appointments
  const fetchAppointments = useCallback(async () => {
    setLoadingAppts(true);
    try {
      const { data } = await api.get('/gsm/appointments');
      setAppointments(data || []);
    } catch (err) {
      console.error('Failed to fetch appointments', err);
    } finally {
      setLoadingAppts(false);
    }
  }, []);

  // Fetch templates and message logs
  const fetchTemplatesAndLogs = useCallback(async () => {
    try {
      const [tmplRes, msgRes] = await Promise.all([
        api.get('/gsm/templates'),
        api.get('/gsm/messages')
      ]);
      setTemplates(tmplRes.data || []);
      setMessages(msgRes.data || []);
    } catch (err) {
      console.error('Failed to load templates/messages', err);
    }
  }, []);

  // Smart Auto-Reply State
  const [autoReplyConfig, setAutoReplyConfig] = useState<AutoReplyConfig>({
    enabled: true,
    customerFoundTemplate: 'Hello {{name}}! Thank you for reaching JARVIS. Your customer account (#{{accountId}}) is active. Reply BALANCE for your charge balance or APPT for your appointment details.',
    balanceInquiryTemplate: 'Hello {{name}}! Your current JARVIS charge account (#{{accountId}}) balance is PHP {{balance}} (Credit Limit: PHP {{creditLimit}}). Thank you!',
    appointmentInquiryTemplate: 'Hello {{name}}! You have an upcoming appointment for "{{serviceType}}" on {{date}} at {{time}}.',
    noAppointmentTemplate: 'Hello {{name}}! You do not have any pending appointments scheduled with us. Reply with your preferred date to book a service.',
    customerNotFoundTemplate: 'Greetings from JARVIS! Your number ({{phone}}) is not yet registered in our customer records. Please visit our office or contact our support desk to register.'
  });
  const [savingAutoReply, setSavingAutoReply] = useState(false);

  // Auto-Reply Live Simulator State
  const [simPhone, setSimPhone] = useState('');
  const [simMessage, setSimMessage] = useState('BALANCE');
  const [simResult, setSimResult] = useState<any | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Fetch Auto-Reply Config
  const fetchAutoReplyConfig = useCallback(async () => {
    try {
      const { data } = await api.get('/gsm/auto-reply/config');
      if (data) setAutoReplyConfig(data);
    } catch (err) {
      console.error('Failed to load auto-reply config', err);
    }
  }, []);

  // Save Auto-Reply Config
  const handleSaveAutoReplyConfig = async () => {
    setSavingAutoReply(true);
    try {
      const { data } = await api.post('/gsm/auto-reply/config', autoReplyConfig);
      if (data.autoReply) setAutoReplyConfig(data.autoReply);
      toast.success('Smart Inbound Auto-Reply rules saved successfully!');
    } catch (err: any) {
      toast.error('Failed to save rules: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingAutoReply(false);
    }
  };

  // Run Smart Auto-Reply Simulator
  const handleRunAutoReplySimulation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!simPhone.trim()) {
      toast.error('Please enter or select a test phone number.');
      return;
    }
    setSimLoading(true);
    try {
      const { data } = await api.post('/gsm/auto-reply/simulate', {
        from: simPhone.trim(),
        message: simMessage.trim()
      });
      setSimResult(data);
      if (data.customerFound) {
        toast.success(`Matched Record: ${data.customer.name}`);
      } else {
        toast('Number not found in records — Unregistered template applied', { icon: 'ℹ️' });
      }
    } catch (err: any) {
      toast.error('Simulation failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSimLoading(false);
    }
  };

  useEffect(() => {
    // Re-load data once the backend returns; never retry an SMS mutation.
    if (connection.backend !== 'online') return;
    fetchInbox();
    fetchSystemCustomers();
    fetchAppointments();
    fetchTemplatesAndLogs();
    fetchAutoReplyConfig();
    fetchSchedulerStatus();
    fetchApptTemplates();

    const interval = setInterval(() => {
      fetchInbox();
      fetchSchedulerStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, [connection.backend, fetchInbox, fetchSystemCustomers, fetchAppointments, fetchTemplatesAndLogs, fetchAutoReplyConfig, fetchSchedulerStatus, fetchApptTemplates]);

  // Character & Part Calculations
  const isUnicode = /[^\u0000-\u007F]/.test(messageText);
  const maxSingle = isUnicode ? 70 : 160;
  const maxMultipart = isUnicode ? 67 : 153;
  const charLength = messageText.length;
  const smsParts = charLength === 0 ? 0 : charLength <= maxSingle ? 1 : Math.ceil(charLength / maxMultipart);

  // Apply template
  const handleApplyTemplate = (tmplId: string) => {
    const tmpl = templates.find(t => t.id === tmplId);
    if (tmpl) {
      setMessageText(tmpl.content);
      setSelectedTemplate(tmplId);
    }
  };

  // Direct SMS Dispatch
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageText.trim()) {
      toast.error('Please enter a message.');
      return;
    }

    const directPhones = recipientInput.split(/[\n,;]/).map(p => p.trim()).filter(Boolean);
    if (directPhones.length === 0) {
      toast.error('Please specify at least one recipient phone number.');
      return;
    }

    setSending(true);
    try {
      if (directPhones.length === 1) {
        await api.post('/gsm/send', {
          recipient: directPhones[0],
          message: messageText,
          name: selectedCustomerNames[0] || 'Valued Costumer'
        });
        toast.success(`Direct SMS sent to ${directPhones[0]}`);
      } else {
        const { data } = await api.post('/gsm/bulk', {
          recipients: directPhones,
          message: messageText
        });
        toast.success(`Dispatched direct SMS to ${data.sentCount || directPhones.length} recipients!`);
      }
      setRecipientInput('');
      setSelectedCustomerNames([]);
      setMessageText('');
      fetchTemplatesAndLogs();
      setActiveTab('history');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to dispatch direct SMS.');
    } finally {
      setSending(false);
    }
  };

  // Quick Test Dispatch from Dashboard
  const handleQuickTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTestPhone.trim()) return;
    setQuickTestSending(true);
    try {
      await api.post('/gsm/send', {
        recipient: quickTestPhone.trim(),
        message: `[JARVIS GSM Gateway] Direct ping SMS sent at ${new Date().toLocaleTimeString()}. Line is active.`
      });
      toast.success(`Direct Test SMS sent to ${quickTestPhone}!`);
      fetchTemplatesAndLogs();
    } catch (err: any) {
      toast.error('Test SMS failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setQuickTestSending(false);
    }
  };

  // 1-Click Reply Back to Inbound Message
  const handleReplyToCustomer = (inbound: InboundMessage) => {
    setRecipientInput(inbound.from);
    setSelectedCustomerNames([inbound.senderName]);
    setMessageText(`Hi ${inbound.senderName}, `);
    setActiveTab('dispatch');
    api.post(`/gsm/inbox/${inbound.id}/read`).catch(() => {});
    fetchInbox();
    toast.success(`Replying to ${inbound.senderName} (${inbound.from})`);
  };

  // Delete Inbound Message
  const handleDeleteInbox = async (id: string) => {
    try {
      await api.delete(`/gsm/inbox/${id}`);
      fetchInbox();
      toast.success('Inbound message deleted.');
    } catch (err) {
      toast.error('Failed to delete message.');
    }
  };

  // Mark Inbound as Read
  const handleMarkRead = async (id: string) => {
    try {
      await api.post(`/gsm/inbox/${id}/read`);
      fetchInbox();
    } catch (err) {}
  };

  // Appointment Handlers
  const handleCreateAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apptForm.clientName.trim() || !apptForm.clientPhone.trim()) {
      toast.error('Please specify client name and phone number.');
      return;
    }

    setSchedulingAppt(true);
    try {
      const { data } = await api.post('/gsm/appointments', apptForm);
      if (data.smsStatus === 'SENT') {
        toast.success(`Appointment scheduled & confirmation SMS sent to ${apptForm.clientName}!`);
      } else {
        toast.success(`Appointment scheduled for ${apptForm.clientName}!`);
      }
      setApptForm({
        clientName: '',
        clientPhone: '',
        serviceType: 'General Consultation & Service',
        date: new Date(Date.now() + 24 * 3600 * 1000).toISOString().split('T')[0],
        time: '10:00 AM',
        notes: '',
        sendAutoReminder: true
      });
      setApptSelectedCustId('');
      setIsCustomApptClient(false);
      fetchAppointments();
      fetchTemplatesAndLogs();
    } catch (err: any) {
      toast.error('Failed to schedule appointment: ' + (err.response?.data?.error || err.message));
    } finally {
      setSchedulingAppt(false);
    }
  };

  const handleDeleteAppointment = async (id: string) => {
    try {
      await api.delete(`/gsm/appointments/${id}`);
      fetchAppointments();
      toast.success('Appointment record deleted.');
    } catch (err) {
      toast.error('Failed to delete appointment.');
    }
  };

  const handleSaveApptTemplates = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingApptTemplates(true);
    try {
      await api.post('/gsm/appointments/templates', apptTemplates);
      toast.success('3-Stage Reminder SMS templates updated successfully!');
      setShowApptTemplatesModal(false);
    } catch (err: any) {
      toast.error('Failed to save templates: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingApptTemplates(false);
    }
  };

  const handleTriggerStageReminder = async (appt: Appointment, stage: '3days' | '24hours' | 'dayof') => {
    setTriggeringStage({ apptId: appt.id, stage });
    const stageLabel = stage === '3days' ? '3-Day Advance' : stage === '24hours' ? '24h Prior' : 'Day-Of 8:00 AM';
    try {
      await api.post(`/gsm/appointments/${appt.id}/trigger-reminder`, { stage });
      toast.success(`Dispatched ${stageLabel} reminder to ${appt.clientName}!`);
      fetchAppointments();
      fetchTemplatesAndLogs();
      fetchSchedulerStatus();
    } catch (err: any) {
      toast.error(`Failed to trigger ${stageLabel} reminder: ` + (err.response?.data?.error || err.message));
    } finally {
      setTriggeringStage(null);
    }
  };

  const handleForceCheckReminders = async () => {
    setRunningCheck(true);
    try {
      const { data } = await api.post('/gsm/appointments/check-reminders');
      toast.success(`Scheduler checked ${data.result?.processedCount || 0} active appointment(s).`);
      fetchAppointments();
      fetchSchedulerStatus();
    } catch (err: any) {
      toast.error('Failed to run scheduler check: ' + (err.response?.data?.error || err.message));
    } finally {
      setRunningCheck(false);
    }
  };

  const handleSendApptReminder = async (appt: Appointment) => {
    try {
      await api.post(`/gsm/appointments/${appt.id}/send-sms`);
      toast.success(`SMS reminder dispatched to ${appt.clientName} (${appt.clientPhone})!`);
      fetchTemplatesAndLogs();
    } catch (err: any) {
      toast.error('Failed to send reminder: ' + (err.response?.data?.error || err.message));
    }
  };

  // Add Contact Handler
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.phone.trim()) {
      toast.error('Phone number is required.');
      return;
    }

    setSavingContact(true);
    try {
      await api.post('/gsm/contacts', {
        name: newContact.name.trim() || 'Valued Costumer',
        phone: newContact.phone.trim(),
        address: newContact.address.trim(),
        group: newContact.group,
        notes: newContact.notes.trim()
      });
      toast.success('New contact added successfully!');
      setNewContact({ name: '', phone: '', address: '', group: 'General', notes: '' });
      setShowAddContactModal(false);
      fetchSystemCustomers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save contact.');
    } finally {
      setSavingContact(false);
    }
  };

  // Customer picker actions
  const toggleSelectCustomer = (c: SystemCustomer) => {
    const next = new Set(pickerSelectedIds);
    if (next.has(c.id)) {
      next.delete(c.id);
    } else {
      next.add(c.id);
    }
    setPickerSelectedIds(next);
  };

  const handleSelectAllFiltered = () => {
    const filtered = filteredCustomers;
    const next = new Set(pickerSelectedIds);
    const allSelected = filtered.every(c => next.has(c.id));
    if (allSelected) {
      filtered.forEach(c => next.delete(c.id));
    } else {
      filtered.forEach(c => next.add(c.id));
    }
    setPickerSelectedIds(next);
  };

  const handleApplyPickedCustomers = () => {
    const selected = systemCustomers.filter(c => pickerSelectedIds.has(c.id));
    const validPhones = selected.map(c => c.phone || '').filter(Boolean);
    const names = selected.map(c => c.name);
    const withoutPhone = selected.filter(c => !c.phone || c.phone.trim() === '');

    setRecipientInput(validPhones.join('\n'));
    setSelectedCustomerNames(names);
    setShowCustomerPicker(false);

    if (withoutPhone.length > 0 && validPhones.length === 0) {
      toast(`Selected ${selected.length} customer(s). They do not have phone numbers on record — you can type their number manually into the recipient box.`, { icon: 'ℹ️', duration: 5000 });
    } else if (withoutPhone.length > 0) {
      toast.success(`Added ${validPhones.length} phone number(s). (${withoutPhone.length} customer(s) without phone can be typed manually).`);
    } else {
      toast.success(`Added ${selected.length} customer phone numbers!`);
    }
  };

  // USSD Command Execution
  const handleExecuteUssd = async () => {
    if (!ussdCmd.trim()) return;
    setLoadingUssd(true);
    setUssdResponse('');
    try {
      const { data } = await api.post('/gsm/ussd/send', { command: ussdCmd, line: hwStatus?.line || 1 });
      setUssdResponse(data.data?.response || 'No response data.');
      toast.success('USSD command executed.');
    } catch (err: any) {
      setUssdResponse('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoadingUssd(false);
    }
  };

  // Save new template
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.title || !newTemplate.content) {
      toast.error('Title and content are required.');
      return;
    }
    try {
      await api.post('/gsm/templates', newTemplate);
      toast.success('Template saved!');
      setNewTemplate({ title: '', category: 'General', content: '' });
      setShowNewTemplateModal(false);
      fetchTemplatesAndLogs();
    } catch (err) {
      toast.error('Failed to save template.');
    }
  };

  // Dynamic Inquiry Search Effect for Dispatcher
  useEffect(() => {
    if (inquiryMode === 'none' || inquiryMode === 'template') {
      setInquiryResults([]);
      return;
    }

    const q = inquirySearch.toLowerCase().trim();
    if (!q) {
      setInquiryResults([]);
      return;
    }

    const nameTerms = q.split(/\s+/).filter(Boolean);
    const localMatches = systemCustomers.filter(c =>
      nameTerms.every(term => c.name.toLowerCase().includes(term)) ||
      c.phone.includes(q) ||
      (c.accountId && String(c.accountId).includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );

    setInquiryResults(localMatches);

    let active = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/gsm/customer-inquiry?q=${encodeURIComponent(q)}`);
        if (active && data && data.customers && data.customers.length > 0) {
          const fetchedAccountIds = new Set(data.customers.map((customer: any) => String(customer.accountId)));
          setInquiryResults([
            ...data.customers,
            ...localMatches.filter(customer => !customer.accountId || !fetchedAccountIds.has(String(customer.accountId)))
          ]);
        }
      } catch (e) {}
    }, 250);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [inquirySearch, inquiryMode, systemCustomers]);

  // Dynamic Inquiry Search Effect for Inbound Conversation
  useEffect(() => {
    if (inboxInquiryMode === 'none' || inboxInquiryMode === 'template') {
      setInboxInquiryResults([]);
      return;
    }

    const q = inboxInquirySearch.toLowerCase().trim();
    if (!q) {
      setInboxInquiryResults(systemCustomers.slice(0, 25));
      return;
    }

    const localMatches = systemCustomers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.accountId && String(c.accountId).includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q))
    );

    setInboxInquiryResults(localMatches);

    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(`/gsm/customer-inquiry?q=${encodeURIComponent(q)}`);
        if (data && data.customers && data.customers.length > 0) {
          setInboxInquiryResults(data.customers);
        }
      } catch (e) {}
    }, 250);

    return () => clearTimeout(timer);
  }, [inboxInquirySearch, inboxInquiryMode, systemCustomers]);

  // Handle applying target customer inquiry (e.g. Jerome requests Mark's balance or appointment)
  const handleApplyCustomerInquiry = (targetCust: any, forInbox = false, modeOverride?: 'balance' | 'appointment' | 'statement') => {
    const activeMode = modeOverride || (forInbox ? inboxInquiryMode : inquiryMode);
    const recipientGreeting = forInbox
      ? (activeThread ? activeThread.customerName : 'Valued Costumer')
      : (selectedCustomerNames[0] || 'Valued Costumer');

    const balFormatted = targetCust.balance || (targetCust.openBalance ? Number(targetCust.openBalance).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00');
    const limitFormatted = targetCust.creditLimit || '0.00';
    const accNumber = targetCust.accountId ? `#${targetCust.accountId}` : 'N/A';

    let generatedText = '';

    if (activeMode === 'balance') {
      generatedText = `Hello ${recipientGreeting}! Here is the requested charge account balance for ${targetCust.name} (Acc ${accNumber}): PHP ${balFormatted} (Credit Limit: PHP ${limitFormatted}). Thank you!`;
    } else if (activeMode === 'appointment') {
      const targetAppt = targetCust.appointment || appointments.find(a => 
        (targetCust.phone && a.clientPhone && a.clientPhone.replace(/[^0-9]/g, '').slice(-10) === targetCust.phone.replace(/[^0-9]/g, '').slice(-10)) ||
        (a.clientName && a.clientName.toLowerCase().trim() === targetCust.name.toLowerCase().trim())
      );

      if (targetAppt) {
        generatedText = `Hello ${recipientGreeting}! Here are the requested appointment details for ${targetCust.name}: "${targetAppt.serviceType}" scheduled on ${targetAppt.date} at ${targetAppt.time}. (Status: ${targetAppt.status || 'Confirmed'}).`;
      } else {
        generatedText = `Hello ${recipientGreeting}! There are currently no upcoming appointments scheduled for ${targetCust.name}. Please contact us if you wish to book a schedule.`;
      }
    } else if (activeMode === 'statement') {
      generatedText = `Hello ${recipientGreeting}! Account summary for ${targetCust.name} (Acc ${accNumber}): Total purchases: ${targetCust.totalTransactions || 0}, Latest purchase: ${targetCust.latestSaleDate ? new Date(targetCust.latestSaleDate).toLocaleDateString() : 'N/A'}, Current Open Balance: PHP ${balFormatted}.`;
    }

    if (forInbox) {
      setThreadReplyText(generatedText);
      setInboxInquiryMode('none');
      setInboxInquirySearch('');
    } else {
      setMessageText(generatedText);
      setInquiryMode('none');
      setInquirySearch('');
    }

    toast.success(`✨ Pulled ${activeMode} for ${targetCust.name}! Message text updated.`);
  };

  const PICKER_PAGE_SIZE = 15;

  // Filtered & Alphabetically Sorted (A-Z) Customers List
  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    const list = systemCustomers.filter(c => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.rawPhone && c.rawPhone.includes(q)) ||
        (c.accountId && String(c.accountId).includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.type && c.type.toLowerCase().includes(q))
      );
    });

    // Sort alphabetically by costumer/user name (A-Z)
    return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base', numeric: true }));
  }, [systemCustomers, customerSearch]);

  // Reset page to 1 on filter search
  useEffect(() => {
    setPickerPage(1);
    setDirectoryPage(1);
  }, [customerSearch]);

  const totalPickerPages = Math.max(1, Math.ceil(filteredCustomers.length / PICKER_PAGE_SIZE));
  const paginatedCustomers = useMemo(() => {
    const startIdx = (pickerPage - 1) * PICKER_PAGE_SIZE;
    return filteredCustomers.slice(startIdx, startIdx + PICKER_PAGE_SIZE);
  }, [filteredCustomers, pickerPage]);

  const DIRECTORY_PAGE_SIZE = 11;
  const totalDirectoryPages = Math.max(1, Math.ceil(filteredCustomers.length / DIRECTORY_PAGE_SIZE));
  const paginatedDirectoryCustomers = useMemo(() => {
    const startIdx = (directoryPage - 1) * DIRECTORY_PAGE_SIZE;
    return filteredCustomers.slice(startIdx, startIdx + DIRECTORY_PAGE_SIZE);
  }, [filteredCustomers, directoryPage]);

  // Group all inbound replies and outbound SMS into Customer Conversation Threads
  const customerThreads = useMemo(() => {
    const threadMap = new Map<string, {
      phone: string;
      cleanPhone: string;
      customerName: string;
      senderAddress?: string | null;
      senderAccountId?: number | null;
      isRegisteredCustomer: boolean;
      messages: Array<{
        id: string;
        direction: 'inbound' | 'outbound';
        message: string;
        timestamp: string;
        read: boolean;
        autoReply?: any;
        status?: string;
        line?: number;
      }>;
      latestMessage: string;
      latestTimestamp: string;
      unreadCount: number;
      totalInboundCount: number;
      totalOutboundCount: number;
    }>();

    // 1. Process all inbound messages
    inbox.forEach(inb => {
      const rawPhone = (inb.from || '').trim();
      const cleanPhone = rawPhone.replace(/[^0-9]/g, '').slice(-10) || rawPhone;
      if (!cleanPhone) return;

      if (!threadMap.has(cleanPhone)) {
        // Match with system customers
        const matchedCust = systemCustomers.find(c => {
          const cClean = (c.phone || c.rawPhone || '').replace(/[^0-9]/g, '').slice(-10);
          return cClean === cleanPhone;
        });

        threadMap.set(cleanPhone, {
          phone: rawPhone,
          cleanPhone,
          customerName: inb.senderName || matchedCust?.name || 'Costumer ' + rawPhone,
          senderAddress: inb.senderAddress || matchedCust?.address || null,
          senderAccountId: inb.senderAccountId || matchedCust?.accountId || null,
          isRegisteredCustomer: !!(inb.senderAccountId || matchedCust),
          messages: [],
          latestMessage: '',
          latestTimestamp: '',
          unreadCount: 0,
          totalInboundCount: 0,
          totalOutboundCount: 0
        });
      }

      const thread = threadMap.get(cleanPhone)!;
      thread.messages.push({
        id: inb.id,
        direction: 'inbound',
        message: inb.message,
        timestamp: inb.receivedAt,
        read: inb.read,
        autoReply: inb.autoReply,
        line: inb.line
      });
      thread.totalInboundCount++;
      if (!inb.read) {
        thread.unreadCount++;
      }
    });

    // 2. Merge outbound messages sent to this customer
    messages.forEach(msg => {
      const rawPhone = (msg.recipient || '').trim();
      const cleanPhone = rawPhone.replace(/[^0-9]/g, '').slice(-10) || rawPhone;
      if (!cleanPhone) return;

      if (threadMap.has(cleanPhone)) {
        const thread = threadMap.get(cleanPhone)!;
        thread.messages.push({
          id: msg.id,
          direction: 'outbound',
          message: msg.message,
          timestamp: msg.createdAt,
          read: true,
          status: msg.status
        });
        thread.totalOutboundCount++;
      }
    });

    // 3. Sort messages inside each thread chronologically and compute latest snippet
    const threadsArray = Array.from(threadMap.values()).map(thread => {
      thread.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      const last = thread.messages[thread.messages.length - 1];
      thread.latestMessage = last ? last.message : '';
      thread.latestTimestamp = last ? last.timestamp : new Date().toISOString();
      return thread;
    });

    // 4. Sort threads by latest message timestamp descending (newest conversation at top)
    threadsArray.sort((a, b) => new Date(b.latestTimestamp).getTime() - new Date(a.latestTimestamp).getTime());

    return threadsArray;
  }, [inbox, messages, systemCustomers]);

  // Filtered threads list based on search and tab filter
  const filteredThreads = useMemo(() => {
    const q = inboxSearch.toLowerCase().trim();
    return customerThreads.filter(t => {
      if (inboxFilter === 'unread' && t.unreadCount === 0) return false;
      if (inboxFilter === 'registered' && !t.isRegisteredCustomer) return false;

      if (!q) return true;
      return (
        t.customerName.toLowerCase().includes(q) ||
        t.phone.includes(q) ||
        t.cleanPhone.includes(q) ||
        (t.senderAddress && t.senderAddress.toLowerCase().includes(q)) ||
        t.messages.some(m => m.message.toLowerCase().includes(q))
      );
    });
  }, [customerThreads, inboxSearch, inboxFilter]);

  // Active selected thread (default to first matching thread if none selected)
  const activeThread = useMemo(() => {
    if (!selectedThreadPhone) {
      return filteredThreads[0] || null;
    }
    return customerThreads.find(t => t.cleanPhone === selectedThreadPhone || t.phone === selectedThreadPhone) || filteredThreads[0] || null;
  }, [customerThreads, filteredThreads, selectedThreadPhone]);

  // Select customer thread and mark as read
  const handleSelectThread = async (thread: typeof customerThreads[0]) => {
    setSelectedThreadPhone(thread.cleanPhone);
    if (thread.unreadCount > 0) {
      try {
        await api.post('/gsm/inbox/read-all', { phone: thread.phone });
        setInbox(prev => prev.map(m => {
          const mClean = (m.from || '').replace(/[^0-9]/g, '').slice(-10);
          if (mClean === thread.cleanPhone) {
            return { ...m, read: true };
          }
          return m;
        }));
        setUnreadInboxCount(prev => Math.max(0, prev - thread.unreadCount));
      } catch (err) {}
    }
  };

  // Quick reply inside customer thread
  const handleSendThreadReply = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeThread || !threadReplyText.trim() || sendingThreadReply) return;

    setSendingThreadReply(true);
    const textToSend = threadReplyText.trim();
    try {
      await api.post('/gsm/send', {
        recipient: activeThread.phone,
        message: textToSend,
        name: activeThread.customerName
      });
      toast.success(`Direct reply sent to ${activeThread.customerName}!`);
      setThreadReplyText('');
      fetchTemplatesAndLogs();
      fetchInbox();
    } catch (err: any) {
      toast.error('Failed to send reply: ' + (err.response?.data?.error || err.message));
    } finally {
      setSendingThreadReply(false);
    }
  };

  // Delete entire conversation thread
  const handleDeleteThread = async (thread: typeof customerThreads[0]) => {
    if (!window.confirm(`Delete all inbound replies from ${thread.customerName} (${thread.phone})?`)) return;
    try {
      await api.delete(`/gsm/inbox/thread/${encodeURIComponent(thread.phone)}`);
      toast.success(`Conversation with ${thread.customerName} deleted.`);
      fetchInbox();
      if (selectedThreadPhone === thread.cleanPhone) {
        setSelectedThreadPhone(null);
      }
    } catch (err) {
      toast.error('Failed to delete conversation.');
    }
  };

  // Mark all inbox messages as read
  const handleMarkAllInboxRead = async () => {
    try {
      await api.post('/gsm/inbox/read-all');
      setInbox(prev => prev.map(m => ({ ...m, read: true })));
      setUnreadInboxCount(0);
      toast.success('All inbound messages marked as read.');
    } catch (err) {
      toast.error('Failed to mark all as read.');
    }
  };

  // Auto-scroll to bottom of conversation
  useEffect(() => {
    if (activeTab === 'inbox' && threadMessagesEndRef.current) {
      threadMessagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeTab, activeThread?.messages.length, activeThread?.cleanPhone]);

  // Filtered inbox list (legacy fallback)
  const filteredInbox = inbox.filter(i => {
    const q = inboxSearch.toLowerCase();
    return (
      i.from.includes(q) ||
      (i.senderName && i.senderName.toLowerCase().includes(q)) ||
      (i.message && i.message.toLowerCase().includes(q))
    );
  });

  // Filtered appointments list
  const filteredAppointments = appointments.filter(a => {
    const q = apptSearch.toLowerCase();
    return (
      a.clientName.toLowerCase().includes(q) ||
      a.clientPhone.includes(q) ||
      (a.serviceType && a.serviceType.toLowerCase().includes(q)) ||
      (a.date && a.date.includes(q)) ||
      (a.notes && a.notes.toLowerCase().includes(q))
    );
  });

  const deliveredCount = messages.filter(m => m.status === 'SENT').length;
  const detectedCarrier = hwStatus?.carrier || 'Globe Telecom';
  const carrierBalanceCmd = (() => {
    const c = detectedCarrier.toLowerCase();
    if (c.includes('smart') || c.includes('tnt') || c.includes('talk') || c.includes('sun')) {
      return '*133#';
    } else if (c.includes('dito')) {
      return '*185#';
    }
    return '*222#';
  })();

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      {/* ─── Navigation Tabs (Top-Level Clean Bar to Maximize Vertical Space) ─── */}
      <div className="flex items-center justify-between border-b border-gray-200 overflow-visible relative text-sm font-medium bg-white px-3 py-1.5 rounded-xl shadow-sm border border-gray-200 z-30">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold ${
              activeTab === 'dashboard'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <LayoutDashboard size={15} /> Dashboard
          </button>

          {/* SMS Dispatcher with Dropdown Menu on Click */}
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setDispatchMenuOpen(prev => !prev);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold ${
                activeTab === 'dispatch' || activeTab === 'appointments'
                  ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              <Send size={14} />
              <span>SMS Dispatcher</span>
              <ChevronDown size={13} className={`transition-transform duration-200 ${dispatchMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Click Outside Overlay */}
            {dispatchMenuOpen && (
              <div 
                className="fixed inset-0 z-40 bg-transparent" 
                onClick={() => setDispatchMenuOpen(false)} 
              />
            )}

            {/* Dropdown Menu choices directly below the button */}
            {dispatchMenuOpen && (
              <div className="absolute top-full left-0 mt-2 w-60 bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  Select Dispatch Module
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('dispatch');
                    setDispatchMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-left font-semibold transition-colors hover:bg-gray-50 ${
                    activeTab === 'dispatch'
                      ? 'bg-red-50 text-red-700 font-bold'
                      : 'text-gray-800'
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-red-100/70 text-red-600">
                    <Send size={13} />
                  </div>
                  <div>
                    <div className="font-bold">Direct Message</div>
                    <div className="text-[10px] text-gray-400 font-normal">Single &amp; Bulk SMS Composer</div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('appointments');
                    setDispatchMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-xs text-left font-semibold transition-colors hover:bg-gray-50 border-t border-gray-100 ${
                    activeTab === 'appointments'
                      ? 'bg-purple-50 text-purple-700 font-bold'
                      : 'text-gray-800'
                  }`}
                >
                  <div className="p-1.5 rounded-lg bg-purple-100/70 text-purple-600">
                    <Calendar size={13} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>Appointment</span>
                      {appointments.length > 0 && (
                        <span className="px-1.5 py-0.2 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">
                          {appointments.length}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 font-normal">Schedule &amp; Auto-SMS Reminder</div>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => setActiveTab('inbox')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold relative ${
              activeTab === 'inbox'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Inbox size={15} /> Inbound Replies
            {unreadInboxCount > 0 && (
              <span className="px-1.5 py-0.2 text-[10px] bg-emerald-600 text-white rounded-full font-bold animate-pulse">
                {unreadInboxCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('customers')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold ${
              activeTab === 'customers'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Users size={15} /> Costumer ({systemCustomers.length})
          </button>

          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold ${
              activeTab === 'templates'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <BookOpen size={15} /> Templates ({templates.length})
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold ${
              activeTab === 'history'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Clock size={15} /> History &amp; Logs
          </button>

          <button
            onClick={() => setActiveTab('ussd')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition-colors whitespace-nowrap text-xs font-semibold ${
              activeTab === 'ussd'
                ? 'bg-red-50 text-red-700 border border-red-200 shadow-xs'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Smartphone size={15} /> SIM Balance
          </button>
        </div>

        {/* Compact Right Status Indicator */}
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500 pl-2">
          <span className={`w-2 h-2 rounded-full ${gatewayReady ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <span className="hidden sm:inline text-gray-700 font-semibold">{connectionLabel}</span>
          <span className="text-gray-400">• Line {hwStatus?.line || 1}</span>
        </div>
      </div>

      {/* ─── TAB 0: DASHBOARD (Header Card + Metrics + Telemetry appear ONLY here) ─── */}
      {activeTab === 'dashboard' && (
        <div className="space-y-5">
          {/* Main Top Gateway Diagnostics Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 shadow-sm">
                  <Smartphone size={28} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold text-gray-900 tracking-tight">GSM SMS Messaging Center</h1>
                    <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                      DBL GoIP-1
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Direct SMS dispatch &amp; inbound reply manager for DBL GoIP-1 cellular gateway.
                  </p>
                </div>
              </div>

              {/* Live Gateway Status Badge */}
              <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2">
                  {gatewayReady ? (
                    <Wifi className="text-emerald-500 animate-pulse" size={20} />
                  ) : (
                    <WifiOff className="text-gray-400" size={20} />
                  )}
                  <div className="text-left">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${gatewayReady ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                      <span className="text-xs font-bold text-gray-800">
                        {connectionLabel}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {hwStatus?.carrier || 'Unknown carrier'} • Line {hwStatus?.line || 1}
                    </div>
                  </div>
                </div>

                <div className="h-7 w-px bg-gray-200" />

                <div className="text-left text-xs">
                  <div className="font-semibold text-gray-700">SIM: {hwStatus?.simState || 'UNKNOWN'}</div>
                  <div className="text-[11px] text-gray-500">{hwStatus?.simNumber || 'Unavailable'}</div>
                </div>

                <button 
                  onClick={fetchStatus} 
                  disabled={checkingConnection}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded transition-colors"
                  title="Refresh status"
                >
                  <RefreshCw size={15} />
                </button>
              </div>
            </div>

            {/* ─── Metric Pills (Clean Direct Architecture) ────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-gray-100 text-xs">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Hardware Line</span>
                <span className="text-lg font-bold text-blue-600">Line {hwStatus?.line || 1}</span>
                <span className="text-[10px] text-gray-400 ml-1">Direct Mode</span>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Delivered SMS</span>
                <span className="text-lg font-bold text-emerald-600">{deliveredCount}</span>
                <span className="text-[10px] text-gray-400 ml-1">Dispatched</span>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Inbound Replies</span>
                <span className="text-lg font-bold text-purple-600">{inbox.length}</span>
                {unreadInboxCount > 0 && (
                  <span className="text-[10px] text-emerald-600 font-bold ml-1">({unreadInboxCount} new)</span>
                )}
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Registered Costumers</span>
                <span className="text-lg font-bold text-red-600">{systemCustomers.length}</span>
                <span className="text-[10px] text-gray-400 ml-1">with phone</span>
              </div>
            </div>
          </div>

          {/* ─── Dashboard Sub-Grids & Quick Dispatch Test ───────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Quick Test Ping */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Zap size={18} className="text-amber-500" />
                <h3 className="font-bold text-gray-900 text-sm">Quick Direct Ping Test</h3>
              </div>
              <p className="text-xs text-gray-500">
                Send an immediate test SMS directly through GoIP-1 Line {hwStatus?.line || 1}.
              </p>
              <form onSubmit={handleQuickTest} className="space-y-2.5 pt-1">
                <input
                  type="text"
                  value={quickTestPhone}
                  onChange={e => setQuickTestPhone(e.target.value)}
                  placeholder="e.g. 09173079499"
                  className="w-full px-3 py-2 text-xs border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-red-200 focus:border-red-500"
                />
                <button
                  type="submit"
                  disabled={quickTestSending}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <Send size={13} /> {quickTestSending ? 'Sending...' : 'Send Direct SMS'}
                </button>
              </form>
            </div>

            {/* Hardware Telemetry Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Activity size={18} className="text-blue-600" />
                <h3 className="font-bold text-gray-900 text-sm">Hardware Telemetry</h3>
              </div>
              <div className="space-y-2 text-xs divide-y divide-gray-100">
                <div className="flex justify-between pt-1">
                  <span className="text-gray-500">Gateway IP:</span>
                  <span className="font-mono font-bold text-gray-800">{hwStatus?.ip || 'Unavailable'}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-gray-500">Signal Strength:</span>
                  <span className="font-semibold text-emerald-600 flex items-center gap-1">
                    <Signal size={13} /> {hwStatus ? `${hwStatus.signalBars}/5 (${hwStatus.signalDbm} dBm)` : 'Unavailable'}
                  </span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-gray-500">SIM Slot State:</span>
                  <span className="font-semibold text-gray-800">{hwStatus?.simState || 'UNKNOWN'}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="text-gray-500">Inbound Webhook:</span>
                  <span className="font-mono text-emerald-600 font-bold">/api/gsm/inbound</span>
                </div>
              </div>
            </div>

            {/* Quick Navigation Cards */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-purple-600" />
                <h3 className="font-bold text-gray-900 text-sm">Quick Actions</h3>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => setActiveTab('inbox')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 rounded-lg text-xs font-semibold border border-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2"><Inbox size={14} /> View Inbound Replies ({inbox.length})</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => setActiveTab('dispatch')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 rounded-lg text-xs font-semibold border border-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2"><Send size={14} /> Open SMS Composer</span>
                  <ArrowRight size={14} />
                </button>
                <button
                  onClick={() => setActiveTab('customers')}
                  className="w-full flex items-center justify-between px-3.5 py-2.5 bg-gray-50 hover:bg-red-50 text-gray-700 hover:text-red-700 rounded-lg text-xs font-semibold border border-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2"><Users size={14} /> View Costumer Directory</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 1: INBOUND REPLIES (MERGED CUSTOMER CONVERSATIONS WORKSPACE) ─── */}
      {activeTab === 'inbox' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[640px]">
          {/* Top Bar for Inbound Center */}
          <div className="px-5 py-3.5 border-b border-gray-200 bg-gray-50/70 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                <Inbox size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-gray-900 tracking-tight">
                    Inbound Costumer Replies
                  </h2>
                  <span className="px-2 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 rounded-full">
                    {customerThreads.length} Conversations
                  </span>
                  {unreadInboxCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-bold bg-emerald-100 text-emerald-800 rounded-full animate-pulse">
                      {unreadInboxCount} Unread Replies
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Each costumer's incoming replies are merged into their conversation thread. Click any costumer to view their replies.
                </p>
              </div>
            </div>

            {/* Top Global Actions */}
            <div className="flex items-center gap-2">
              {unreadInboxCount > 0 && (
                <button
                  onClick={handleMarkAllInboxRead}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer"
                >
                  <CheckCheck size={14} /> Mark All as Read
                </button>
              )}
              <button
                onClick={fetchInbox}
                disabled={loadingInbox}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors shadow-2xs cursor-pointer"
              >
                <RefreshCw size={13} className={loadingInbox ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          {/* 2-Pane Conversation Layout: Left = Customer Thread List, Right = Conversation Messages & Reply Box */}
          <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
            
            {/* ─── LEFT PANE: Merged Customer Threads List ─── */}
            <div className="w-full md:w-80 lg:w-96 border-r border-gray-200 flex flex-col bg-gray-50/40 min-h-0">
              {/* Search & Filter Header */}
              <div className="p-3 border-b border-gray-200 bg-white space-y-2">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search costumer name or phone..."
                    value={inboxSearch}
                    onChange={e => setInboxSearch(e.target.value)}
                    className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500 bg-gray-50/50 outline-none"
                  />
                  {inboxSearch && (
                    <button
                      onClick={() => setInboxSearch('')}
                      className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    onClick={() => setInboxFilter('all')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      inboxFilter === 'all'
                        ? 'bg-red-600 text-white shadow-2xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    All ({customerThreads.length})
                  </button>
                  <button
                    onClick={() => setInboxFilter('unread')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                      inboxFilter === 'unread'
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Unread
                    {unreadInboxCount > 0 && (
                      <span className={`px-1 py-0.2 rounded-full text-[9px] ${
                        inboxFilter === 'unread' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {unreadInboxCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setInboxFilter('registered')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
                      inboxFilter === 'registered'
                        ? 'bg-blue-600 text-white shadow-2xs'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Charge Accs
                  </button>
                </div>
              </div>

              {/* Thread List Scroll Area */}
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {filteredThreads.length === 0 ? (
                  <div className="p-8 text-center text-gray-400">
                    <MessageSquare size={32} className="mx-auto mb-2 text-gray-300" />
                    <p className="font-semibold text-xs text-gray-600">No matching conversations</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {inboxSearch ? 'Try a different search keyword' : 'Incoming SMS from costumers will appear here'}
                    </p>
                  </div>
                ) : (
                  filteredThreads.map(thread => {
                    const isSelected = activeThread?.cleanPhone === thread.cleanPhone;
                    return (
                      <div
                        key={thread.cleanPhone}
                        onClick={() => handleSelectThread(thread)}
                        className={`p-3.5 transition-all cursor-pointer relative flex items-start gap-3 border-l-4 ${
                          isSelected
                            ? 'bg-white border-l-red-600 shadow-xs z-10'
                            : thread.unreadCount > 0
                            ? 'bg-emerald-50/40 hover:bg-white border-l-emerald-500'
                            : 'hover:bg-white border-l-transparent'
                        }`}
                      >
                        {/* Avatar */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-xs shadow-2xs ${
                          thread.isRegisteredCustomer
                            ? 'bg-gradient-to-br from-red-500 to-red-700 text-white'
                            : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-700'
                        }`}>
                          {thread.customerName.slice(0, 2).toUpperCase()}
                        </div>

                        {/* Thread Preview Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-0.5">
                            <h4 className={`text-xs truncate ${
                              thread.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'
                            }`}>
                              {thread.customerName}
                            </h4>
                            <span className="text-[10px] text-gray-400 flex-shrink-0">
                              {new Date(thread.latestTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1">
                            <span className="font-mono text-[10px] text-blue-600 font-medium">{thread.phone}</span>
                            {thread.senderAccountId && (
                              <span className="px-1 py-0.2 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">
                                #{thread.senderAccountId}
                              </span>
                            )}
                          </div>

                          {/* Message snippet */}
                          <p className={`text-[11px] truncate ${
                            thread.unreadCount > 0 ? 'font-semibold text-gray-900' : 'text-gray-500'
                          }`}>
                            {thread.latestMessage || 'No text'}
                          </p>
                        </div>

                        {/* Unread badge & reply count */}
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {thread.unreadCount > 0 ? (
                            <span className="w-5 h-5 bg-emerald-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-xs">
                              {thread.unreadCount}
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 font-medium">
                              {thread.messages.length} msg{thread.messages.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* ─── RIGHT PANE: Active Conversation History & Quick Reply Workspace ─── */}
            {activeThread ? (
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* Active Thread Header */}
                <div className="px-6 py-3.5 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shadow-sm ${
                      activeThread.isRegisteredCustomer
                        ? 'bg-gradient-to-br from-red-600 to-red-800 text-white'
                        : 'bg-gradient-to-br from-gray-200 to-gray-300 text-gray-800'
                    }`}>
                      {activeThread.customerName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900 text-sm">{activeThread.customerName}</h3>
                        {activeThread.isRegisteredCustomer && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold rounded-full">
                            Registered Customer
                          </span>
                        )}
                        {activeThread.senderAccountId && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold rounded-full">
                            Charge Acc #{activeThread.senderAccountId}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                        <span className="font-mono text-blue-600 font-semibold">{activeThread.phone}</span>
                        {activeThread.senderAddress && (
                          <>
                            <span>•</span>
                            <span className="text-gray-400 truncate max-w-xs">{activeThread.senderAddress}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Header Quick Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(activeThread.phone);
                        toast.success(`Copied ${activeThread.phone} to clipboard!`);
                      }}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200 text-xs font-medium flex items-center gap-1.5 cursor-pointer"
                      title="Copy Phone Number"
                    >
                      <Copy size={13} /> Copy Phone
                    </button>

                    <button
                      onClick={() => {
                        setApptForm(prev => ({
                          ...prev,
                          clientName: activeThread.customerName,
                          clientPhone: activeThread.phone
                        }));
                        setActiveTab('appointments');
                        toast.success(`Scheduling appointment for ${activeThread.customerName}`);
                      }}
                      className="p-2 text-purple-700 hover:bg-purple-50 rounded-lg transition-colors border border-purple-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      title="Book Appointment for this Customer"
                    >
                      <CalendarPlus size={13} /> Book Appt
                    </button>

                    <button
                      onClick={() => handleDeleteThread(activeThread)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200 text-xs cursor-pointer"
                      title="Delete this costumer's replies"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Messages Chat Stream */}
                <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50/50">
                  <div className="text-center my-2">
                    <span className="px-3 py-1 bg-gray-200 text-gray-600 text-[10px] font-bold rounded-full uppercase tracking-wider">
                      Conversation with {activeThread.customerName}
                    </span>
                  </div>

                  {activeThread.messages.map((msg, idx) => {
                    const isInbound = msg.direction === 'inbound';
                    return (
                      <div
                        key={msg.id || idx}
                        className={`flex flex-col ${isInbound ? 'items-start' : 'items-end'}`}
                      >
                        <div className="flex items-end gap-2 max-w-[80%]">
                          {isInbound && (
                            <div className="w-7 h-7 rounded-full bg-gray-300 text-gray-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mb-1">
                              {activeThread.customerName.slice(0, 1).toUpperCase()}
                            </div>
                          )}

                          <div className={`p-4 rounded-2xl shadow-sm text-xs space-y-1.5 ${
                            isInbound
                              ? 'bg-white border border-gray-200 text-gray-900 rounded-bl-xs'
                              : 'bg-gradient-to-r from-red-600 to-red-700 text-white rounded-br-xs'
                          }`}>
                            {/* Sender Info Badge */}
                            <div className="flex items-center justify-between gap-3 text-[10px]">
                              <span className={`font-bold ${isInbound ? 'text-red-600' : 'text-red-100'}`}>
                                {isInbound ? `${activeThread.customerName} (Costumer)` : 'JARVIS Dispatcher'}
                              </span>
                              <span className={isInbound ? 'text-gray-400' : 'text-red-200'}>
                                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            </div>

                            {/* Message Text Body */}
                            <p className="whitespace-pre-wrap leading-relaxed text-sm font-normal">
                              {msg.message}
                            </p>

                            {/* Smart Auto-Reply Card Attachment (if triggered) */}
                            {isInbound && msg.autoReply && msg.autoReply.replyText && (
                              <div className="mt-2 p-2.5 bg-purple-50 border border-purple-200 rounded-xl text-[11px] text-purple-900 space-y-1">
                                <div className="flex items-center justify-between font-bold text-purple-700">
                                  <div className="flex items-center gap-1.5">
                                    <Bot size={13} />
                                    <span>Smart Auto-Replied</span>
                                  </div>
                                  <span className="px-1.5 py-0.2 bg-purple-200/80 text-purple-900 rounded font-semibold text-[10px]">
                                    {msg.autoReply.intent || 'INQUIRY'}
                                  </span>
                                </div>
                                <p className="text-gray-800 font-mono italic bg-white p-2 rounded-lg border border-purple-100">
                                  "{msg.autoReply.replyText}"
                                </p>
                                {msg.autoReply.reasoning && (
                                  <div className="text-[10px] text-gray-500 flex items-center gap-1">
                                    <Sparkles size={10} className="text-purple-500" />
                                    <span>{msg.autoReply.reasoning}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Bottom Footer Info */}
                            <div className={`flex items-center justify-between text-[10px] pt-1 ${
                              isInbound ? 'text-gray-400' : 'text-red-200'
                            }`}>
                              <span>{new Date(msg.timestamp).toLocaleDateString()}</span>
                              {isInbound ? (
                                <button
                                  onClick={() => handleDeleteInbox(msg.id)}
                                  className="text-gray-400 hover:text-red-500 transition-colors ml-2 cursor-pointer"
                                  title="Delete message"
                                >
                                  <Trash2 size={11} />
                                </button>
                              ) : (
                                <span className="flex items-center gap-1 text-[10px]">
                                  <CheckCheck size={12} /> Delivered via GSM
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadMessagesEndRef} />
                </div>

                {/* Direct Quick Reply Input Box (Fixed at Bottom of Conversation) */}
                <div className="p-4 border-t border-gray-200 bg-white space-y-2.5">
                  {/* Dynamic Inquiry Choice Pills */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-gray-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                        <Sparkles size={11} className="text-amber-500" /> Pull Info:
                      </span>

                      <button
                        type="button"
                        onClick={() => setInboxInquiryMode(m => m === 'balance' ? 'none' : 'balance')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          inboxInquiryMode === 'balance'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        <CreditCard size={12} /> Costumer Balance
                      </button>

                      <button
                        type="button"
                        onClick={() => setInboxInquiryMode(m => m === 'appointment' ? 'none' : 'appointment')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          inboxInquiryMode === 'appointment'
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                        }`}
                      >
                        <Calendar size={12} /> Appointment
                      </button>

                      <button
                        type="button"
                        onClick={() => setInboxInquiryMode(m => m === 'statement' ? 'none' : 'statement')}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                          inboxInquiryMode === 'statement'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                        }`}
                      >
                        <FileSpreadsheet size={12} /> Purchases / SOA
                      </button>

                      {inboxInquiryMode !== 'none' && (
                        <button
                          type="button"
                          onClick={() => {
                            setInboxInquiryMode('none');
                            setInboxInquirySearch('');
                          }}
                          className="px-2 py-1 text-[10px] text-gray-400 hover:text-gray-600 rounded cursor-pointer"
                        >
                          ✕ Cancel
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {templates.length > 0 && (
                        <div className="relative group">
                          <select
                            aria-label="Insert template"
                            onChange={e => {
                              if (e.target.value) {
                                const tmpl = templates.find(t => t.id === e.target.value);
                                if (tmpl) setThreadReplyText(tmpl.content.replace(/\{\{\s*name\s*\}\}/gi, activeThread.customerName));
                                e.target.value = '';
                              }
                            }}
                            className="text-[11px] bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded px-2 py-0.5 font-medium text-gray-700 cursor-pointer"
                          >
                            <option value="">⚡ Quick Template...</option>
                            {templates.map(t => (
                              <option key={t.id} value={t.id}>{t.title}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <span className="font-mono text-[10px] text-gray-400">
                        {threadReplyText.length} chars
                      </span>
                    </div>
                  </div>

                  {/* Interactive Search & Customer Inquiry Picker Drawer */}
                  {inboxInquiryMode !== 'none' && (
                    <div className="p-3 bg-gray-50/80 border border-gray-200 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          {inboxInquiryMode === 'balance' && <><CreditCard size={14} className="text-emerald-600" /> Select costumer to pull balance for {activeThread.customerName}:</>}
                          {inboxInquiryMode === 'appointment' && <><Calendar size={14} className="text-purple-600" /> Select costumer to pull appointment for {activeThread.customerName}:</>}
                          {inboxInquiryMode === 'statement' && <><FileSpreadsheet size={14} className="text-blue-600" /> Select costumer to pull purchases/SOA for {activeThread.customerName}:</>}
                        </span>
                        <span className="text-[10px] text-gray-400">Click a record to auto-fill reply</span>
                      </div>

                      <div className="relative">
                        <Search size={13} className="absolute left-2.5 top-2 text-gray-400" />
                        <input
                          autoFocus
                          type="text"
                          value={inboxInquirySearch}
                          onChange={e => setInboxInquirySearch(e.target.value)}
                          placeholder="Type name (e.g. Mark), account #, or phone number..."
                          className="w-full pl-7 pr-3 py-1.5 text-xs bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                        />
                      </div>

                      {/* Search Results List */}
                      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 bg-white border border-gray-200 rounded-lg shadow-2xs">
                        {inboxInquiryResults.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            No customers matching "{inboxInquirySearch}"
                          </div>
                        ) : (
                          inboxInquiryResults.map((cust, idx) => (
                            <div
                              key={cust.id || cust.accountId || idx}
                              onClick={() => handleApplyCustomerInquiry(cust, true)}
                              className="p-2.5 hover:bg-red-50/60 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-900 group-hover:text-red-700">{cust.name}</span>
                                  {cust.accountId && (
                                    <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">
                                      #{cust.accountId}
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-gray-400">{cust.phone}</span>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                  {cust.address || 'Valencia City, Bukidnon'}
                                </div>
                              </div>

                              <div className="text-right flex-shrink-0">
                                {inboxInquiryMode === 'balance' && (
                                  <div>
                                    <div className="text-xs font-extrabold text-emerald-700">PHP {cust.balance || '0.00'}</div>
                                    <div className="text-[9px] text-gray-400">Limit: PHP {cust.creditLimit || '0.00'}</div>
                                  </div>
                                )}
                                {inboxInquiryMode === 'appointment' && (
                                  <div>
                                    {cust.appointment ? (
                                      <>
                                        <div className="text-[11px] font-bold text-purple-700">{cust.appointment.date} @ {cust.appointment.time}</div>
                                        <div className="text-[9px] text-gray-500 truncate max-w-[120px]">{cust.appointment.serviceType}</div>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-gray-400 italic">No scheduled appt</span>
                                    )}
                                  </div>
                                )}
                                {inboxInquiryMode === 'statement' && (
                                  <div>
                                    <div className="text-[11px] font-bold text-blue-700">{cust.totalTransactions || 0} Orders</div>
                                    <div className="text-[9px] text-emerald-600 font-semibold">Bal: PHP {cust.balance || '0.00'}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleSendThreadReply} className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                      <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                        <Reply size={13} className="text-red-600" /> Replying directly to <span className="font-bold text-gray-900">{activeThread.customerName}</span> ({activeThread.phone})
                      </span>
                    </div>

                    <div className="flex items-end gap-2">
                      <textarea
                        rows={2}
                        value={threadReplyText}
                        onChange={e => setThreadReplyText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                            e.preventDefault();
                            handleSendThreadReply();
                          }
                        }}
                        placeholder={`Type SMS response to ${activeThread.customerName}... (Press Ctrl+Enter to send)`}
                        className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-xl text-xs focus:ring-2 focus:ring-red-200 focus:border-red-500 resize-none font-sans shadow-2xs outline-none"
                      />

                      <button
                        type="submit"
                        disabled={!threadReplyText.trim() || sendingThreadReply}
                        className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-red-600/20 transition-all active:scale-95 h-full min-h-[52px] cursor-pointer"
                      >
                        {sendingThreadReply ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <>
                            <Send size={14} /> Send SMS
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-12 text-center bg-gray-50/50">
                <div className="max-w-md space-y-3">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
                    <Inbox size={32} />
                  </div>
                  <h3 className="font-bold text-gray-800 text-base">Select a Costumer Conversation</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Click on any costumer from the list on the left to review their complete inbound replies, review Smart Auto-Replies, and send direct SMS responses.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 2: SMS DISPATCHER (Direct Send) ─────────────────────────────── */}
      {activeTab === 'dispatch' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Send size={18} className="text-red-600" /> Compose &amp; Send Direct SMS
              </h2>

              <form onSubmit={handleSend} className="space-y-4">
                {/* Recipients Input & DB Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Recipient Phone Numbers
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCustomerPicker(true)}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded transition-colors border border-red-100"
                    >
                      <Users size={13} /> Select From Costumers ({systemCustomers.length})
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={recipientInput}
                    onChange={e => setRecipientInput(e.target.value)}
                    placeholder="Enter phone numbers separated by comma or new line (e.g. 09171234567, 09951234567)"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 font-mono"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    You can paste multiple numbers or pick costumers directly from the directory.
                  </p>
                </div>

                {/* Dynamic Inquiry Choice System (Balance, Appointment, Statement, Templates) */}
                <div className="bg-gray-50/70 p-3.5 rounded-xl border border-gray-200 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles size={14} className="text-amber-500" />
                      Dynamic Inquiry / Auto-Fill Information
                    </label>
                    <span className="text-[11px] text-gray-400 font-medium">
                      Select what info you want to pull for this SMS
                    </span>
                  </div>

                  {/* Choice Buttons Bar */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInquiryMode(m => m === 'balance' ? 'none' : 'balance')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        inquiryMode === 'balance'
                          ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-200'
                          : 'bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs'
                      }`}
                    >
                      <CreditCard size={14} /> Costumer Balance
                    </button>

                    <button
                      type="button"
                      onClick={() => setInquiryMode(m => m === 'appointment' ? 'none' : 'appointment')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        inquiryMode === 'appointment'
                          ? 'bg-purple-600 text-white shadow-sm ring-2 ring-purple-200'
                          : 'bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 shadow-2xs'
                      }`}
                    >
                      <Calendar size={14} /> Appointment Details
                    </button>

                    <button
                      type="button"
                      onClick={() => setInquiryMode(m => m === 'statement' ? 'none' : 'statement')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        inquiryMode === 'statement'
                          ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-200'
                          : 'bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 shadow-2xs'
                      }`}
                    >
                      <FileSpreadsheet size={14} /> Statement / Purchases
                    </button>

                    <button
                      type="button"
                      onClick={() => setInquiryMode(m => m === 'template' ? 'none' : 'template')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        inquiryMode === 'template'
                          ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-200'
                          : 'bg-white hover:bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs'
                      }`}
                    >
                      <BookOpen size={14} /> Saved Templates
                    </button>

                    {inquiryMode !== 'none' && (
                      <button
                        type="button"
                        onClick={() => {
                          setInquiryMode('none');
                          setInquirySearch('');
                        }}
                        className="px-2.5 py-1.5 text-xs text-gray-500 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                      >
                        ✕ Close
                      </button>
                    )}
                  </div>

                  {/* Interactive Customer Search Drawer (when Balance, Appointment, or Statement is selected) */}
                  {(inquiryMode === 'balance' || inquiryMode === 'appointment' || inquiryMode === 'statement') && (
                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2.5 shadow-2xs animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          {inquiryMode === 'balance' && <><CreditCard size={14} className="text-emerald-600" /> Search costumer to pull balance for this SMS:</>}
                          {inquiryMode === 'appointment' && <><Calendar size={14} className="text-purple-600" /> Search costumer to pull appointment info for this SMS:</>}
                          {inquiryMode === 'statement' && <><FileSpreadsheet size={14} className="text-blue-600" /> Search costumer to pull purchases/SOA summary:</>}
                        </span>
                        <span className="text-[11px] text-gray-400">Click any costumer below to auto-populate</span>
                      </div>

                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                        <input
                          autoFocus
                          type="text"
                          value={inquirySearch}
                          onChange={e => setInquirySearch(e.target.value)}
                          placeholder="Search costumer name (e.g. Mark, Jerome), account #, or phone..."
                          className="w-full pl-8 pr-3 py-2 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                        />
                      </div>

                      {/* Interactive Matches Grid / List */}
                      <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-lg">
                        {!inquirySearch.trim() ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            Type a customer name to search.
                          </div>
                        ) : inquiryResults.length === 0 ? (
                          <div className="p-4 text-center text-xs text-gray-400">
                            No matching customers found for "{inquirySearch}".
                          </div>
                        ) : (
                          inquiryResults.map((cust, idx) => (
                            <div
                              key={cust.id || cust.accountId || idx}
                              onClick={() => handleApplyCustomerInquiry(cust, false)}
                              className="p-2.5 hover:bg-red-50/70 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-gray-900 group-hover:text-red-700">{cust.name}</span>
                                  {cust.accountId && (
                                    <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">
                                      Acc #{cust.accountId}
                                    </span>
                                  )}
                                  <span className="font-mono text-[10px] text-gray-400">{cust.phone}</span>
                                </div>
                                <div className="text-[11px] text-gray-500 truncate mt-0.5">
                                  {cust.address || 'Valencia City, Bukidnon'}
                                </div>
                              </div>

                              <div className="text-right flex-shrink-0">
                                {inquiryMode === 'balance' && (
                                  <div>
                                    <div className="text-xs font-extrabold text-emerald-700">PHP {cust.balance || '0.00'}</div>
                                    <div className="text-[9px] text-gray-400">Limit: PHP {cust.creditLimit || '0.00'}</div>
                                  </div>
                                )}
                                {inquiryMode === 'appointment' && (
                                  <div>
                                    {cust.appointment ? (
                                      <>
                                        <div className="text-[11px] font-bold text-purple-700">{cust.appointment.date} @ {cust.appointment.time}</div>
                                        <div className="text-[9px] text-gray-500 truncate max-w-[140px]">{cust.appointment.serviceType}</div>
                                      </>
                                    ) : (
                                      <span className="text-[10px] text-gray-400 italic">No scheduled appt</span>
                                    )}
                                  </div>
                                )}
                                {inquiryMode === 'statement' && (
                                  <div>
                                    <div className="text-[11px] font-bold text-blue-700">{cust.totalTransactions || 0} Invoices</div>
                                    <div className="text-[9px] text-emerald-600 font-semibold">Bal: PHP {cust.balance || '0.00'}</div>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Saved Templates Dropdown Mode */}
                  {inquiryMode === 'template' && (
                    <div className="p-3 bg-white border border-gray-200 rounded-xl space-y-2 shadow-2xs animate-fadeIn">
                      <label className="block text-xs font-semibold text-gray-700 mb-1">
                        Select a canned template to load into message:
                      </label>
                      <select
                        value={selectedTemplate}
                        onChange={e => {
                          handleApplyTemplate(e.target.value);
                          setInquiryMode('none');
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-red-200 focus:border-red-500 bg-white"
                      >
                        <option value="">— Select a saved message template —</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>[{t.category}] {t.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Message Content */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Message Content
                    </label>
                    <div className="text-[11px] font-medium text-gray-500">
                      <span className="font-bold text-gray-700">{charLength}</span> chars • {smsParts} Part{smsParts > 1 ? 's' : ''} ({isUnicode ? 'Unicode / UCS-2' : 'GSM-7 Standard'})
                    </div>
                  </div>
                  <textarea
                    rows={6}
                    value={messageText}
                    onChange={e => setMessageText(e.target.value)}
                    placeholder="Type your SMS message here... Use {{name}} placeholder to personalize customer names automatically."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 resize-none"
                  />
                </div>

                {/* Dispatch Action Bar */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <div className="text-xs text-gray-500 flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    <span>Direct Cellular Dispatch via GoIP-1 Line {hwStatus?.line || 1}</span>
                  </div>
                  <button
                    type="submit"
                    disabled={sending || !messageText.trim()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold text-sm shadow-sm transition-colors"
                  >
                    <Send size={16} />
                    {sending ? 'Sending...' : 'Send SMS Now'}
                  </button>
                </div>
              </form>
            </div>

            {/* Right Column: Tips & Dynamic Placeholders */}
            <div className="space-y-4">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <Zap size={17} className="text-blue-600" /> Direct Transmission
                </h3>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Messages are sent directly through the GoIP-1 GSM line instantly. Transmission results are recorded in <strong>History &amp; Logs</strong>.
                </p>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-3">
                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                  <BookOpen size={17} className="text-purple-600" /> Personalization Variables
                </h3>
                <p className="text-xs text-gray-600">
                  You can insert dynamic placeholders inside your messages:
                </p>
                <ul className="text-xs space-y-1 text-gray-700 list-disc list-inside">
                  <li><code className="bg-gray-100 px-1 py-0.5 rounded text-red-600">{"{{name}}"}</code> — Costumer / Account Name</li>
                  <li><code className="bg-gray-100 px-1 py-0.5 rounded text-red-600">{"{{date}}"}</code> — Date of sale / transaction</li>
                  <li><code className="bg-gray-100 px-1 py-0.5 rounded text-red-600">{"{{otp}}"}</code> — One-time authorization code</li>
                </ul>
              </div>
            </div>
          </div>
      )}

      {/* ─── TAB 2B: APPOINTMENTS & 3-STAGE AUTOMATED REMINDERS (PHT / Asia/Manila) ─── */}
      {activeTab === 'appointments' && (
        <div className="space-y-4">
          {/* PHT Timezone & 3-Stage Scheduler Control Banner */}
          <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-gray-900 text-white p-4 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center text-purple-300">
                <Clock3 size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    3-Stage Automated Appointment Reminders
                  </h3>
                  <span className="px-2 py-0.5 bg-purple-500/30 text-purple-200 border border-purple-400/30 text-[10px] font-bold rounded-full flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Scheduler Active (PHT / UTC+8)
                  </span>
                </div>
                <p className="text-xs text-purple-200/80 mt-0.5">
                  Sends automatic SMS notifications: <strong>3 Days Prior</strong> • <strong>24 Hours Before</strong> • <strong>Day-Of at 8:00 AM PHT</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="bg-black/30 px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono text-purple-200">
                <span className="text-gray-400 mr-1.5">PHT Time:</span>
                <strong className="text-white">{schedulerStatus?.phtCurrentDate || 'Today'} {schedulerStatus?.phtCurrentTime || '08:00 AM'}</strong>
              </div>

              <button
                type="button"
                onClick={handleForceCheckReminders}
                disabled={runningCheck}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                title="Scan all appointments immediately against current PHT time"
              >
                <RefreshCw size={12} className={runningCheck ? 'animate-spin' : ''} />
                {runningCheck ? 'Scanning...' : 'Force Scan Now'}
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchApptTemplates();
                  setShowApptTemplatesModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold border border-white/20 transition-colors cursor-pointer"
              >
                <Sliders size={12} />
                Edit SMS Templates
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left: Schedule Form */}
            <div className="lg:col-span-4 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <CalendarPlus size={18} className="text-purple-600" /> Schedule Client Appointment
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Set client date &amp; time. 3-stage reminders will automatically dispatch.
                </p>
              </div>

              <form onSubmit={handleCreateAppointment} className="space-y-3.5">
                {/* Costumer Selector Dropdown */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Select Costumer / Client
                    </label>
                    <span className="text-[11px] text-gray-400 font-medium">{systemCustomers.length} registered</span>
                  </div>

                  <select
                    value={apptSelectedCustId}
                    onChange={e => {
                      const val = e.target.value;
                      setApptSelectedCustId(val);
                      if (val === 'custom') {
                        setIsCustomApptClient(true);
                        setApptForm(prev => ({ ...prev, clientName: '', clientPhone: '' }));
                      } else {
                        setIsCustomApptClient(false);
                        const found = systemCustomers.find(c => c.id === val);
                        if (found) {
                          setApptForm(prev => ({ ...prev, clientName: found.name, clientPhone: found.phone }));
                        }
                      }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-500 bg-white"
                  >
                    <option value="">— Choose a costumer from directory —</option>
                    {systemCustomers.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.phone})
                      </option>
                    ))}
                    <option value="custom">+ Enter New / Custom Client Manually</option>
                  </select>
                </div>

                {/* Selected Client Summary Card */}
                {!isCustomApptClient && apptForm.clientName && (
                  <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-purple-900">{apptForm.clientName}</div>
                      <div className="font-mono text-purple-600 text-[11px]">{apptForm.clientPhone}</div>
                    </div>
                    <span className="px-2 py-0.5 bg-purple-200/60 text-purple-800 font-bold text-[10px] rounded-full">
                      Selected
                    </span>
                  </div>
                )}

                {/* Manual Custom Input Fields */}
                {isCustomApptClient && (
                  <div className="grid grid-cols-2 gap-2.5 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Client Full Name
                      </label>
                      <input
                        type="text"
                        required
                        value={apptForm.clientName}
                        onChange={e => setApptForm({ ...apptForm, clientName: e.target.value })}
                        placeholder="e.g. John Santos"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-200"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        required
                        value={apptForm.clientPhone}
                        onChange={e => setApptForm({ ...apptForm, clientPhone: e.target.value })}
                        placeholder="0917xxxxxxx"
                        className="w-full px-2.5 py-1.5 text-xs border border-gray-300 rounded-md font-mono focus:ring-2 focus:ring-purple-200"
                      />
                    </div>
                  </div>
                )}

                {/* Service Type */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Service / Consultation Type
                  </label>
                  <select
                    value={apptForm.serviceType}
                    onChange={e => setApptForm({ ...apptForm, serviceType: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs text-gray-800 focus:ring-2 focus:ring-purple-200 focus:border-purple-500 bg-white"
                  >
                    <option value="General Consultation & Service">General Consultation &amp; Service</option>
                    <option value="Vehicle Maintenance & Inspection">Vehicle Maintenance &amp; Inspection</option>
                    <option value="Parts & Battery Pickup">Parts &amp; Battery Pickup</option>
                    <option value="Billing & Invoice Review">Billing &amp; Invoice Review</option>
                    <option value="Customer Account Consultation">Customer Account Consultation</option>
                    <option value="Warranty / Return Processing">Warranty / Return Processing</option>
                  </select>
                </div>

                {/* Date & Time Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Appointment Date
                    </label>
                    <input
                      type="date"
                      required
                      value={apptForm.date}
                      onChange={e => setApptForm({ ...apptForm, date: e.target.value })}
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-200"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                      Time Slot
                    </label>
                    <input
                      type="text"
                      required
                      value={apptForm.time}
                      onChange={e => setApptForm({ ...apptForm, time: e.target.value })}
                      placeholder="e.g. 10:00 AM"
                      className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-200"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                    Special Notes / Reminders <span className="text-gray-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    value={apptForm.notes}
                    onChange={e => setApptForm({ ...apptForm, notes: e.target.value })}
                    placeholder="Add special instructions or client preferences..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-purple-200 resize-none"
                  />
                </div>

                {/* Auto-Reminder SMS Checkbox */}
                <label className="flex items-center gap-2 p-2.5 bg-purple-50/50 rounded-lg border border-purple-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={apptForm.sendAutoReminder}
                    onChange={e => setApptForm({ ...apptForm, sendAutoReminder: e.target.checked })}
                    className="rounded text-purple-600 focus:ring-purple-500 h-4 w-4"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-gray-900">Enable 3-Stage Auto-Reminders &amp; Confirmation</span>
                    <p className="text-[11px] text-gray-500">Automates 3-Day, 24h, and Day-Of 8:00 AM PHT SMS dispatches</p>
                  </div>
                </label>

                {/* Submit Schedule Button */}
                <button
                  type="submit"
                  disabled={schedulingAppt || !apptForm.clientName || !apptForm.clientPhone}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                >
                  <CalendarPlus size={15} />
                  {schedulingAppt ? 'Scheduling...' : 'Schedule Appointment'}
                </button>
              </form>
            </div>

            {/* Right: Appointments List Table with 3-Stage Tracker */}
            <div className="lg:col-span-8 bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4 flex flex-col">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
                    <Clock3 size={16} className="text-purple-600" /> Scheduled Appointments ({filteredAppointments.length})
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Live tracking of 3-Stage cellular reminder dispatches (3-Day, 24h, Day-Of 8:00 AM).
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-2.5 top-2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search client, service, date..."
                      value={apptSearch}
                      onChange={e => setApptSearch(e.target.value)}
                      className="pl-8 pr-2.5 py-1 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-200 w-48"
                    />
                  </div>

                  <button
                    onClick={() => {
                      fetchAppointments();
                      fetchSchedulerStatus();
                    }}
                    disabled={loadingAppts}
                    className="p-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors cursor-pointer"
                    title="Refresh list"
                  >
                    <RefreshCw size={13} className={loadingAppts ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto border border-gray-200 rounded-lg flex-1 max-h-[560px] overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">Client / Contact</th>
                      <th className="py-2.5 px-3">Service &amp; Schedule</th>
                      <th className="py-2.5 px-3">3-Stage SMS Reminders</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredAppointments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-gray-400">
                          No scheduled appointments found. Create one using the form on the left!
                        </td>
                      </tr>
                    ) : (
                      filteredAppointments.map(appt => {
                        const r3 = appt.reminders?.threeDays;
                        const r24 = appt.reminders?.twentyFourHours;
                        const rDay = appt.reminders?.dayOf;

                        // Calculate days difference relative to current PHT date
                        const currentDateStr = schedulerStatus?.phtCurrentDate || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
                        const dNow = new Date(`${currentDateStr}T00:00:00+08:00`);
                        const dTarget = new Date(`${appt.date}T00:00:00+08:00`);
                        const daysDiff = Math.round((dTarget.getTime() - dNow.getTime()) / (1000 * 60 * 60 * 24));

                        return (
                          <tr key={appt.id} className="hover:bg-gray-50">
                            <td className="py-3 px-3">
                              <div className="font-bold text-gray-900">{appt.clientName}</div>
                              <div className="font-mono text-blue-600 text-[11px]">{appt.clientPhone}</div>
                              {appt.notes && (
                                <span className="text-[10px] text-gray-500 italic block truncate max-w-xs mt-0.5">{appt.notes}</span>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              <span className="font-medium text-gray-800 block">{appt.serviceType}</span>
                              <div className="text-[11px] text-purple-700 font-semibold mt-0.5">
                                📅 {appt.date} • {appt.time}
                              </div>
                              <span className="text-[10px] text-gray-400">
                                {daysDiff === 0 ? '• Today' : daysDiff === 1 ? '• Tomorrow' : daysDiff > 1 ? `• In ${daysDiff} days` : `• ${Math.abs(daysDiff)} days ago`}
                              </span>
                            </td>

                            {/* 3-Stage Reminder Tracker Badges & Quick Triggers */}
                            <td className="py-3 px-3">
                              <div className="flex flex-col gap-1.5">
                                {/* Stage 1: 3 Days Notice */}
                                <div className="flex items-center justify-between gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                  <span className="text-[10px] font-semibold text-gray-700">3 Days Prior:</span>
                                  <div className="flex items-center gap-1.5">
                                    {r3?.sent ? (
                                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[9px] font-bold" title={r3.sentAt ? `Sent on ${new Date(r3.sentAt).toLocaleString()}` : 'Sent'}>
                                        ✓ Sent
                                      </span>
                                    ) : daysDiff === 3 ? (
                                      <span className="px-1.5 py-0.2 bg-blue-500 text-white rounded text-[9px] font-bold animate-pulse">
                                        Due Today 8AM
                                      </span>
                                    ) : daysDiff > 3 ? (
                                      <span className="px-1.5 py-0.2 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[9px] font-medium">
                                        In {daysDiff - 3}d at 8AM
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 bg-gray-100 text-gray-400 rounded text-[9px] font-medium" title="Appointment booked with less than 3 days lead time">
                                        N/A (Short Notice)
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleTriggerStageReminder(appt, '3days')}
                                      disabled={triggeringStage?.apptId === appt.id && triggeringStage?.stage === '3days'}
                                      className="px-1.5 py-0.5 bg-white hover:bg-blue-50 text-blue-600 border border-blue-200 rounded text-[9px] font-bold cursor-pointer transition-colors"
                                      title="Trigger 3-Day Reminder SMS now"
                                    >
                                      {triggeringStage?.apptId === appt.id && triggeringStage?.stage === '3days' ? '...' : '▶ Send'}
                                    </button>
                                  </div>
                                </div>

                                {/* Stage 2: 24h Before */}
                                <div className="flex items-center justify-between gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                  <span className="text-[10px] font-semibold text-gray-700">24h Before:</span>
                                  <div className="flex items-center gap-1.5">
                                    {r24?.sent ? (
                                      <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold" title={r24.sentAt ? `Sent on ${new Date(r24.sentAt).toLocaleString()}` : 'Sent'}>
                                        ✓ Sent
                                      </span>
                                    ) : daysDiff === 1 ? (
                                      <span className="px-1.5 py-0.2 bg-amber-500 text-white rounded text-[9px] font-bold animate-pulse">
                                        Due Today 8AM
                                      </span>
                                    ) : daysDiff > 1 ? (
                                      <span className="px-1.5 py-0.2 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[9px] font-medium">
                                        In {daysDiff - 1}d at 8AM
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 bg-gray-100 text-gray-400 rounded text-[9px] font-medium">
                                        N/A (Today)
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleTriggerStageReminder(appt, '24hours')}
                                      disabled={triggeringStage?.apptId === appt.id && triggeringStage?.stage === '24hours'}
                                      className="px-1.5 py-0.5 bg-white hover:bg-amber-50 text-amber-700 border border-amber-200 rounded text-[9px] font-bold cursor-pointer transition-colors"
                                      title="Trigger 24h Reminder SMS now"
                                    >
                                      {triggeringStage?.apptId === appt.id && triggeringStage?.stage === '24hours' ? '...' : '▶ Send'}
                                    </button>
                                  </div>
                                </div>

                                {/* Stage 3: Day-Of 8:00 AM */}
                                <div className="flex items-center justify-between gap-2 bg-gray-50 px-2 py-1 rounded border border-gray-200">
                                  <span className="text-[10px] font-semibold text-gray-700">Day-Of 8AM:</span>
                                  <div className="flex items-center gap-1.5">
                                    {rDay?.sent ? (
                                      <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold" title={rDay.sentAt ? `Sent on ${new Date(rDay.sentAt).toLocaleString()}` : 'Sent'}>
                                        ✓ Sent
                                      </span>
                                    ) : daysDiff === 0 ? (
                                      <span className="px-1.5 py-0.2 bg-emerald-500 text-white rounded text-[9px] font-bold animate-pulse">
                                        Due Today 8AM
                                      </span>
                                    ) : daysDiff > 0 ? (
                                      <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-[9px] font-medium">
                                        On Appt Day 8AM
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 bg-gray-100 text-gray-400 rounded text-[9px] font-medium">
                                        Past Date
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleTriggerStageReminder(appt, 'dayof')}
                                      disabled={triggeringStage?.apptId === appt.id && triggeringStage?.stage === 'dayof'}
                                      className="px-1.5 py-0.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-bold cursor-pointer transition-colors"
                                      title="Trigger Day-Of 8:00 AM Reminder SMS now"
                                    >
                                      {triggeringStage?.apptId === appt.id && triggeringStage?.stage === 'dayof' ? '...' : '▶ Send'}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-3 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => handleSendApptReminder(appt)}
                                  className="flex items-center gap-1 px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-semibold rounded text-[11px] transition-colors cursor-pointer"
                                  title="Send custom direct SMS reminder"
                                >
                                  <Send size={11} /> Quick SMS
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAppointment(appt.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                                  title="Cancel appointment"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ─── MODAL: Customize 3-Stage Reminder SMS Templates ─── */}
          {showApptTemplatesModal && (
            <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Sliders size={18} className="text-purple-600" />
                      Configure 3-Stage Reminder SMS Templates
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Customize the SMS messages sent for each milestone in Philippine Time (PHT).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowApptTemplatesModal(false)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveApptTemplates} className="space-y-4">
                  {/* Stage 1: 3 Days Advance */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      Stage 1: 3 Days Advance Reminder Template
                    </label>
                    <textarea
                      rows={3}
                      value={apptTemplates.threeDays}
                      onChange={e => setApptTemplates({ ...apptTemplates, threeDays: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-purple-200 outline-none"
                    />
                    <p className="text-[11px] text-gray-400">Dispatched 3 days prior at 8:00 AM PHT.</p>
                  </div>

                  {/* Stage 2: 24 Hours Prior */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      Stage 2: 24 Hours Prior Reminder Template
                    </label>
                    <textarea
                      rows={3}
                      value={apptTemplates.twentyFourHours}
                      onChange={e => setApptTemplates({ ...apptTemplates, twentyFourHours: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-purple-200 outline-none"
                    />
                    <p className="text-[11px] text-gray-400">Dispatched 1 day (24h) before the appointment date.</p>
                  </div>

                  {/* Stage 3: Day-Of 8:00 AM */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-gray-800 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Stage 3: Day-Of (8:00 AM PHT) Reminder Template
                    </label>
                    <textarea
                      rows={3}
                      value={apptTemplates.dayOf8Am}
                      onChange={e => setApptTemplates({ ...apptTemplates, dayOf8Am: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-purple-200 outline-none"
                    />
                    <p className="text-[11px] text-gray-400">Dispatched on appointment morning at 8:00 AM PHT.</p>
                  </div>

                  {/* Variable Cheatsheet */}
                  <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-1.5">
                    <span className="font-bold text-gray-700 block">Supported Dynamic Variables:</span>
                    <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-purple-700">
                      <div><code>{"{{name}}"}</code> — Client Name</div>
                      <div><code>{"{{serviceType}}"}</code> — Service / Purpose</div>
                      <div><code>{"{{date}}"}</code> — Appointment Date</div>
                      <div><code>{"{{time}}"}</code> — Appointment Time</div>
                    </div>
                  </div>

                  {/* Modal Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setShowApptTemplatesModal(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingApptTemplates}
                      className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Save size={13} />
                      {savingApptTemplates ? 'Saving...' : 'Save Templates'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB 3: COSTUMER DIRECTORY (Maximized Height & Space) ───────────── */}
      {activeTab === 'customers' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Users size={18} className="text-red-600" /> Costumer Directory ({filteredCustomers.length})
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Customer accounts and manually added customer contacts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search name, phone, address..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500 w-56"
                />
              </div>

              {/* Small Button for Adding New Contact */}
              <button
                type="button"
                onClick={() => setShowAddContactModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors"
                title="Add a new contact"
              >
                <Plus size={14} /> Add Contact
              </button>

              <button
                onClick={fetchSystemCustomers}
                disabled={loadingCustomers}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <RefreshCw size={13} className={loadingCustomers ? 'animate-spin' : ''} /> Refresh
              </button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-2xs">
            <div className="overflow-x-auto min-h-[480px]">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider sticky top-0 bg-gray-50 z-10">
                  <tr>
                    <th className="py-3 px-4">Account / Costumer Name</th>
                    <th className="py-3 px-4">Phone / Contact No</th>
                    <th className="py-3 px-4">Address / Info</th>
                    <th className="py-3 px-4 text-center">POS Orders</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedDirectoryCustomers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-gray-400">
                        No costumer records match your search query "{customerSearch}".
                      </td>
                    </tr>
                  ) : (
                    paginatedDirectoryCustomers.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">{c.name}</span>
                            {c.accountId && (
                              <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">
                                #{c.accountId}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-blue-600">
                          {c.phone || <span className="text-gray-300 font-normal">-</span>}
                        </td>
                        <td className="py-3 px-4 text-gray-600 max-w-xs truncate">
                          {c.address || '-'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 font-bold rounded-full text-[11px]">
                            {c.totalTransactions}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-red-50 text-red-700 text-[10px] font-semibold rounded">
                            {c.type}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setRecipientInput(c.phone || '');
                              setSelectedCustomerNames([c.name]);
                              setActiveTab('dispatch');
                              toast.success(`Selected ${c.name}`);
                            }}
                            className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-semibold rounded text-[11px] transition-colors cursor-pointer"
                          >
                            Send SMS
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Navigation Bar (11 Users Per Screen) */}
            <div className="px-5 py-3 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-gray-500 text-[11px]">
                Showing <span className="font-bold text-gray-900">{filteredCustomers.length > 0 ? (directoryPage - 1) * DIRECTORY_PAGE_SIZE + 1 : 0}</span> to <span className="font-bold text-gray-900">{Math.min(directoryPage * DIRECTORY_PAGE_SIZE, filteredCustomers.length)}</span> of <span className="font-bold text-gray-900">{filteredCustomers.length.toLocaleString()}</span> Customers (Alphabetical A–Z)
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setDirectoryPage(p => Math.max(1, p - 1))}
                  disabled={directoryPage <= 1}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                >
                  <ChevronLeft size={14} /> Previous
                </button>

                <span className="px-3.5 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 shadow-2xs">
                  Page {directoryPage} of {totalDirectoryPages}
                </span>

                <button
                  type="button"
                  onClick={() => setDirectoryPage(p => Math.min(totalDirectoryPages, p + 1))}
                  disabled={directoryPage >= totalDirectoryPages}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: TEMPLATES & SMART AUTO-REPLY ENGINE ──────────────────────── */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* 🌟 SMART AUTOMATED SYSTEM-BASED INBOUND AUTO-REPLY ENGINE */}
          <div className="bg-white rounded-xl shadow-sm border border-purple-200 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100/80 text-purple-700 rounded-xl border border-purple-200 shadow-xs">
                  <Bot size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-gray-900 tracking-tight">Smart System-Based Inbound Auto-Reply</h2>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-100 text-purple-800 flex items-center gap-1">
                      <Sparkles size={11} /> Intelligent Database Routing
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    When customers or callers text your GoIP SIM number, the system checks their records in the database and automatically replies with personalized details (or informs them if their record does not exist).
                  </p>
                </div>
              </div>

              {/* Master Auto-Reply Switch */}
              <div className="flex items-center gap-3 bg-purple-50/60 p-2.5 rounded-xl border border-purple-100">
                <span className="text-xs font-bold text-gray-700">Smart Engine:</span>
                <button
                  type="button"
                  onClick={() => setAutoReplyConfig({ ...autoReplyConfig, enabled: !autoReplyConfig.enabled })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-xs ${
                    autoReplyConfig.enabled
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  <Bot size={13} />
                  <span>{autoReplyConfig.enabled ? 'Enabled (Active)' : 'Disabled (Paused)'}</span>
                </button>
              </div>
            </div>

            {/* 🌟 AI CHATBOT & SYSTEM KNOWLEDGE GROUNDING PANEL */}
            <div className="bg-purple-50/50 rounded-xl p-4 border border-purple-200 space-y-3.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-purple-100">
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className="text-purple-600" />
                  <h3 className="font-bold text-gray-900 text-xs">AI Chatbot &amp; Live System Grounding</h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-800 rounded-full">
                    Grounded AI Active
                  </span>
                </div>
                <span className="text-[11px] text-gray-500 font-medium">
                  Understands English, Tagalog, and Bisaya/Cebuano
                </span>
              </div>

              {/* Ground Truth Knowledge Highlights */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <span className="text-gray-400 block text-[10px] font-semibold">📍 STORE LOCATION</span>
                  <span className="text-xs font-bold text-gray-800 block truncate">Sayre Hwy, Valencia City</span>
                  <span className="text-[10px] text-emerald-600">Mon-Sat 8AM-5PM</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <span className="text-gray-400 block text-[10px] font-semibold">🌤️ LIVE WEATHER</span>
                  <span className="text-xs font-bold text-blue-600 block">Open-Meteo Synced</span>
                  <span className="text-[10px] text-gray-500">Real-time Valencia City</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <span className="text-gray-400 block text-[10px] font-semibold">🗄️ DATABASE RECORDS</span>
                  <span className="text-xs font-bold text-purple-700 block">{systemCustomers.length} Registered</span>
                  <span className="text-[10px] text-gray-500">Live Balances &amp; Orders</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-purple-100">
                  <span className="text-gray-400 block text-[10px] font-semibold">🔋 CATALOG &amp; LABORS</span>
                  <span className="text-xs font-bold text-gray-800 block">Motolite, Shell, Bendix</span>
                  <span className="text-[10px] text-gray-500">PMS &amp; Battery Tests</span>
                </div>
              </div>

              {/* Optional Gemini LLM Key Configuration */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-2 border-t border-purple-100 text-xs items-center">
                <div className="sm:col-span-4">
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Google Gemini API Key <span className="text-gray-400 font-normal">(Optional for LLM power)</span>
                  </label>
                  <input
                    type="password"
                    value={autoReplyConfig.geminiApiKey || ''}
                    onChange={e => setAutoReplyConfig({ ...autoReplyConfig, geminiApiKey: e.target.value })}
                    placeholder="Paste AI Studio API Key (or leave blank for built-in AI)"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-200"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-[11px] font-semibold text-gray-700 mb-1">
                    Gemini Model
                  </label>
                  <select
                    value={autoReplyConfig.geminiModel || 'gemini-1.5-flash'}
                    onChange={e => setAutoReplyConfig({ ...autoReplyConfig, geminiModel: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-purple-200"
                  >
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Ultra Fast)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Advanced)</option>
                  </select>
                </div>
                <div className="sm:col-span-5 text-[11px] text-gray-500 pt-3 sm:pt-0">
                  <span className="font-semibold text-gray-700">💡 Hybrid Intelligence:</span> The system automatically uses live MySQL customer facts + real-time Open-Meteo weather to formulate accurate SMS replies.
                </div>
              </div>
            </div>

            {/* Smart Templates Grid (4 Core Scenarios) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 1. Customer Found Default */}
              <div className="border border-purple-100 rounded-xl p-4 bg-purple-50/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                    <CheckCircle size={14} className="text-purple-600" /> 1. Registered Costumer (Default Response)
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Intent: General</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Triggered when a registered costumer in <code className="bg-gray-100 px-1 py-0.5 rounded text-purple-700">tablechargeaccount</code> sends a greeting or generic text.
                </p>
                <textarea
                  rows={3}
                  value={autoReplyConfig.customerFoundTemplate}
                  onChange={e => setAutoReplyConfig({ ...autoReplyConfig, customerFoundTemplate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-purple-200 focus:border-purple-500 bg-white"
                />
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 font-mono">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{name}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{accountId}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{address}}"}</span>
                </div>
              </div>

              {/* 2. Customer Balance Inquiry */}
              <div className="border border-emerald-100 rounded-xl p-4 bg-emerald-50/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <CheckCircle size={14} className="text-emerald-600" /> 2. Costumer Balance / Bill Inquiry
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Intent: Balance</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Triggered when text contains keywords like <code className="bg-gray-100 px-1 py-0.5 rounded text-emerald-700">balance, bill, due, utang, magkano</code>.
                </p>
                <textarea
                  rows={3}
                  value={autoReplyConfig.balanceInquiryTemplate}
                  onChange={e => setAutoReplyConfig({ ...autoReplyConfig, balanceInquiryTemplate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 bg-white"
                />
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 font-mono">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{name}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{balance}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{creditLimit}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{accountId}}"}</span>
                </div>
              </div>

              {/* 3. Customer Appointment Inquiry */}
              <div className="border border-blue-100 rounded-xl p-4 bg-blue-50/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-blue-900">
                    <CheckCircle size={14} className="text-blue-600" /> 3. Costumer Appointment Query
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Intent: Appointment</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Triggered when text contains keywords like <code className="bg-gray-100 px-1 py-0.5 rounded text-blue-700">appointment, sched, schedule, booking, oras</code>.
                </p>
                <textarea
                  rows={3}
                  value={autoReplyConfig.appointmentInquiryTemplate}
                  onChange={e => setAutoReplyConfig({ ...autoReplyConfig, appointmentInquiryTemplate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-blue-200 focus:border-blue-500 bg-white"
                />
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 font-mono">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{name}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{serviceType}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{date}}"}</span>
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{time}}"}</span>
                </div>
              </div>

              {/* 4. Customer Record Not Found */}
              <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                    <XCircle size={14} className="text-amber-600" /> 4. Record Not Found (Unregistered Caller)
                  </span>
                  <span className="text-[10px] text-gray-400 font-mono">Intent: Not Found</span>
                </div>
                <p className="text-[11px] text-gray-500">
                  Triggered when the sender number has <strong>no matching account</strong> in the JARVIS system database.
                </p>
                <textarea
                  rows={3}
                  value={autoReplyConfig.customerNotFoundTemplate}
                  onChange={e => setAutoReplyConfig({ ...autoReplyConfig, customerNotFoundTemplate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs font-sans focus:ring-2 focus:ring-amber-200 focus:border-amber-500 bg-white"
                />
                <div className="flex flex-wrap gap-1 text-[10px] text-gray-500 font-mono">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded">{"{{phone}}"}</span>
                </div>
              </div>
            </div>

            {/* Action Bar: Save Rules */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveAutoReplyConfig}
                disabled={savingAutoReply}
                className="flex items-center gap-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                <Save size={14} />
                {savingAutoReply ? 'Saving Rules...' : 'Save Smart Engine Rules'}
              </button>
            </div>

            {/* 🧪 LIVE INTERACTIVE SIMULATOR / TEST SANDBOX */}
            <div className="mt-4 pt-5 border-t border-purple-100 space-y-4 bg-gray-50/80 p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-gray-900 text-xs flex items-center gap-1.5">
                    <Terminal size={14} className="text-purple-600" /> Test Inbound Smart Auto-Reply Simulator
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Test any phone number (registered or unregistered) to preview how the smart reasoning responds.
                  </p>
                </div>
              </div>

              <form onSubmit={handleRunAutoReplySimulation} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
                <div className="md:col-span-4">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Test Phone Number / Costumer Picker
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={simPhone}
                      onChange={e => setSimPhone(e.target.value)}
                      placeholder="e.g. 09173079499"
                      className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg font-mono focus:ring-2 focus:ring-purple-200"
                    />
                    <select
                      onChange={e => {
                        const found = systemCustomers.find(c => c.id === e.target.value);
                        if (found) setSimPhone(found.phone);
                      }}
                      className="px-2 py-1.5 border border-gray-300 rounded-lg text-[11px] bg-white font-sans max-w-[120px]"
                    >
                      <option value="">Pick Cust...</option>
                      {systemCustomers.slice(0, 30).map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="md:col-span-5">
                  <label className="block text-[11px] font-semibold text-gray-600 mb-1">
                    Incoming Message Query
                  </label>
                  <input
                    type="text"
                    value={simMessage}
                    onChange={e => setSimMessage(e.target.value)}
                    placeholder="e.g. BALANCE, APPOINTMENT, or Hello"
                    className="w-full px-2.5 py-1.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-200"
                  />
                </div>

                <div className="md:col-span-3">
                  <button
                    type="submit"
                    disabled={simLoading || !simPhone.trim()}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-xs"
                  >
                    <Sparkles size={13} className={simLoading ? 'animate-spin' : ''} />
                    {simLoading ? 'Analyzing...' : 'Test Smart Reply'}
                  </button>
                </div>
              </form>

              {/* Quick Preset Query Chips */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] text-gray-500 font-semibold">Try sample questions:</span>
                {[
                  'What is the weather today?',
                  'Where is JARVIS auto supply located?',
                  'What time do you close?',
                  'Do you have Motolite batteries in stock?',
                  'What services do you offer?',
                  'Do you accept GCash payment?',
                  'Check my balance',
                  'Check my appointment',
                  'Tell me a joke'
                ].map(q => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setSimMessage(q)}
                    className="px-2 py-0.5 bg-white hover:bg-purple-100 hover:text-purple-700 border border-gray-200 hover:border-purple-300 text-[10px] text-gray-600 rounded-md transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>

              {/* Simulation Result Terminal Card */}
              {simResult && (
                <div className="p-4 bg-white border border-purple-200 rounded-xl space-y-3 text-xs shadow-xs animate-in fade-in">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full font-bold text-[10px] ${
                        simResult.customerFound ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {simResult.customerFound ? '✅ Record Exists in Database' : '⚠️ No Record Found (Unregistered)'}
                      </span>
                      <span className="text-[11px] text-gray-500 font-mono">
                        Intent: <strong>{simResult.intent}</strong>
                      </span>
                    </div>

                    {simResult.customer && (
                      <span className="text-[11px] font-bold text-gray-800 bg-gray-50 px-2 py-0.5 rounded border border-gray-200">
                        {simResult.customer.name} (Account #{simResult.customer.accountId})
                      </span>
                    )}
                  </div>

                  {/* 🧠 AI Chat Analysis & Thought Box */}
                  <div className="p-3 bg-purple-50/70 border border-purple-100 rounded-lg space-y-1">
                    <div className="flex items-center gap-1.5 font-bold text-purple-900 text-[11px]">
                      <Bot size={13} className="text-purple-600" />
                      <span>🧠 Smart Chat Analysis &amp; Thought Reasoning:</span>
                    </div>
                    <p className="text-[11px] text-purple-950 font-sans leading-relaxed">
                      {simResult.thought || simResult.reasoning}
                    </p>
                  </div>

                  {/* 💬 Generated Response */}
                  <div className="p-3 bg-gray-950 text-purple-300 font-mono text-xs rounded-lg whitespace-pre-wrap leading-relaxed border border-gray-800">
                    <span className="text-gray-400 block text-[10px] mb-1 font-sans font-semibold">AUTOMATIC CELLULAR REPLY DISPATCHED:</span>
                    "{simResult.replyText}"
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STANDARD REUSABLE SMS TEMPLATES DIRECTORY */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen size={18} className="text-red-600" /> General Reusable Message Templates
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Standard broadcast messages, OTP alerts, and marketing formats for the direct SMS composer.
                </p>
              </div>
              <button
                onClick={() => setShowNewTemplateModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                <Plus size={14} /> New Template
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="border border-gray-200 rounded-xl p-4 hover:border-red-300 transition-colors space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-600">
                      {tmpl.category}
                    </span>
                    <button
                      onClick={() => {
                        setMessageText(tmpl.content);
                        setActiveTab('dispatch');
                        toast.success(`Loaded template: ${tmpl.title}`);
                      }}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Use in Composer →
                    </button>
                  </div>
                  <h3 className="font-bold text-gray-900 text-sm">{tmpl.title}</h3>
                  <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg border border-gray-100 font-sans leading-relaxed">
                    {tmpl.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 5: HISTORY & LOGS (Maximized Space) ───────────────────────── */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Clock size={18} className="text-red-600" /> Transmission History &amp; Logs
            </h2>
            <button
              onClick={fetchTemplatesAndLogs}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[680px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-semibold uppercase tracking-wider sticky top-0 bg-gray-50">
                <tr>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Message</th>
                  <th className="py-3 px-4">Time</th>
                  <th className="py-3 px-4">Details / Response</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {messages.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">No message logs recorded yet.</td>
                  </tr>
                ) : (
                  messages.slice(0, 50).map(msg => (
                    <tr key={msg.id} className="hover:bg-gray-50">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${
                          msg.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' :
                          msg.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {msg.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-gray-900 whitespace-nowrap">
                        {msg.recipient}
                      </td>
                      <td className="py-3 px-4 text-gray-700 max-w-sm truncate">
                        {msg.message}
                      </td>
                      <td className="py-3 px-4 text-gray-500 whitespace-nowrap">
                        {new Date(msg.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-gray-400 text-[11px]">
                        {msg.error ? <span className="text-red-500">{msg.error}</span> : 'Dispatched via GoIP-1'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TAB 6: REAL SIM BALANCE (Only Check Balance) ──────────────────── */}
      {activeTab === 'ussd' && (
        <div className="space-y-5 max-w-3xl">
          {/* Real Balance Check Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-50 text-red-600 rounded-xl border border-red-100 shadow-sm">
                  <Smartphone size={24} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 tracking-tight">SIM Card Balance Inquiry</h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Query real prepaid load balance and expiry from your attached {detectedCarrier} SIM card.
                  </p>
                </div>
              </div>

              {/* Single Action Button: Check Real Balance */}
              <button
                type="button"
                onClick={async () => {
                  setLoadingUssd(true);
                  try {
                    const { data } = await api.post('/gsm/ussd/check-balance', {
                      line: hwStatus?.line || 1,
                      carrier: hwStatus?.carrier
                    });
                    setUssdResponse(data.data?.response || data.balance?.raw || 'Balance response received.');
                    toast.success('Real SIM balance checked successfully!');
                  } catch (err: any) {
                    toast.error('Balance check failed: ' + (err.response?.data?.error || err.message));
                  } finally {
                    setLoadingUssd(false);
                  }
                }}
                disabled={loadingUssd}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-sm transition-all"
              >
                <RefreshCw size={14} className={loadingUssd ? 'animate-spin' : ''} />
                {loadingUssd ? 'Querying SIM Balance...' : `Check SIM Balance (${carrierBalanceCmd})`}
              </button>
            </div>

            {/* SIM Info Specs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-gray-100 text-xs">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Attached Carrier</span>
                <span className="text-sm font-bold text-gray-900">{detectedCarrier}</span>
                <span className="text-[10px] text-emerald-600 block mt-0.5">Line {hwStatus?.line || 1}</span>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">SIM Card Number</span>
                <span className="text-sm font-mono font-bold text-blue-600">{hwStatus?.simNumber || '0917-307-9499'}</span>
                <span className="text-[10px] text-gray-400 block mt-0.5">Physical SIM</span>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Signal Reception</span>
                <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                  <Signal size={13} /> {hwStatus?.signalBars || 4}/5 ({hwStatus?.signalDbm || -75} dBm)
                </span>
                <span className="text-[10px] text-gray-400 block mt-0.5">Connected</span>
              </div>

              <div className="bg-gray-50 p-3 rounded-lg border border-gray-100">
                <span className="text-gray-500 block text-[11px]">Registration</span>
                <span className="text-sm font-bold text-gray-800">{hwStatus?.simState || 'REGISTERED'}</span>
                <span className="text-[10px] text-emerald-600 block mt-0.5">Active</span>
              </div>
            </div>

            {/* Real Balance Output Terminal */}
            <div className="pt-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Carrier Balance Result:
                </span>
                {ussdResponse && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(ussdResponse);
                      toast.success('Balance text copied!');
                    }}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Copy Output
                  </button>
                )}
              </div>

              <div className="bg-gray-950 text-emerald-400 p-5 rounded-xl font-mono text-xs whitespace-pre-wrap leading-relaxed shadow-inner min-h-[140px] border border-gray-800">
                {ussdResponse ? (
                  ussdResponse
                ) : (
                  <span className="text-gray-500 font-sans italic">
                    Click the green "Check SIM Balance" button above to query your real cellular account balance and expiration date from {detectedCarrier}.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Customer Picker from Database ───────────────────────────── */}
      {showCustomerPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowCustomerPicker(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="font-bold text-gray-900 text-base">Select Costumers for Broadcast</h3>
                <p className="text-xs text-gray-500">Pick from {systemCustomers.length} registered costumers in directory</p>
              </div>
              <button onClick={() => setShowCustomerPicker(false)} className="text-gray-400 hover:text-gray-600 font-bold text-lg">✕</button>
            </div>

            {/* Picker Toolbar */}
            <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3 bg-white">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Filter by costumer name or phone number..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-red-200 focus:border-red-500"
                />
              </div>

              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors"
                >
                  Select All Filtered ({filteredCustomers.length})
                </button>
                <span className="text-gray-400">|</span>
                <span className="font-semibold text-red-600">
                  {pickerSelectedIds.size} Selected
                </span>
              </div>
            </div>

            {/* Customer List (Paginated: 15 per page, A-Z) */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-gray-100 text-xs min-h-[420px]">
              {paginatedCustomers.length === 0 ? (
                <div className="p-8 text-center text-gray-400">
                  No costumers found matching "{customerSearch}".
                </div>
              ) : (
                paginatedCustomers.map(c => {
                  const isSelected = pickerSelectedIds.has(c.id);
                  return (
                    <div
                      key={c.id}
                      onClick={() => toggleSelectCustomer(c)}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? 'bg-red-50 border border-red-100' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={isSelected ? 'text-red-600 flex-shrink-0' : 'text-gray-300 flex-shrink-0'}>
                          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-gray-900 truncate">{c.name}</span>
                            {c.accountId && (
                              <span className="px-1.5 py-0.2 bg-blue-50 text-blue-700 rounded text-[9px] font-bold">
                                #{c.accountId}
                              </span>
                            )}
                            <span className="px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded text-[9px] font-semibold">
                              {c.type}
                            </span>
                          </div>
                          <div className="text-[11px] text-gray-500 truncate mt-0.5">{c.address || 'No address registered'}</div>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 ml-3">
                        {c.phone ? (
                          <div className="font-mono font-medium text-blue-600">{c.phone}</div>
                        ) : (
                          <div className="text-gray-300 font-mono text-xs">-</div>
                        )}
                        {c.balance && c.balance !== '0.00' && (
                          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">
                            Bal: PHP {c.balance}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination Controls Bar (15 Per Page) */}
            <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-gray-500 text-[11px]">
                Showing <span className="font-bold text-gray-900">{filteredCustomers.length > 0 ? (pickerPage - 1) * PICKER_PAGE_SIZE + 1 : 0}</span> to <span className="font-bold text-gray-900">{Math.min(pickerPage * PICKER_PAGE_SIZE, filteredCustomers.length)}</span> of <span className="font-bold text-gray-900">{filteredCustomers.length.toLocaleString()}</span> costumers &amp; users (Sorted A-Z)
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPickerPage(p => Math.max(1, p - 1))}
                  disabled={pickerPage <= 1}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                >
                  <ChevronLeft size={14} /> Previous
                </button>

                <span className="px-3 py-1 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-800 shadow-2xs">
                  Page {pickerPage} / {totalPickerPages}
                </span>

                <button
                  type="button"
                  onClick={() => setPickerPage(p => Math.min(totalPickerPages, p + 1))}
                  disabled={pickerPage >= totalPickerPages}
                  className="px-3 py-1.5 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-white text-gray-700 font-semibold rounded-lg border border-gray-200 transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-white flex items-center justify-between">
              <span className="text-xs text-gray-500">{pickerSelectedIds.size} recipients selected</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomerPicker(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApplyPickedCustomers}
                  disabled={pickerSelectedIds.size === 0}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors shadow-sm"
                >
                  Apply {pickerSelectedIds.size} Recipients
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Add New Contact ────────────────────────────────────────── */}
      {showAddContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAddContactModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-emerald-50/60">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
                  <Plus size={16} />
                </div>
                <h3 className="font-bold text-gray-900 text-sm">Add New Contact</h3>
              </div>
              <button onClick={() => setShowAddContactModal(false)} className="text-gray-400 hover:text-gray-600 font-bold text-base">✕</button>
            </div>

            <form onSubmit={handleSaveContact} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Contact / Costumer Name</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe / Davao Express"
                  value={newContact.name}
                  onChange={e => setNewContact({ ...newContact, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 09171234567 or +639171234567"
                  value={newContact.phone}
                  onChange={e => setNewContact({ ...newContact, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Address / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Valencia City, Bukidnon"
                  value={newContact.address}
                  onChange={e => setNewContact({ ...newContact, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Group Tag</label>
                <select
                  value={newContact.group}
                  onChange={e => setNewContact({ ...newContact, group: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500 bg-white"
                >
                  <option value="General">General</option>
                  <option value="VIP Clients">VIP Clients</option>
                  <option value="JARVIS Customers">JARVIS Costumers</option>

                  <option value="Leads">Leads</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Preferred contact for sales updates"
                  value={newContact.notes}
                  onChange={e => setNewContact({ ...newContact, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-200 focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddContactModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-lg text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingContact || !newContact.phone.trim()}
                  className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs shadow-sm transition-colors"
                >
                  <Plus size={14} /> {savingContact ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: New Template ────────────────────────────────────────────── */}
      {showNewTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowNewTemplateModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900 text-base">Create Message Template</h3>
              <button onClick={() => setShowNewTemplateModal(false)} className="text-gray-400 hover:text-gray-600 font-bold">✕</button>
            </div>
            <form onSubmit={handleSaveTemplate} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Template Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sales Follow-up"
                  value={newTemplate.title}
                  onChange={e => setNewTemplate({ ...newTemplate, title: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Category</label>
                <select
                  value={newTemplate.category}
                  onChange={e => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500 bg-white"
                >
                  <option value="General">General</option>
                  <option value="Appointment">Appointment</option>
                  <option value="Notification">Notification</option>
                  <option value="Finance">Finance</option>
                  <option value="Marketing">Marketing</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1 uppercase tracking-wider">Content</label>
                <textarea
                  rows={4}
                  required
                  placeholder="Hi {{name}}, ..."
                  value={newTemplate.content}
                  onChange={e => setNewTemplate({ ...newTemplate, content: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-200 focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTemplateModal(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-600 font-semibold rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
