# 📡 JARVIS Standalone GSM Gateway & 3-Stage SMS Appointment Reminder System

A self-contained, independent GSM SMS Gateway microservice and Automated 3-Stage Appointment Reminder subsystem built for GoIP hardware gateways (1/4/8/16/32 port models) and simulated mock mode.

---

## 🌟 Features

* **⚡ Independent Standalone Microservice**: Runs completely self-contained on **`http://localhost:5176`** with its own persistent JSON database store (`backend/data/gsm_store.json`).
* **🌐 Built-in Web UI Dashboard**: Modern, responsive dark-mode dashboard for managing SMS dispatch, live signal strength (CSQ), appointments, inbox, auto-reply rules, and hardware settings.
* **⏰ 3-Stage Automated 8:00 AM PHT Reminder Engine**:
  * **Stage 1 (3-Day Prior)**: Automatically dispatches at **8:00 AM PHT** exactly 3 days before the appointment.
  * **Stage 2 (24-Hour Prior)**: Automatically dispatches at **8:00 AM PHT** 1 day before the appointment.
  * **Stage 3 (Day-Of Morning)**: Dispatches on appointment morning at **8:00 AM PHT** with confirmation instructions.
* **🤖 Smart Auto-Reply Engine**: AI and keyword-based automatic replies for customer balance inquiries, appointment confirmations, and general FAQs.
* **🛡️ Anti-Ban Outbound Queue**: Intelligent 5–10s jitter delay and rate-limiting to protect SIM cards from carrier blocking.
* **📡 GoIP Hardware Driver & Mock Mode**: Seamlessly switches between live GoIP HTTP hardware and local mock simulation.

---

## 📁 Directory Structure

```
gsm-module/
├── standalone-server.js        # Express microservice & web server (Port 5176)
├── start.bat                   # 1-Click Windows batch launcher
├── package.json                # Dependencies (express, cors, axios, dotenv)
├── .env.example                # Configurable ports & hardware environment variables
├── .gitignore                  # Git ignore rules
│
├── public/                     # Standalone Web Dashboard
│   └── index.html              # Interactive single-page dashboard UI
│
└── backend/
    ├── routes/
    │   └── gsm.js              # Full REST API endpoints (/api/gsm)
    ├── data/
    │   └── gsm_store.json      # Persistent local database store
    └── lib/gsm/
        ├── appointmentScheduler.js # 3-Stage 8:00 AM PHT reminder scheduler
        ├── database.js             # Local JSON data store manager
        ├── goipDriver.js           # Physical GoIP HTTP/AT hardware driver
        ├── mockGoipGateway.js      # Mock gateway simulation driver
        ├── queueEngine.js          # Rate-limited outbound queue with anti-spam jitter
        ├── inboundPoller.js        # Incoming SMS poller (15s polling interval)
        └── smartAutoReply.js       # Natural language & rule-based auto-reply engine
```

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/Mark2232/GSM_ATTACHMENT.git
cd GSM_ATTACHMENT
npm install
```

### 2. Run the System

**Windows (1-Click):**
Double-click `start.bat`.

**Command Line:**
```bash
npm start
```

### 3. Open the Dashboard
Navigate to [**`http://localhost:5176`**](http://localhost:5176) in your browser.

---

## 🔗 API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Service health status, uptime, and Philippine Standard Time |
| `GET` | `/api/gsm/status` | GoIP gateway online/offline status and signal CSQ |
| `POST` | `/api/gsm/send` | Dispatch single or priority SMS |
| `GET` | `/api/gsm/appointments` | Fetch all scheduled appointments & 3-stage reminder states |
| `POST` | `/api/gsm/appointments` | Schedule a new appointment with automated reminder triggers |
| `POST` | `/api/gsm/appointments/process-reminders` | Force execution of 8:00 AM PHT reminder scheduler |
| `GET` | `/api/gsm/inbound` | Fetch received SMS messages with auto-reply tags |
| `POST` | `/api/gsm/auto-reply/simulate` | Test auto-reply response without sending live SMS |
| `GET` | `/api/gsm/queue/status` | View outbound rate-limited queue |
| `POST` | `/api/gsm/config` | Update GoIP hardware IP, credentials, and SIM lines |

---

## ⚙️ Configuration (`.env`)

```env
GSM_PORT=5176
PORT=5176
GOIP_IP=192.168.8.190
GOIP_USER=admin
GOIP_PASS=admin
GOIP_LINE=1
USE_MOCK_GATEWAY=false
GSM_MIN_DELAY_SEC=5
GSM_MAX_DELAY_SEC=10
GSM_DAILY_LIMIT=500
```
