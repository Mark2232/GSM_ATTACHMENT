const db = require('./database');
let pool = null;
try {
  pool = require('../../config/database');
} catch (e) {
  // Standalone mode: using JSON database store
}
const goipDriver = require('./goipDriver');

// Cache for live weather queries (10-minute TTL)
const weatherCache = new Map();

class SmartAutoReplyEngine {
  normalizePhone(phone) {
    if (!phone) return '';
    const clean = String(phone).replace(/[^0-9]/g, '');
    if (clean.length >= 10) return clean.slice(-10);
    return clean;
  }

  /**
   * Searches MySQL `tablechargeaccount` and local contacts for a matching record.
   */
  async findCustomerByPhone(phone) {
    const norm = this.normalizePhone(phone);
    if (!norm) return null;

    // 1. Search MySQL tablechargeaccount (if connected)
    if (pool) {
      try {
        const [rows] = await pool.query(`
        SELECT 
          ca.AccountId,
          ca.AccountName,
          ca.ContactNo,
          ca.Address,
          ca.CreditLimit,
          ca.IsActive,
          ca.IsBlockList,
          ca.Remark
        FROM tablechargeaccount ca
        WHERE ca.ContactNo IS NOT NULL 
          AND TRIM(ca.ContactNo) != ''
          AND ca.ContactNo != '-'
      `);

      for (const r of rows) {
        const raw = String(r.ContactNo || '');
        const phoneParts = raw.split(/[\/,; ]/).map(p => p.trim()).filter(Boolean);
        for (const part of phoneParts) {
          const cleanPart = this.normalizePhone(part);
          if (cleanPart && (cleanPart === norm || cleanPart.endsWith(norm) || norm.endsWith(cleanPart))) {
            // Fetch live charge balance & recent transactions
            let calculatedBalance = 0;
            let totalInvoices = 0;
            let latestInvoiceDate = null;
            try {
              const [balRows] = await pool.query(`
                SELECT 
                  COALESCE(SUM(pi.UnitPrice * pi.Quantity), 0) as openBalance,
                  COUNT(DISTINCT p.PosId) as totalOrders,
                  MAX(p.DateSale) as latestSale
                FROM tablepos p
                JOIN tablepositem pi ON p.PosId = pi.PosId
                WHERE p.AccountId = ? AND p.IsVoidInvoice = 0 AND (p.IsPaid = 0 OR p.IsPaid IS NULL)
              `, [r.AccountId]);
              if (balRows && balRows.length > 0) {
                calculatedBalance = Number(balRows[0].openBalance || 0);
                totalInvoices = Number(balRows[0].totalOrders || 0);
                latestInvoiceDate = balRows[0].latestSale;
              }
            } catch (balErr) {
              calculatedBalance = Number(r.CreditLimit || 0);
            }

            return {
              type: 'DATABASE_CHARGE_ACCOUNT',
              accountId: r.AccountId,
              name: r.AccountName,
              phone: part,
              address: r.Address || 'Valencia City, Bukidnon',
              creditLimit: Number(r.CreditLimit || 0).toLocaleString('en-US', { minimumFractionDigits: 2 }),
              rawBalance: calculatedBalance,
              balance: calculatedBalance > 0 ? calculatedBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00',
              totalInvoices,
              latestInvoiceDate,
              isActive: r.IsActive === 1,
              isBlocked: r.IsBlockList === 1,
              remarks: r.Remark
            };
          }
        }
      }
      } catch (err) {
        console.warn('[SmartAutoReply] MySQL customer lookup error:', err.message);
      }
    }

    // 2. Search local contacts
    const localContacts = db.getContacts();
    for (const lc of localContacts) {
      const cleanLc = this.normalizePhone(lc.phone);
      if (cleanLc && (cleanLc === norm || cleanLc.endsWith(norm) || norm.endsWith(cleanLc))) {
        return {
          type: 'LOCAL_CONTACT',
          accountId: lc.id,
          name: lc.name,
          phone: lc.phone,
          address: lc.address || 'N/A',
          creditLimit: '0.00',
          rawBalance: 0,
          balance: '0.00',
          totalInvoices: 0,
          isActive: true,
          isBlocked: false,
          remarks: lc.notes
        };
      }
    }

    return null;
  }

  /**
   * Finds the latest upcoming appointment for the given phone or client name.
   */
  findAppointment(phone, clientName) {
    const norm = this.normalizePhone(phone);
    const appts = db.getAppointments();

    const matches = appts.filter(a => {
      const aPhone = this.normalizePhone(a.clientPhone);
      const isPhoneMatch = norm && aPhone && (aPhone === norm || aPhone.endsWith(norm) || norm.endsWith(aPhone));
      const isNameMatch = clientName && a.clientName && a.clientName.toLowerCase().trim() === clientName.toLowerCase().trim();
      return isPhoneMatch || isNameMatch;
    });

    if (matches.length === 0) return null;
    return matches[matches.length - 1];
  }

  /**
   * 🌤️ Real-Time Live Weather Fetcher for Valencia City, Bukidnon & Major Philippine Cities
   */
  async fetchLiveWeather(rawText = '') {
    const lower = rawText.toLowerCase();

    // Determine target location (default to Valencia City, Bukidnon where store is located)
    let city = 'Valencia City, Bukidnon';
    let lat = 7.9064;
    let lon = 125.0942;

    if (lower.includes('davao')) {
      city = 'Davao City';
      lat = 7.1907;
      lon = 125.4553;
    } else if (lower.includes('cdo') || lower.includes('cagayan de oro') || lower.includes('cagayan')) {
      city = 'Cagayan de Oro City';
      lat = 8.4542;
      lon = 124.6319;
    } else if (lower.includes('malaybalay')) {
      city = 'Malaybalay City, Bukidnon';
      lat = 8.1575;
      lon = 125.1278;
    } else if (lower.includes('manila') || lower.includes('ncr')) {
      city = 'Metro Manila';
      lat = 14.5995;
      lon = 120.9842;
    } else if (lower.includes('cebu')) {
      city = 'Cebu City';
      lat = 10.3157;
      lon = 123.8854;
    }

    const cacheKey = `${lat}_${lon}`;
    const cached = weatherCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 10 * 60 * 1000) {
      return { city, ...cached.data };
    }

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=Asia%2FManila`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) throw new Error(`Weather HTTP error: ${res.status}`);
      const data = await res.json();
      const current = data.current || {};

      const code = current.weather_code ?? 1;
      let condition = 'Partly Cloudy';
      let advice = 'Good conditions for driving and maintenance.';

      if (code === 0) {
        condition = 'Clear & Sunny ☀️';
        advice = 'Great weather to visit JARVIS for battery & engine checkups!';
      } else if (code <= 3) {
        condition = 'Partly Cloudy to Overcast ⛅';
        advice = 'Comfortable weather for vehicle maintenance & parts pickup.';
      } else if (code === 45 || code === 48) {
        condition = 'Foggy / Misty 🌫️';
        advice = 'Low visibility on highways, please ensure fog lights & wipers work.';
      } else if (code >= 51 && code <= 55) {
        condition = 'Light Drizzle 🌦️';
        advice = 'Wet roads ahead. Ensure your windshield wiper blades are in good condition.';
      } else if (code >= 61 && code <= 65) {
        condition = 'Moderate to Heavy Rain 🌧️';
        advice = 'Rainy weather: drive safely, check brake pads and tire traction!';
      } else if (code >= 80 && code <= 82) {
        condition = 'Passing Rain Showers 🌧️';
        advice = 'Expect sudden rain showers. Drive carefully.';
      } else if (code >= 95) {
        condition = 'Thunderstorm ⛈️';
        advice = 'Thunderstorm alert. Slow down on slippery roads and avoid flooded zones.';
      }

      const weatherResult = {
        city,
        temp: current.temperature_2m !== undefined ? Math.round(current.temperature_2m) : 30,
        apparentTemp: current.apparent_temperature !== undefined ? Math.round(current.apparent_temperature) : 33,
        humidity: current.relative_humidity_2m || 65,
        windSpeed: current.wind_speed_10m || 8,
        precipitation: current.precipitation || 0,
        condition,
        advice
      };

      weatherCache.set(cacheKey, { timestamp: Date.now(), data: weatherResult });
      return weatherResult;
    } catch (err) {
      console.warn('[SmartAutoReply] Live weather API fallback:', err.message);
      return {
        city,
        temp: 30,
        apparentTemp: 33,
        humidity: 65,
        windSpeed: 8,
        precipitation: 0,
        condition: 'Warm & Tropical ⛅',
        advice: 'Normal weather conditions in Bukidnon. Safe travels!'
      };
    }
  }

  /**
   * 🤖 Calls Google Gemini or OpenAI LLM with full system grounding context.
   */
  async generateLLMReply({ text, customer, appointment, weather, cleanPhone, config }) {
    const geminiKey = config.geminiApiKey || process.env.GEMINI_API_KEY;
    const openaiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;

    if (!geminiKey && !openaiKey) {
      return null;
    }

    const customerContext = customer ? `
- Customer Name: ${customer.name}
- Account ID: #${customer.accountId}
- Registered Phone: ${customer.phone}
- Address: ${customer.address}
- Current Unpaid Charge Account Balance: PHP ${customer.balance}
- Credit Limit: PHP ${customer.creditLimit}
- Total Previous Orders: ${customer.totalInvoices}
` : `
- Customer Status: UNREGISTERED / NOT FOUND IN SYSTEM (Phone: ${cleanPhone})
`;

    const appointmentContext = appointment ? `
- Scheduled Appointment: ${appointment.serviceType}
- Date & Time: ${appointment.date} at ${appointment.time}
- Notes: ${appointment.notes || 'None'}
` : `
- Scheduled Appointment: None pending
`;

    const weatherContext = weather ? `
- Location: ${weather.city}
- Temperature: ${weather.temp}°C (Feels like ${weather.apparentTemp}°C)
- Condition: ${weather.condition}
- Humidity: ${weather.humidity}%
- Rain / Precipitation: ${weather.precipitation} mm
- Road / Travel Advice: ${weather.advice}
` : 'Weather: Tropical (Valencia City, Bukidnon)';

    const systemPrompt = `You are JARVIS AI, the smart, helpful, and courteous automated AI assistant for JARVIS Auto Supply & Automotive Service in Valencia City, Bukidnon, Philippines.
You are communicating with customers via SMS text messaging.

=== VERIFIED LIVE SYSTEM FACTS (GROUND TRUTH) ===
1. STORE SPECIFICATIONS:
   - Business Name: JARVIS Auto Supply
   - Location / Address: Sayre National Highway, Poblacion, Valencia City, 8709 Bukidnon, Philippines (Near City Mall Valencia & Public Market area)
   - Store Operating Hours: Monday to Saturday: 8:00 AM – 5:00 PM (Closed on Sundays, on-call arrangements available)
   - Official Hotline: 0917-307-9499
2. PRODUCTS IN STOCK:
   - Batteries: Motolite (Gold, Enduro, Excel), GS Yuasa, Amaron (FREE battery charging & computerized health diagnostic test)
   - Lubricants & Oils: Shell Rimula, Castrol Magnatec/GTX, Mobil, Pertua, Caltex Delo (Gasoline & Diesel)
   - Parts & Maintenance: Bendix brake pads, oil filters, air filters, Denso/NGK spark plugs, wiper blades, coolants, tires
3. WORKSHOP SERVICES:
   - Express Change Oil, Computerized Battery Health Diagnostics (FREE), Brake Cleaning & Pad Replacement, Tire Mounting & Balancing, Preventive Maintenance Service (PMS), Engine Tune-Up.
4. PAYMENT OPTIONS:
   - Cash at counter, GCash, Maya QR, Bank Transfer (BDO, BPI, Landbank), Charge Account credit line for approved registered accounts.
5. CURRENT LIVE WEATHER:
${weatherContext}
6. SENDER DATABASE CONTEXT:
${customerContext}
7. APPOINTMENT CONTEXT:
${appointmentContext}

=== INSTRUCTIONS & CONVERSATIONAL GUIDELINES ===
- Answer the user's message accurately, helpfully, and conversationally.
- Match the customer's language (Natural English, Tagalog/Filipino, or Bisaya/Cebuano).
- Keep SMS responses concise, polite, and directly answering their question (ideally 1 to 3 short sentences, under 280 characters).
- If they ask about weather, use the live weather facts provided above.
- If they ask about their balance, use their exact verified charge balance.
- If they are unregistered and ask for account balance, politely inform them their number is not yet linked.
- Do NOT make up false store addresses, phone numbers, or inventory.`;

    // 1. Try Google Gemini API
    if (geminiKey) {
      try {
        const model = config.geminiModel || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [{ text: text }]
              }
            ],
            systemInstruction: {
              parts: [{ text: systemPrompt }]
            },
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 300
            }
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          const candidateText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText && candidateText.trim()) {
            return {
              intent: 'AI_GEMINI_REPLY',
              thought: `LLM reasoning via Google Gemini (${model}) with live database grounding (Customer: ${customer ? customer.name : 'Unregistered'}, Weather: ${weather?.city || 'Valencia City'}). Generated grounded natural response.`,
              replyText: candidateText.trim()
            };
          }
        }
      } catch (geminiErr) {
        console.warn('[SmartAutoReply] Gemini LLM invocation warn:', geminiErr.message);
      }
    }

    // 2. Try OpenAI API
    if (openaiKey) {
      try {
        const url = 'https://api.openai.com/v1/chat/completions';
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`
          },
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify({
            model: config.openaiModel || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text }
            ],
            temperature: 0.3,
            max_tokens: 250
          })
        });

        if (response.ok) {
          const resJson = await response.json();
          const candidateText = resJson?.choices?.[0]?.message?.content;
          if (candidateText && candidateText.trim()) {
            return {
              intent: 'AI_OPENAI_REPLY',
              thought: `LLM reasoning via OpenAI with live database grounding. Generated grounded natural response.`,
              replyText: candidateText.trim()
            };
          }
        }
      } catch (openaiErr) {
        console.warn('[SmartAutoReply] OpenAI invocation warn:', openaiErr.message);
      }
    }

    return null;
  }

  /**
   * 🧠 AI / NATURAL LANGUAGE CHATBOT & INTENT ANALYZER
   * Comprehensively analyzes the user query, recognizes intents, queries system databases & live APIs, and formulates human-like responses.
   */
  async analyzeChatAndThought({ text, customer, appointment, cleanPhone, config }) {
    const raw = String(text || '').trim();
    const lower = raw.toLowerCase();

    // Pre-fetch live weather
    let liveWeather = null;
    const isWeather = /\b(weather|panahon|ulan|rain|raining|init|sunny|bagyo|storm|forecast|temp|temperature|init ba|ulan ba|weather today|weather forecast|kumusta ang panahon|karon ang panahon)\b/i.test(lower);
    if (isWeather || config.geminiApiKey || config.openaiApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
      liveWeather = await this.fetchLiveWeather(raw);
    }

    // ─── 🚀 0. HYBRID LLM GENERATION (if API Key provided) ─────────────────
    if (config.geminiApiKey || config.openaiApiKey || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY) {
      const llmResult = await this.generateLLMReply({
        text: raw,
        customer,
        appointment,
        weather: liveWeather,
        cleanPhone,
        config
      });

      if (llmResult && llmResult.replyText) {
        return llmResult;
      }
    }

    // ─── Multilingual Keyword & Intent Matchers (English, Tagalog/Filipino, Bisaya/Cebuano) ───

    // 2. Store Location / Address / Directions / Asa dapit
    const isLocation = /\b(location|located|address|saan|san|asa|dapit|direksyon|direction|directions|landmark|landmarks|map|mapa|asa inyo|asan kayo|saan kayo|pwesto|tindahan|branch|office|bldg|building|where is)\b/i.test(lower) && !isWeather;

    // 3. Store Hours / Operating Schedule / Open or Closed
    const isHours = /\b(hours|hour|schedule|oras|abli|open|close|sirado|sarado|bukas|closing|opening|sched|time|sunday|linggo|open pa|kailan bukas|operating hours|business hours)\b/i.test(lower) && !isLocation && !isWeather;

    // 4. Auto Parts & Supplies / Inventory / Brands / Pricing
    const isParts = /\b(battery|baterya|parts|spare|pisa|tires|tire|gulong|oil|change oil|langis|brake|breaks|pads|filter|filters|spark plug|shock|absorber|wipers|coolant|fluid|motolite|shell|castrol|bendix|denso|bosch|price|presyo|tagpila|magkano|in stock|available|avail|stock|order)\b/i.test(lower) && !isWeather;

    // 5. Services & Mechanical Labor / PMS / Repairs
    const isServices = /\b(service|services|repair|labor|tune up|tuneup|checkup|alignment|vulcanizing|inspection|maintenance|pms|serbisyo|ayusin|mekaniko|mechanic|diagnose|diagnostic|palit|cleaning)\b/i.test(lower) && !isParts;

    // 6. Payment Methods & Terms
    const isPayment = /\b(payment|pay|bayad|gcash|maya|credit card|debit|bank|transfer|check|terms|term|installment|cash only|payment method|payment options|unsaon pagbayad|paano magbayad)\b/i.test(lower);

    // 7. Customer Balance & Billing Account
    const isBalance = /\b(balance|bal|bill|bills|due|utang|soa|statement|singil|singilin|bayaran|outstanding|charge account|credit limit)\b/i.test(lower) || lower === 'bal' || lower === 'b';

    // 8. Appointment & Booking Inquiry
    const isAppointment = /\b(appointment|appt|booking|book|sched|schedule|petsa|kelan|kailan|slot|reserba|reserve)\b/i.test(lower) && !isHours;

    // 9. Bot Identity / About JARVIS / Capabilities
    const isBotInfo = /\b(who are you|sino ka|kinsa ka|what is jarvis|what can you do|unsa imo mabuhat|ano kaya mo gawin|help|menu|commands|options|bot|features)\b/i.test(lower);

    // 10. Gratitude, Confirmations & Polite Chit-Chat
    const isGratitude = /\b(salamat|thanks|thank you|daghang salamat|maraming salamat|tnx|ty|thank u)\b/i.test(lower);
    const isConfirmation = /\b(yes|oo|opo|confirm|ok|okay|sige|noted|cge|copy|noted po|roger)\b/i.test(lower) && raw.length <= 15;
    const isJoke = /\b(joke|katawa|patawa|jokes|funny)\b/i.test(lower);
    const isGreeting = /\b(hi|hello|hey|good morning|good afternoon|good evening|good day|magandang araw|kamusta|musta|maayong buntag|maayong hapon|maayong adlaw|hoi|uy)\b/i.test(lower);

    let thought = '';
    let intent = 'GENERAL_CHATBOT_REPLY';
    let reply = '';

    const customerPrefix = customer ? `Hi ${customer.name}! ` : 'Greetings from JARVIS! ';

    // ─── 🌤️ 1. WEATHER QUERY (Live Real-Time Data) ───────────────────────────
    if (isWeather) {
      intent = 'WEATHER_QUERY';
      const weather = liveWeather || await this.fetchLiveWeather(raw);
      
      thought = `User asked for weather information ("${raw}"). Fetched live telemetry from Open-Meteo API for ${weather.city}: Current temp is ${weather.temp}°C (${weather.condition}) with ${weather.humidity}% humidity and ${weather.precipitation}mm rain. Generating real-time weather bulletin with automotive road advice.`;

      reply = `${customerPrefix}Current Weather in ${weather.city}:\n` +
              `🌡️ Temperature: ${weather.temp}°C (Feels like ${weather.apparentTemp}°C)\n` +
              `☁️ Sky Condition: ${weather.condition}\n` +
              `💧 Humidity: ${weather.humidity}%\n` +
              `🚗 Road Tip: ${weather.advice}`;
    }

    // ─── 📍 2. STORE LOCATION & DIRECTIONS ──────────────────────────────────
    else if (isLocation) {
      intent = 'STORE_LOCATION_QUERY';
      thought = `User is asking for store address / location / directions ("${raw}"). Providing full location specs: Sayre National Highway, Valencia City, Bukidnon, landmark reference, and contact hotline.`;

      reply = `${customerPrefix}JARVIS Auto Supply is located at Sayre National Highway, Poblacion, Valencia City, 8709 Bukidnon (near City Mall Valencia & Public Market area).\n` +
              `📍 Map & Landmarks: Along the main national highway.\n` +
              `🕒 Hours: Mon-Sat 8:00 AM - 5:00 PM\n` +
              `📞 Hotline: 0917-307-9499. You are always welcome to visit us!`;
    }

    // ─── 🕒 3. STORE OPERATING HOURS & SCHEDULE ─────────────────────────────
    else if (isHours) {
      intent = 'STORE_HOURS_QUERY';
      thought = `User is asking about operating hours or open/close schedule ("${raw}"). Formatting standard store business schedule.`;

      reply = `${customerPrefix}Our store hours at JARVIS Auto Supply are:\n` +
              `• Monday to Saturday: 8:00 AM – 5:00 PM (Open)\n` +
              `• Sunday: Closed (Special on-call deliveries by arrangement)\n` +
              `Feel free to visit us during business hours or call 0917-307-9499 for urgent parts inquiries.`;
    }

    // ─── 📦 4. AUTO PARTS, BATTERIES & INVENTORY INQUIRY ───────────────────
    else if (isParts) {
      intent = 'PARTS_INVENTORY_QUERY';
      thought = `User inquired about auto parts, batteries, tires, oils, or inventory availability ("${raw}"). Highlighting genuine brands in stock (Motolite, Shell Rimula, Castrol, Bendix, Denso) and inviting them for direct item quote.`;

      reply = `${customerPrefix}We carry 100% genuine auto parts & supplies in stock at JARVIS Auto Supply:\n` +
              `🔋 Batteries: Motolite (Gold, Enduro, Excel), GS Yuasa (Free testing & install)\n` +
              `🛢️ Oils & Lubes: Shell Rimula, Castrol, Mobil, Pertua, Delo\n` +
              `🛑 Brakes & Filters: Bendix brake pads, oil/air filters, Denso spark plugs\n` +
              `Reply with your car model & specific part needed or visit our parts counter for instant pricing!`;
    }

    // ─── 🔧 5. SERVICES & MECHANICAL LABOR ─────────────────────────────────
    else if (isServices) {
      intent = 'SERVICES_OFFERED_QUERY';
      thought = `User asked about automotive mechanical services, change oil, PMS, or labor ("${raw}"). Outlining certified workshop services.`;

      reply = `${customerPrefix}JARVIS Auto Supply offers professional automotive services:\n` +
              `✅ Express Change Oil & Lube Service\n` +
              `✅ Computerized Battery Health & Alternator Test (FREE)\n` +
              `✅ Brake Cleaning, Pad Replacement & Rotor Care\n` +
              `✅ Tire Mounting, Wheel Balancing & Vulcanizing\n` +
              `✅ Preventive Maintenance Service (PMS) & Tune-Up\n` +
              `Visit our service bay or reply APPT to schedule a service slot!`;
    }

    // ─── 💳 6. PAYMENT METHODS & ACCEPTED MODES ─────────────────────────────
    else if (isPayment) {
      intent = 'PAYMENT_METHODS_QUERY';
      thought = `User is asking about payment options / GCash / terms ("${raw}"). Providing list of supported payment channels.`;

      reply = `${customerPrefix}We accept multiple convenient payment options at JARVIS Auto Supply:\n` +
              `💵 Cash at Counter\n` +
              `📱 GCash & Maya QR Transfer\n` +
              `🏦 Bank Transfer (BDO / BPI / Landbank)\n` +
              `📝 Charge Account Terms (for approved registered commercial clients)\n` +
              `All transactions are issued official receipts/sales invoices.`;
    }

    // ─── 💰 7. BALANCE & BILLING INQUIRY (Personalized Database Check) ──────
    else if (isBalance) {
      if (customer) {
        intent = 'BALANCE_QUERY';
        thought = `Registered customer "${customer.name}" (#${customer.accountId}) requested their charge balance ("${raw}"). Verified active database record: Unpaid balance is PHP ${customer.balance} (Credit Limit: PHP ${customer.creditLimit}). Formatting billing statement.`;

        reply = `Hello ${customer.name}! As of today, your JARVIS charge account (#${customer.accountId}) current balance is PHP ${customer.balance} (Credit Limit: PHP ${customer.creditLimit}). Total Orders: ${customer.totalInvoices}. Thank you for doing business with us!`;
      } else {
        intent = 'UNREGISTERED_BALANCE_REQUEST';
        thought = `Caller at ${cleanPhone} inquired for charge balance, but their phone number is NOT registered in tablechargeaccount. Explaining registration procedure.`;

        reply = `Greetings from JARVIS! We received your balance inquiry, but your phone number (${cleanPhone}) is not yet registered in our customer records. Please visit our office at Sayre Highway, Valencia City or contact 0917-307-9499 to link your account.`;
      }
    }

    // ─── 📅 8. APPOINTMENT & SCHEDULING INQUIRY ────────────────────────────
    else if (isAppointment) {
      if (customer) {
        intent = 'APPOINTMENT_QUERY';
        if (appointment) {
          thought = `Registered customer "${customer.name}" asked about appointment. Found confirmed record on ${appointment.date} at ${appointment.time} for "${appointment.serviceType}".`;

          reply = `Hello ${customer.name}! You have a confirmed appointment for "${appointment.serviceType}" on ${appointment.date} at ${appointment.time}. Please arrive 10 minutes early at our service bay. See you!`;
        } else {
          thought = `Registered customer "${customer.name}" inquired for appointments, but has no pending slots. Inviting them to schedule.`;

          reply = `Hello ${customer.name}! You currently have no pending appointment scheduled with JARVIS. Reply with your preferred date, time, and service to book a slot.`;
        }
      } else {
        intent = 'UNREGISTERED_APPOINTMENT_REQUEST';
        thought = `Unregistered caller at ${cleanPhone} asked for appointment. Providing appointment desk instructions.`;

        reply = `Greetings from JARVIS! Your number (${cleanPhone}) is not yet registered. To book a service appointment, please reply with your Full Name, Car Model, and Preferred Date.`;
      }
    }

    // ─── 🤖 9. BOT IDENTITY & CAPABILITIES ──────────────────────────────────
    else if (isBotInfo) {
      intent = 'BOT_IDENTITY_QUERY';
      thought = `User asked about bot identity, capabilities, or help menu ("${raw}"). Explaining JARVIS AI assistant features.`;

      reply = `I am JARVIS AI Assistant for JARVIS Auto Supply! 🤖\n` +
              `Here is what I can help you with:\n` +
              `• 🌤️ Weather: "What is the weather today?"\n` +
              `• 📍 Location: "Where is JARVIS located?"\n` +
              `• 🕒 Hours: "What time do you open/close?"\n` +
              `• 🔋 Products: "Do you have batteries / oil in stock?"\n` +
              `• 🔧 Services: "What services do you offer?"\n` +
              `• 💰 Balance: "Check my balance"\n` +
              `• 📅 Appointments: "Check my appointment"`;
    }

    // ─── 😄 10. JOKES / CHIT-CHAT ──────────────────────────────────────────
    else if (isJoke) {
      intent = 'JOKE_CHITCHAT';
      const jokes = [
        "Why did the car get a flat tire? Because there was a fork in the road! 😄 Need genuine tires or tire repair? JARVIS has you covered!",
        "What kind of car does an egg drive? A Yolkswagen! 🥚🚗 Safe driving from JARVIS Auto Supply!",
        "Why did the battery go to school? To get recharged! 🔋 Visit JARVIS for free computerized battery health tests anytime!"
      ];
      const selectedJoke = jokes[Math.floor(Math.random() * jokes.length)];
      thought = `User asked for a joke or playful chit-chat ("${raw}"). Responding with a friendly automotive joke.`;

      reply = `${customerPrefix}${selectedJoke}`;
    }

    // ─── 🙏 11. GRATITUDE & CONFIRMATIONS ───────────────────────────────────
    else if (isGratitude || isConfirmation) {
      intent = isGratitude ? 'GRATITUDE_RECEIVED' : 'CONFIRMATION_RECEIVED';
      thought = `User sent polite confirmation/gratitude ("${raw}"). Acknowledging warmly.`;

      if (customer) {
        reply = `You're always welcome, ${customer.name}! Thank you for trusting JARVIS Auto Supply. Have a wonderful and safe day!`;
      } else {
        reply = `You're very welcome! Thank you for contacting JARVIS Auto Supply. Feel free to message us anytime you need auto parts, service, or assistance.`;
      }
    }

    // ─── 👋 12. GREETINGS (Customer vs Unregistered) ────────────────────────
    else if (isGreeting) {
      if (customer) {
        intent = 'CUSTOMER_GREETING';
        thought = `Verified customer "${customer.name}" (#${customer.accountId}) sent greeting ("${raw}"). Sending personalized greeting with quick account menu.`;

        reply = config.customerFoundTemplate || `Hello ${customer.name}! Thank you for reaching JARVIS Auto Supply. Your customer account (#${customer.accountId}) is active. Reply BALANCE for charge balance, APPT for appointments, or ask about location, weather, and parts!`;
        reply = reply
          .replace(/\{\{name\}\}/gi, customer.name)
          .replace(/\{\{accountId\}\}/gi, String(customer.accountId))
          .replace(/\{\{balance\}\}/gi, customer.balance)
          .replace(/\{\{address\}\}/gi, customer.address);
      } else {
        intent = 'UNREGISTERED_GREETING';
        thought = `Unregistered caller at ${cleanPhone} sent greeting ("${raw}"). Replying with welcoming greeting & service overview.`;

        reply = `Hello! Welcome to JARVIS Auto Supply (Valencia City, Bukidnon). We offer genuine auto parts, batteries, oils, and automotive maintenance. How can we assist you today? You can ask about our location, services, parts, or weather updates!`;
      }
    }

    // ─── ❓ 13. FALLBACK / INTELLIGENT GENERAL QUERY ─────────────────────────
    else {
      if (customer) {
        intent = 'CUSTOMER_GENERAL_QUERY';
        thought = `Customer "${customer.name}" (#${customer.accountId}) sent message: "${raw}". Providing contextual assistance with account ID, options to check balance, appointments, store location, parts, or weather.`;

        reply = `Hello ${customer.name}! Thank you for messaging JARVIS Auto Supply. How may we assist you today? You can text BALANCE to check your charge account, APPT for scheduled services, or ask about store location, parts availability, and today's weather!`;
      } else {
        intent = 'UNREGISTERED_GENERAL_INQUIRY';
        thought = `Unregistered sender at ${cleanPhone} sent: "${raw}". Providing helpful overview of JARVIS Auto Supply features, location, and contact hotline.`;

        reply = `Greetings from JARVIS Auto Supply! We are located at Sayre Highway, Valencia City, Bukidnon (Mon-Sat 8AM-5PM). We provide genuine auto parts, batteries, lubricants, and vehicle maintenance. Feel free to ask about our location, store hours, available parts, or call 0917-307-9499!`;
      }
    }

    return {
      intent,
      thought,
      replyText: reply.trim()
    };
  }

  /**
   * Main entry point: Processes inbound message with smart thought analysis and dispatches reply.
   */
  async processInboundMessage({ from, message, line = 1, autoSend = true }) {
    const config = db.getAutoReplyConfig();
    const cleanPhone = String(from || '').trim();
    const text = String(message || '').trim();

    // 1. Context retrieval from database
    const customer = await this.findCustomerByPhone(cleanPhone);
    const appointment = this.findAppointment(cleanPhone, customer?.name);

    // 2. 🧠 Smart Thought & Chatbot Analysis
    const { intent, thought, replyText } = await this.analyzeChatAndThought({
      text,
      customer,
      appointment,
      cleanPhone,
      config
    });

    let dispatchResult = null;

    // 3. Automated cellular dispatch if enabled
    if (config.enabled && autoSend && replyText) {
      try {
        const sendRes = await goipDriver.sendSms(line, cleanPhone, replyText);
        dispatchResult = {
          dispatched: true,
          status: 'SENT',
          timestamp: new Date().toISOString(),
          details: sendRes
        };

        // Record transmission in history logs
        db.addMessage({
          line,
          recipient: cleanPhone,
          name: customer ? customer.name : 'Unregistered Caller',
          message: replyText,
          status: 'SENT',
          type: 'SMART_AUTO_REPLY'
        });
      } catch (err) {
        console.error('[SmartAutoReply Dispatch Error]', err.message);
        dispatchResult = {
          dispatched: false,
          status: 'FAILED',
          error: err.message
        };
      }
    }

    return {
      autoReplyEnabled: config.enabled,
      customerFound: !!customer,
      customer: customer || null,
      appointment: appointment || null,
      intent,
      thought,
      reasoning: thought,
      replyText,
      dispatchResult
    };
  }
}

module.exports = new SmartAutoReplyEngine();

