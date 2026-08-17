/* ================================================================
   USER/js/i18n.js — Marathi / English for the tenant portal.

   Marathi is the default because most shopkeepers here read it more
   comfortably than English. The choice is remembered on the device,
   so a tenant picks once and never thinks about it again.

   Rules for the Marathi wording:
     - everyday spoken words, not formal/official Marathi
     - no accounting terms; "बाकी" (remaining) not "थकबाकी"
     - short lines that fit a phone without wrapping awkwardly
   ================================================================ */

const LANG_KEY = 'tms_lang';
let currentLang = localStorage.getItem(LANG_KEY) || 'mr';   // Marathi by default

const STRINGS = {
  /* ---- tabs ---- */
  'tab.home':        { mr: 'होम',            en: 'Home' },
  'tab.bills':       { mr: 'माझी बिले',       en: 'My bills' },
  'tab.payments':    { mr: 'भरलेले पैसे',     en: 'I paid' },
  'tab.meter':       { mr: 'मीटर',            en: 'Meter' },

  /* ---- header ---- */
  'hello.morning':   { mr: 'नमस्कार',         en: 'Good morning' },
  'hello.afternoon': { mr: 'नमस्कार',         en: 'Good afternoon' },
  'hello.evening':   { mr: 'नमस्कार',         en: 'Good evening' },
  'action.refresh':  { mr: 'पुन्हा पहा',      en: 'Refresh' },
  'action.more':     { mr: 'आणखी',            en: 'More' },

  /* ---- home: the big number ---- */
  'home.youOwe':     { mr: 'तुम्हाला भरायचे आहे', en: 'You need to pay' },
  'home.allPaid':    { mr: 'सर्व पैसे भरले आहेत', en: "You're all paid up" },
  'home.allPaidSub': { mr: 'सध्या काहीही बाकी नाही. नवीन बिल आल्यावर इथे दिसेल.',
                       en: "Nothing is due right now. We'll show it here when your next bill is ready." },
  'home.payBy':      { mr: 'या तारखेपर्यंत भरा', en: 'Please pay by' },
  'home.today':      { mr: 'आजच भरायचे आहे',  en: "that's today" },
  'home.daysLeft':   { mr: 'दिवस बाकी',       en: 'days left' },
  'home.lateBy':     { mr: 'दिवस उशीर झाला',  en: 'Late by' },
  'home.overdueMsg': { mr: 'ची मुदत संपली आहे. लवकर भरा किंवा ऑफिसला भेटा.',
                       en: 'is overdue. Please pay as soon as you can, or speak to the office.' },
  'home.billsLeft':  { mr: 'बिले बाकी आहेत',  en: 'bills not fully paid' },
  'home.seeWhat':    { mr: 'कशासाठी आहे ते पहा', en: 'See what this is for' },
  'home.howToPay':   { mr: 'पैसे कसे भरायचे',  en: 'How to pay' },

  /* ---- home: pending by type ---- */
  'home.pendingByType': { mr: 'कशाचे किती बाकी', en: 'What you still owe' },
  'home.pendingOf':     { mr: 'पैकी',           en: 'of' },
  'home.paidLabel':     { mr: 'भरले',           en: 'paid' },
  'home.remainingLabel':{ mr: 'बाकी',           en: 'remaining' },

  /* ---- home: shop + meter blocks ---- */
  'home.myShops':    { mr: 'माझी दुकाने',      en: 'My shops' },
  'shop.number':     { mr: 'दुकान क्रमांक',    en: 'Shop number' },
  'shop.complex':    { mr: 'इमारत',            en: 'Complex' },
  'shop.rent':       { mr: 'भाडे',             en: 'Rent' },
  'shop.perMonth':   { mr: 'दर महिना',         en: 'per month' },
  'shop.agreement':      { mr: 'करार',              en: 'Agreement' },
  'shop.agreementStart': { mr: 'करार सुरू झाला',    en: 'Started on' },
  'shop.agreementEnd':   { mr: 'करार संपतो',        en: 'Ends on' },
  'shop.daysRemaining':  { mr: 'उरलेले दिवस',       en: 'Days remaining' },
  'shop.agreementOver':  { mr: 'करार संपला आहे',    en: 'Agreement has ended' },
  'shop.deposit':        { mr: 'अनामत रक्कम',       en: 'Security deposit' },
  'shop.depositNeeded':  { mr: 'एकूण अनामत',        en: 'Deposit needed' },
  'shop.depositPaid':    { mr: 'भरलेली अनामत',      en: 'Deposit paid' },
  'shop.depositLeft':    { mr: 'बाकी अनामत',        en: 'Deposit left' },
  'shop.depositDone':    { mr: 'पूर्ण भरले ✓',      en: 'Fully paid ✓' },
  'meter.number':    { mr: 'मीटर क्रमांक',     en: 'Meter number' },
  'meter.prevReading':{ mr: 'मागील रीडिंग',    en: 'Previous reading' },
  'meter.prevDate':  { mr: 'मागील रीडिंगची तारीख', en: 'Previous reading date' },
  'meter.addReading':{ mr: 'नवीन रीडिंग द्या',  en: 'Add meter reading' },
  'meter.noneYet':   { mr: 'अजून रीडिंग दिलेले नाही', en: 'No reading sent yet' },
  'meter.waiting':   { mr: 'तुमचे रीडिंग ऑफिसकडे तपासणीसाठी आहे',
                       en: 'Your reading is with the office for checking' },
  'meter.noMeter':   { mr: 'या दुकानाला मीटर नाही', en: 'No meter for this shop' },

  /* ---- bills ---- */
  'bills.stillToPay':{ mr: 'एकूण बाकी',        en: 'Still to pay' },
  'bills.allPaid':   { mr: 'सर्व बिले भरली आहेत', en: 'Everything is paid' },
  'bills.toPay':     { mr: 'बाकी',             en: 'To pay' },
  'bills.paid':      { mr: 'भरलेली',           en: 'Paid' },
  'bills.all':       { mr: 'सर्व',             en: 'All' },
  'bills.nothingToPay':{ mr: 'काहीही बाकी नाही', en: 'Nothing to pay' },
  'bills.nothingToPaySub':{ mr: 'सध्या तुमचे कोणतेही बिल बाकी नाही.',
                            en: 'You have no unpaid bills right now.' },
  'bills.nothingHere':{ mr: 'इथे काही नाही',   en: 'Nothing here' },
  'bills.tryOther':  { mr: 'वरचा दुसरा पर्याय निवडा.', en: 'Try another tab above.' },
  'bills.monthTotal':{ mr: 'या महिन्याचे',     en: 'This month' },
  'bills.billed':    { mr: 'एकूण बिल',         en: 'Billed' },
  'bills.stillLeft': { mr: 'बाकी',             en: 'Left' },

  /* ---- bill statuses (plain words) ---- */
  'state.notPaid':   { mr: 'बाकी',             en: 'Not paid' },
  'state.partPaid':  { mr: 'थोडे भरले',        en: 'Part paid' },
  'state.paid':      { mr: 'भरले',             en: 'Paid' },

  /* ---- bill types ---- */
  'type.Rent':        { mr: 'दुकान भाडे',      en: 'Shop rent' },
  'type.Electricity': { mr: 'वीज बिल',         en: 'Electricity' },
  'type.Water':       { mr: 'पाणी बिल',        en: 'Water' },
  'type.Maintenance': { mr: 'देखभाल',          en: 'Maintenance' },
  'type.Penalty':     { mr: 'उशिराचा दंड',     en: 'Late fee' },
  'type.Repair':      { mr: 'दुरुस्ती',        en: 'Repair' },
  'type.Damage':      { mr: 'नुकसान भरपाई',    en: 'Damage' },
  'type.Parking':     { mr: 'पार्किंग',        en: 'Parking' },
  'type.Other':       { mr: 'इतर बिल',         en: 'Bill' },

  /* ---- bill detail ---- */
  'bill.amount':     { mr: 'बिलाची रक्कम',     en: 'Bill amount' },
  'bill.youPaid':    { mr: 'तुम्ही भरले',      en: 'You have paid' },
  'bill.leftToPay':  { mr: 'भरायचे बाकी',      en: 'Left to pay' },
  'bill.date':       { mr: 'बिलाची तारीख',     en: 'Bill date' },
  'bill.dueDate':    { mr: 'भरायची तारीख',     en: 'Pay by' },
  'bill.number':     { mr: 'बिल क्रमांक',      en: 'Bill number' },
  'bill.wasDue':     { mr: 'ही तारीख होती',    en: 'Was due' },
  'bill.fullyPaid':  { mr: 'पूर्ण भरले',       en: 'Fully paid' },
  'bill.paidInFull': { mr: 'पूर्ण भरले',       en: 'paid in full' },
  'bill.stillToPay': { mr: 'भरायचे बाकी',      en: 'still to pay' },
  'bill.alreadyPaid':{ mr: 'भरलेले',           en: 'already paid' },
  'bill.paymentsFor':{ mr: 'या बिलासाठी भरलेले पैसे', en: 'Payments put towards this bill' },
  'bill.lumpHint':   { mr: 'एका वेळी दिलेले पैसे अनेक बिलांना लावले असतील, तर पूर्ण रक्कम "भरलेले पैसे" मध्ये दिसेल.',
                       en: 'If you paid one amount that covered several bills, you\'ll see the full amount under the "I paid" tab.' },

  /* ---- payments ---- */
  'pay.youPaidIn':   { mr: 'या वर्षी भरले',    en: 'You paid in' },
  'pay.youPaid':     { mr: 'तुम्ही भरले',      en: 'You paid' },
  'pay.hint':        { mr: 'खालील प्रत्येक नोंद म्हणजे तुम्ही एका वेळी दिलेले पैसे. कोणत्या बिलांना लावले ते पाहण्यासाठी दाबा.',
                       en: 'Each entry below is one payment you made. Tap it to see which bills it went towards.' },
  'pay.none':        { mr: 'अजून पैसे भरलेले नाहीत', en: 'No payments yet' },
  'pay.noneSub':     { mr: 'ऑफिसने तुमचे पैसे नोंदवल्यावर ते इथे दिसतील.',
                       en: 'Once the office records a payment from you, it will show up here.' },
  'pay.splitAcross': { mr: 'बिलांना लावले — पाहण्यासाठी दाबा', en: 'bills — tap to see' },
  'pay.putTowards':  { mr: 'हे पैसे इथे लावले',  en: 'This payment was put towards' },
  'pay.putTowardsMany':{ mr: 'हे एकदा दिलेले पैसे या बिलांना लावले', en: 'This one payment was put towards these bills' },
  'pay.total':       { mr: 'एकूण',             en: 'Total' },
  'pay.title':       { mr: 'तुमचे पैसे',       en: 'Your payment' },
  'pay.explainSplit':{ mr: 'तुम्ही ही रक्कम एकदाच दिली. ऑफिसने ती जुन्या बिलांपासून वाटून लावली, म्हणून प्रत्येक बिलासमोर लहान रक्कम दिसते.',
                       en: 'You paid this amount once. The office divided it between the bills above, oldest first — that\'s why you may see smaller amounts against each bill.' },
  'pay.recent':      { mr: 'नुकतेच भरलेले पैसे', en: 'What you paid recently' },
  'pay.seeAll':      { mr: 'सर्व पहा',         en: 'See all' },

  /* ---- meter tab ---- */
  'meter.lastConfirmed':{ mr: 'शेवटचे मंजूर रीडिंग', en: 'Last confirmed reading' },
  'meter.sendThisMonth':{ mr: '📷 या महिन्याचे रीडिंग पाठवा', en: "📷 Send this month's reading" },
  'meter.sentTitle':  { mr: 'पाठवले ✓',        en: 'Sent ✓' },
  'meter.sentBody':   { mr: 'ऑफिस तुमचा फोटो तपासत आहे. मंजूर झाल्यावर तुमचे बिल इथे दिसेल.',
                        en: 'The office is checking your photo. Your bill will appear once it\'s confirmed.' },
  'meter.history':    { mr: 'आधी पाठवलेली रीडिंग', en: "What you've sent before" },
  'meter.youSent':    { mr: 'तुम्ही पाठवले',   en: 'You sent' },
  'meter.unitsUsed':  { mr: 'युनिट वापरले',    en: 'units used' },
  'meter.confirmed':  { mr: 'मंजूर',           en: 'Confirmed' },
  'meter.checking':   { mr: 'तपासणी सुरू',     en: 'Being checked' },
  'meter.rejected':   { mr: 'नाकारले',         en: 'Not accepted' },
  'meter.rejectedTitle':{ mr: 'तुमचा मागील फोटो स्वीकारला गेला नाही.', en: "Your last photo wasn't accepted." },
  'meter.rejectedAgain':{ mr: 'कृपया स्पष्ट फोटो काढून पुन्हा पाठवा.',
                          en: 'Please take a clearer photo and send it again.' },
  'meter.sendAgain':  { mr: 'पुन्हा पाठवा',    en: 'Send again' },
  'meter.noMeterTitle':{ mr: 'तुमच्या दुकानाला मीटर नाही', en: 'No meter for your shop' },
  'meter.noMeterSub': { mr: 'तुमच्याकडे वीज मीटर असल्यास ऑफिसला सांगा.',
                        en: 'If you have an electricity submeter, ask the office to add it.' },
  'meter.currentPhoto':{ mr: 'सध्याचा फोटो',    en: 'Current reading' },
  'meter.oldPhoto':   { mr: 'मागील फोटो',      en: 'Previous reading' },
  'meter.photoTitle': { mr: 'मीटर फोटो',       en: 'Meter photo' },
  'meter.date':       { mr: 'तारीख',           en: 'Date' },
  'meter.unit':       { mr: 'युनिट',           en: 'Unit' },
  'meter.pricePerUnit':{ mr: 'प्रति युनिट दर',  en: 'Price/unit' },
  'meter.billTotal':  { mr: 'बिल रक्कम',       en: 'Bill total' },
  'meter.billingPeriod':{ mr: 'बिलिंग कालावधी', en: 'Billing period' },
  'meter.day':        { mr: 'दिवस',            en: 'day' },
  'meter.days':       { mr: 'दिवस',            en: 'days' },
  'meter.viewPhoto':  { mr: 'फोटो पहा',        en: 'View photo' },
  'meter.viewBill':   { mr: 'बिल पहा',         en: 'View bill' },

  /* ---- send reading form ---- */
  'form.lastWas':     { mr: 'तुमचे शेवटचे मंजूर रीडिंग होते',  en: 'Your last confirmed reading was' },
  'form.mustBeHigher':{ mr: 'आजचा आकडा यापेक्षा मोठा असावा.', en: "Today's number should be higher than this." },
  'form.step1':       { mr: 'मीटरचा फोटो काढा',  en: 'Take a photo of the meter' },
  'form.step1Hint':   { mr: 'आकडे स्पष्ट दिसतील असा फोटो काढा — ऑफिस हाच फोटो पाहते.',
                        en: 'Get the numbers in focus — the office reads this photo.' },
  'form.step2':       { mr: 'मीटरवरील आकडा लिहा', en: 'Type the number on the meter' },
  'form.note':        { mr: 'ऑफिसला काही सांगायचे आहे का?', en: 'Anything to tell the office?' },
  'form.optional':    { mr: '(ऐच्छिक)',         en: '(optional)' },
  'form.notePlaceholder':{ mr: 'उदा. शेवटचा आकडा स्पष्ट दिसत नाही', en: 'e.g. the last digit is hard to see' },
  'form.needPhoto':   { mr: 'कृपया मीटरचा फोटो काढा', en: 'Please take a photo of the meter' },
  'form.needNumber':  { mr: 'कृपया मीटरवरील आकडा लिहा', en: 'Please type the number on the meter' },
  'form.tooLow':      { mr: 'हा आकडा तुमच्या मागील मंजूर रीडिंगपेक्षा लहान आहे. पुन्हा तपासा.',
                        en: "That's lower than your last confirmed reading. Please check again." },
  'form.sending':     { mr: 'पाठवत आहे…',      en: 'Sending…' },
  'form.sent':        { mr: 'पाठवले. ऑफिस तुमचा फोटो तपासेल.', en: 'Sent. The office will check your photo.' },

  /* ---- more sheet ---- */
  'more.title':       { mr: 'आणखी',            en: 'More' },
  'more.payNote':     { mr: 'पैसे ऑफिसमध्ये नोंदवले जातात. नोंद झाल्यावर ते "भरलेले पैसे" मध्ये दिसतात.',
                        en: 'Payments are recorded by the office. Once recorded, they appear under the "I paid" tab.' },
  'more.deposit':     { mr: 'अनामत रक्कम',     en: 'Security deposit' },
  'more.depositNeeded':{ mr: 'दुकानासाठी अनामत', en: 'Deposit for your shop' },
  'more.depositPaid': { mr: 'तुम्ही भरले',     en: 'You have paid' },
  'more.depositLeft': { mr: 'बाकी',            en: 'Still to pay' },
  'more.depositDone': { mr: 'पूर्ण भरले ✓',    en: 'Fully paid ✓' },
  'more.status':      { mr: 'स्थिती',          en: 'Status' },
  'more.myDetails':   { mr: 'माझी माहिती',     en: 'My details' },
  'more.name':        { mr: 'नाव',             en: 'Name' },
  'more.mobile':      { mr: 'मोबाईल',          en: 'Mobile' },
  'more.email':       { mr: 'ईमेल',            en: 'Email' },
  'more.agreementEnds':{ mr: 'करार संपतो',     en: 'Agreement ends' },
  'more.readOnly':    { mr: 'काही चुकीचे आहे का? ऑफिस ते दुरुस्त करू शकते.',
                        en: 'Something wrong here? The office can correct it.' },
  'more.statement':   { mr: 'हिशोब',           en: 'Statement' },
  'more.download':    { mr: 'माझा हिशोब उतरवा (PDF)', en: 'Download my statement (PDF)' },
  'more.language':    { mr: 'भाषा',            en: 'Language' },
  'more.signOut':     { mr: 'बाहेर पडा',       en: 'Sign out' },

  /* ---- common ---- */
  'common.close':     { mr: 'बंद करा',         en: 'Close' },
  'common.cancel':    { mr: 'रद्द करा',        en: 'Cancel' },
  'common.send':      { mr: 'पाठवा',           en: 'Send' },
  'common.tryAgain':  { mr: 'पुन्हा प्रयत्न करा', en: 'Try again' },
  'common.loadFail':  { mr: 'तुमची माहिती दाखवता आली नाही', en: "Couldn't load your details" },
  'common.updated':   { mr: 'ताजी माहिती आली', en: 'Updated' },
  'common.noInternet':{ mr: 'सर्व्हरशी संपर्क होत नाही. इंटरनेट तपासा.',
                        en: "Can't reach the server. Please check your internet." },
  'common.agreementEnding':{ mr: 'तुमचा करार संपत आहे', en: 'Your agreement ends on' },
  'common.agreementEnded': { mr: 'तुमचा करार संपला आहे. ऑफिसला भेटा.',
                             en: 'Your agreement has ended. Please speak to the office.' },
};

/* Month names — the built-in en-IN formatter can't do Marathi reliably
   across browsers, so we spell them out. */
const MONTHS = {
  mr: ['जानेवारी','फेब्रुवारी','मार्च','एप्रिल','मे','जून',
       'जुलै','ऑगस्ट','सप्टेंबर','ऑक्टोबर','नोव्हेंबर','डिसेंबर'],
  en: ['January','February','March','April','May','June',
       'July','August','September','October','November','December'],
};
const MONTHS_SHORT = {
  mr: ['जाने','फेब्रु','मार्च','एप्रिल','मे','जून','जुलै','ऑग','सप्टें','ऑक्टो','नोव्हें','डिसें'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
};

/* ---- API ---- */
function t(key, fallback){
  const entry = STRINGS[key];
  if (!entry) return fallback !== undefined ? fallback : key;
  return entry[currentLang] || entry.en || key;
}

function getLang(){ return currentLang; }

function setLang(lang){
  currentLang = (lang === 'en') ? 'en' : 'mr';
  localStorage.setItem(LANG_KEY, currentLang);
  document.documentElement.lang = currentLang;
}

function monthName(dateOrIndex){
  const i = typeof dateOrIndex === 'number' ? dateOrIndex : new Date(dateOrIndex).getMonth();
  return MONTHS[currentLang][i] || MONTHS.en[i];
}

function monthShort(dateOrIndex){
  const i = typeof dateOrIndex === 'number' ? dateOrIndex : new Date(dateOrIndex).getMonth();
  return MONTHS_SHORT[currentLang][i] || MONTHS_SHORT.en[i];
}

/* Bill types come from the backend as free text, so translate what we know
   and show anything unexpected exactly as the office typed it. */
function billTypeLabel(type){
  const key = 'type.' + String(type || '').trim();
  if (STRINGS[key]) return t(key);
  return type || t('type.Other');
}

/* The PDF library only ships Latin fonts, so Devanagari would come out as
   boxes. Statements therefore always use the English labels. */
function billTypeLabelEn(type){
  const entry = STRINGS['type.' + String(type || '').trim()];
  return entry ? entry.en : (type || 'Bill');
}
