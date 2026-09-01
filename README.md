# Automated GSM SMS Messaging System (DBL GoIP-1 & React Native)

A production-grade Automated SMS Messaging and Queue Management System for the **DBL GoIP-1 GSM Gateway** and **React Native / Web Client**, built with Node.js Express, WebSockets, SQLite/JSON store, and modern web UI.

---

## 📸 System Architecture & Data Flow

```
 ┌─────────────────────────────────────────────────────────────┐
 │           React Native App (Web & Mobile)                   │
 │   - Live Gateway Dashboard (IP, RSSI, SIM State, Line 1)    │
 │   - SMS Composer & Character Encoder (GSM-7 & UCS-2)        │
 │   - Queue Engine Control (Jitter, Retries, Pause/Resume)    │
 │   - USSD Balance Command Terminal (*143#, *123#)            │
 └──────────────────────────────┬──────────────────────────────┘
                                │ REST API & WebSocket Telemetry
 ┌──────────────────────────────▼──────────────────────────────┐
 │               Node.js Express Backend API                   │
 │   - Queue Engine (Rate limiting with 5-10s random jitter)   │
 │   - GoIP Hardware Driver (HTTP API, USSD, String Parser)    │
 │   - Mock GoIP Simulator (For hardware-less testing)         │
 │   - Message & Log Store                                     │
 └──────────────────────────────┬──────────────────────────────┘
                                │ HTTP GET / USSD via LAN Switch
 ┌──────────────────────────────▼──────────────────────────────┐
 │           DBL GoIP-1 GSM Gateway (192.168.1.150)            │
 │   Endpoint: http://192.168.1.150/default/en_US/send.html    │
 └──────────────────────────────┬──────────────────────────────┘
                                │ Cellular Network
 ┌──────────────────────────────▼──────────────────────────────┐
 │                    Target Mobile User                       │
 └─────────────────────────────────────────────────────────────┘
```

---

## 🔍 PDF Analysis & DBL GoIP-1 Best Improvements

### PDF Architecture Vulnerabilities:
1. **Raw HTTP GET (`send.html`)**: The PDF uses basic HTTP GET parameters (`/default/en_US/send.html?u=admin&p=admin...`). This only confirms acceptance by the GoIP line buffer (`Sending,L1`), NOT tower handshake or handset delivery (DLR).
2. **Telco SIM Blocking Risk**: Discharging SMS sequentially without delay variance causes cellular providers (e.g. Globe/Smart/PLDT, AT&T/T-Mobile) to flag and block the SIM card.
3. **No USSD or SIM Balance Management**: Prepaid SIM cards run out of balance silently, causing continuous `GATEWAY_BUSY` errors without developer feedback.

### Recommended System Improvements Implemented:
1. **Randomized Delay Jitter (5-10s)**: Added anti-SIM block spacing between consecutive dispatches to mimic human messaging cadence.
2. **Automatic Retry on Line Busy**: If GoIP returns `busy`, the queue engine automatically retries up to 3 times before declaring failure.
3. **Integrated USSD Terminal**: Run `*143#` or `*123#` balance checks directly from the app.
4. **GSM-7 & UCS-2 Unicode Detector**: Calculates SMS parts automatically (160 chars for 7-bit, 70 chars for Emojis/Unicode).
5. **Mock GoIP Hardware Simulator**: Complete offline hardware simulation mode out-of-the-box.

---

## 🚀 How to Run the System (Standalone Demo)

### 1. Start the Backend API & Queue Server
```bash
cd backend
npm install
npm start
```
*Backend runs at http://localhost:3080 with WebSocket at ws://localhost:3080*

### 2. Start the React Native / Web Dashboard (Development Mode)
```bash
cd frontend
npm install
npm run dev
```
*Dev server opens at http://localhost:5180*

---

## 🛠️ DBL GoIP-1 Hardware Integration Command
To send SMS directly via GoIP web endpoint:
```bash
curl "http://192.168.1.150/default/en_US/send.html?u=admin&p=admin&l=1&n=+639171234567&m=TestMessage"
```

To run USSD balance query:
```bash
curl "http://192.168.1.150/default/en_US/ussd.html?u=admin&p=admin&l=1&cmd=*143#"
```
