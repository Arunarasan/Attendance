import { useEffect, useState } from 'react'

export type Lang = 'en' | 'ta' | 'hi'
export const LANGS: [Lang, string][] = [['en', 'English'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']]

const KEY = 'attendance.lang'
const EVT = 'lang-change'

/** The company's default language (Settings, Language); used until a person picks their own. */
let companyDefault: Lang = 'en'
const isLang = (v: unknown): v is Lang => v === 'en' || v === 'ta' || v === 'hi'
export function getLang(): Lang {
  try { const v = localStorage.getItem(KEY); if (isLang(v)) return v } catch { /* storage unavailable */ }
  return companyDefault
}
export function hasOwnLang(): boolean {
  try { return isLang(localStorage.getItem(KEY)) } catch { return false }
}
export function setCompanyDefault(l: string) {
  if (isLang(l) && l !== companyDefault) { companyDefault = l; window.dispatchEvent(new Event(EVT)) }
}
/** Asks the server for the company default once, before anyone signs in. */
export function loadCompanyLanguage() {
  fetch('/api/public/config').then(r => (r.ok ? r.json() : null)).then(c => { if (c) setCompanyDefault(c.defaultLanguage) }).catch(() => {})
}
export function setLang(l: Lang) {
  try { localStorage.setItem(KEY, l) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVT))
}

type Dict = Record<string, string>
const en: Dict = {
  morning: 'Good Morning', afternoon: 'Good Afternoon', evening: 'Good Evening', employee: 'Employee',
  home: 'Home', attendance: 'Attendance', leave: 'Leave', profile: 'Profile',
  myAttendance: 'My Attendance', leaveRequest: 'Leave Request', myProfile: 'My Profile', timeCorrection: 'Time Correction',
  timeCorrections: 'Time Corrections', payslips: 'Payslips', myFace: 'My Face', myPhone: 'My Phone', settings: 'Settings', signOut: 'Sign Out',
  todaysAttendance: "Today's Attendance", checkIn: 'Check In', checkOut: 'Check Out', checkInAgain: 'Check In again',
  checkedIn: 'Checked In', checkedOut: 'Checked Out', notCheckedIn: 'Not checked in', onBreak: 'On break',
  startBreak: 'Start break', endBreak: 'End break',
  thisMonth: 'This Month', lastMonth: 'Last Month', custom: 'Custom', viewAll: 'View All',
  present: 'Present', overtime: 'Overtime', attendanceLog: 'Attendance Log',
  language: 'Language', chooseLanguage: 'Choose the app language', appSettings: 'App',
  forgetId: 'Forget saved sign-in ID', idCleared: 'Saved sign-in ID cleared', reloadApp: 'Reload app (get latest version)',
  appName: 'App', version: 'Version', weeklyOff: 'Weekly Off',
  honourScore: 'Honour score', noScoreYet: 'No score yet this month', lossOfPay: 'Loss of pay', allowances: 'Allowances', bonus: 'Bonus', netPay: 'Net pay',
  textSize: 'Text size', small: 'Small', normal: 'Normal', large: 'Large',
  permissions: 'Permissions', camera: 'Camera', location: 'Location', granted: 'Allowed', denied: 'Blocked', notAsked: 'Not asked yet', unknown: 'Unknown', allow: 'Allow',
  permHelp: 'If blocked, open your phone Settings, Apps, Arudra Attender, Permissions.',
  account: 'Account', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password (8+ characters)', confirmPassword: 'Confirm new password',
  save: 'Save', passwordChanged: 'Password changed', passwordsDontMatch: 'The new passwords do not match',
  aboutApp: 'About', company: 'Company', developedBy: 'Developed by', contact: 'Contact',
  h_dashboard: 'Dashboard', h_employees: 'Employees', h_attendance: 'Attendance', h_leaveHol: 'Leave & Holidays', h_approvals: 'Approvals',
  h_locations: 'Locations', h_devices: 'Devices / Kiosks', h_payroll: 'Payroll', h_settings: 'Settings',
  h_adminPortal: 'Admin Portal', h_hrPortal: 'HR Portal', h_admin: 'Admin', h_hr: 'HR',
  h_overview: "Here's your organization overview for today.", h_manage: 'Manage this section for your organization.',
  h_totalEmp: 'Total Employees', h_allActive: 'All active', h_inactive: 'inactive', h_presentToday: 'Present Today', h_attPct: 'Attendance',
  h_onLeave: 'On Leave', h_ofEmp: 'of Employees', h_pendingAppr: 'Pending Approvals', h_needsAction: 'Needs your action',
  h_attTrend: 'Attendance Trend', h_last6: 'Last 6 days', h_todaysAtt: "Today's Attendance", h_absent: 'Absent',
  h_quick: 'Quick Actions', h_manageAll: 'Manage All', h_addEmp: 'Add Employee', h_markAtt: 'Mark Attendance', h_approveReq: 'Approve Requests',
  h_addLeave: 'Add Leave', h_holiday: 'Holiday', h_genReport: 'Generate Report',
  h_tabRegister: 'Register', h_tabCorrections: 'Corrections', h_tabLeave: 'Leave', h_tabHolidays: 'Holidays', h_tabToApprove: 'To approve',
  h_tabPhoto: 'Photo requests', h_tabWeekly: 'Weekly off', h_tabLocations: 'Locations', h_tabWifi: 'WiFi', h_tabPhones: 'Phones', h_tabKiosks: 'Kiosks',
  h_tabPayroll: 'Payroll', h_tabLop: 'Loss of pay review', h_tabScores: 'Honour scores', h_tabPaySettings: 'Pay settings',
  h_tabGeneral: 'General settings', h_tabAppInfo: 'App info', h_tabLanguage: 'Language',
  h_langScreenT: 'Screen language', h_langScreenD: 'The language of this admin console, on this device only.',
  h_langDefaultT: 'Default language for employees', h_langDefaultD: 'Employees who have not chosen a language see this one. Each employee can still change it in their own app.',
  h_saved: 'Saved', h_save: 'Save', h_saving: 'Saving…',
  pc_title: 'A check did not pass', pc_titleBlocked: "This punch can't be recorded",
  pc_intro: 'Fix it and try again, or send it to HR for approval. HR only sees it if you send it.', pc_introBlocked: 'Fix the problem and try again, or ask HR for help.',
  pc_retry: 'Fix and try again', pc_send: 'Send to HR for approval', pc_sending: 'Sending…', pc_cancel: 'Cancel',
  pc_noteLabel: 'Reason for HR (required)', pc_notePh: 'e.g. Visiting a client site', pc_noteNeeded: 'Please add a short reason', pc_sent: 'Sent to HR. Waiting for approval.',
  pc_LOCATION_OUTSIDE: 'You are outside the office location', pc_LOCATION_OUTSIDE_h: 'Move closer, or turn on precise location, then try again.',
  pc_LOCATION_MISSING: 'Your location is not available', pc_LOCATION_MISSING_h: 'Allow location for this app, then try again.',
  pc_NETWORK: 'You are not on the office WiFi', pc_NETWORK_h: 'Connect to the office WiFi, then try again.',
  pc_FACE_MISMATCH: 'Your face did not match', pc_FACE_MISMATCH_h: 'Look straight at the camera in good light, then try again.',
  pc_FACE_WEAK: 'The face match was weak', pc_FACE_WEAK_h: 'Look straight at the camera in good light, then try again.',
  pc_FACE_NOT_ENROLLED: 'No face is saved for you', pc_FACE_NOT_ENROLLED_h: 'Ask HR to enrol your face. You can still send this to HR.',
  pc_FACE_MISSING: 'The face check was skipped', pc_FACE_MISSING_h: 'Allow the camera and try again.',
  pc_DEVICE: 'This phone could not be checked', pc_DEVICE_h: 'Use the phone you registered, or ask HR.', loading: 'Loading…',
}
const ta: Dict = {
  morning: 'காலை வணக்கம்', afternoon: 'மதிய வணக்கம்', evening: 'மாலை வணக்கம்', employee: 'ஊழியர்',
  home: 'முகப்பு', attendance: 'வருகை', leave: 'விடுப்பு', profile: 'சுயவிவரம்',
  myAttendance: 'என் வருகை', leaveRequest: 'விடுப்பு கோரிக்கை', myProfile: 'என் சுயவிவரம்', timeCorrection: 'நேர திருத்தம்',
  timeCorrections: 'நேர திருத்தங்கள்', payslips: 'சம்பள சீட்டுகள்', myFace: 'என் முகம்', myPhone: 'என் தொலைபேசி', settings: 'அமைப்புகள்', signOut: 'வெளியேறு',
  todaysAttendance: 'இன்றைய வருகை', checkIn: 'வருகை பதிவு', checkOut: 'வெளியேற்ற பதிவு', checkInAgain: 'மீண்டும் வருகை பதிவு',
  checkedIn: 'பதிவு செய்யப்பட்டது', checkedOut: 'வெளியேறினீர்கள்', notCheckedIn: 'இன்னும் பதிவு இல்லை', onBreak: 'இடைவேளையில்',
  startBreak: 'இடைவேளை தொடங்கு', endBreak: 'இடைவேளை முடி',
  thisMonth: 'இந்த மாதம்', lastMonth: 'கடந்த மாதம்', custom: 'தேர்வு', viewAll: 'அனைத்தும்',
  present: 'வருகை', overtime: 'கூடுதல் நேரம்', attendanceLog: 'வருகை பதிவேடு',
  language: 'மொழி', chooseLanguage: 'செயலியின் மொழியைத் தேர்ந்தெடுக்கவும்', appSettings: 'செயலி',
  forgetId: 'சேமித்த உள்நுழைவு ஐடியை நீக்கு', idCleared: 'சேமித்த ஐடி நீக்கப்பட்டது', reloadApp: 'செயலியை மீண்டும் ஏற்று (புதிய பதிப்பு)',
  appName: 'செயலி', version: 'பதிப்பு', weeklyOff: 'வார விடுமுறை',
  honourScore: 'கௌரவ மதிப்பெண்', noScoreYet: 'இந்த மாதம் இன்னும் மதிப்பெண் இல்லை', lossOfPay: 'சம்பள இழப்பு', allowances: 'படிகள்', bonus: 'போனஸ்', netPay: 'நிகர சம்பளம்',
  textSize: 'எழுத்து அளவு', small: 'சிறியது', normal: 'சாதாரணம்', large: 'பெரியது',
  permissions: 'அனுமதிகள்', camera: 'கேமரா', location: 'இருப்பிடம்', granted: 'அனுமதிக்கப்பட்டது', denied: 'தடுக்கப்பட்டது', notAsked: 'இன்னும் கேட்கப்படவில்லை', unknown: 'தெரியவில்லை', allow: 'அனுமதி',
  permHelp: 'தடுக்கப்பட்டிருந்தால் தொலைபேசி அமைப்புகள் > செயலிகள் > Arudra Attender > அனுமதிகள் என்பதைத் திறக்கவும்.',
  account: 'கணக்கு', changePassword: 'கடவுச்சொல் மாற்று', currentPassword: 'தற்போதைய கடவுச்சொல்', newPassword: 'புதிய கடவுச்சொல் (8+ எழுத்துகள்)', confirmPassword: 'புதிய கடவுச்சொல்லை உறுதிப்படுத்து',
  save: 'சேமி', passwordChanged: 'கடவுச்சொல் மாற்றப்பட்டது', passwordsDontMatch: 'புதிய கடவுச்சொற்கள் பொருந்தவில்லை',
  aboutApp: 'பற்றி', company: 'நிறுவனம்', developedBy: 'உருவாக்கியவர்', contact: 'தொடர்புக்கு',
  h_dashboard: 'முகப்பு', h_employees: 'ஊழியர்கள்', h_attendance: 'வருகை', h_leaveHol: 'விடுப்பு & விடுமுறைகள்', h_approvals: 'அனுமதிகள்',
  h_locations: 'இடங்கள்', h_devices: 'சாதனங்கள் / கியோஸ்க்', h_payroll: 'சம்பளப் பட்டியல்', h_settings: 'அமைப்புகள்',
  h_adminPortal: 'நிர்வாக தளம்', h_hrPortal: 'HR தளம்', h_admin: 'நிர்வாகி', h_hr: 'HR',
  h_overview: 'இன்றைய உங்கள் நிறுவனத்தின் சுருக்கம் இதோ.', h_manage: 'உங்கள் நிறுவனத்திற்கான இந்தப் பகுதியை நிர்வகிக்கவும்.',
  h_totalEmp: 'மொத்த ஊழியர்கள்', h_allActive: 'அனைவரும் செயலில்', h_inactive: 'செயலற்றவர்', h_presentToday: 'இன்று வந்தவர்கள்', h_attPct: 'வருகை',
  h_onLeave: 'விடுப்பில்', h_ofEmp: 'ஊழியர்களில்', h_pendingAppr: 'நிலுவை அனுமதிகள்', h_needsAction: 'உங்கள் நடவடிக்கை தேவை',
  h_attTrend: 'வருகைப் போக்கு', h_last6: 'கடந்த 6 நாட்கள்', h_todaysAtt: 'இன்றைய வருகை', h_absent: 'வராதவர்',
  h_quick: 'விரைவுச் செயல்கள்', h_manageAll: 'அனைத்தையும் நிர்வகி', h_addEmp: 'ஊழியரைச் சேர்', h_markAtt: 'வருகை பதிவு', h_approveReq: 'கோரிக்கைகளை அனுமதி',
  h_addLeave: 'விடுப்பு சேர்', h_holiday: 'விடுமுறை', h_genReport: 'அறிக்கை உருவாக்கு',
  h_tabRegister: 'பதிவேடு', h_tabCorrections: 'திருத்தங்கள்', h_tabLeave: 'விடுப்பு', h_tabHolidays: 'விடுமுறைகள்', h_tabToApprove: 'அனுமதிக்க',
  h_tabPhoto: 'புகைப்படக் கோரிக்கைகள்', h_tabWeekly: 'வார விடுமுறை', h_tabLocations: 'இடங்கள்', h_tabWifi: 'வைஃபை', h_tabPhones: 'தொலைபேசிகள்', h_tabKiosks: 'கியோஸ்க்',
  h_tabPayroll: 'சம்பளப் பட்டியல்', h_tabLop: 'சம்பள இழப்பு மதிப்பாய்வு', h_tabScores: 'நற்பெயர் மதிப்பெண்கள்', h_tabPaySettings: 'சம்பள அமைப்புகள்',
  h_tabGeneral: 'பொது அமைப்புகள்', h_tabAppInfo: 'செயலி தகவல்', h_tabLanguage: 'மொழி',
  h_langScreenT: 'திரை மொழி', h_langScreenD: 'இந்தச் சாதனத்தில் மட்டும் இந்த நிர்வாகத் திரையின் மொழி.',
  h_langDefaultT: 'ஊழியர்களுக்கான இயல்பு மொழி', h_langDefaultD: 'மொழியைத் தேர்ந்தெடுக்காத ஊழியர்கள் இதைப் பார்ப்பார்கள். ஒவ்வொரு ஊழியரும் தங்கள் செயலியில் மாற்றிக்கொள்ளலாம்.',
  h_saved: 'சேமிக்கப்பட்டது', h_save: 'சேமி', h_saving: 'சேமிக்கிறது…',
  pc_title: 'ஒரு சரிபார்ப்பு தோல்வியடைந்தது', pc_titleBlocked: 'இந்தப் பதிவைச் சேமிக்க முடியாது',
  pc_intro: 'சரிசெய்து மீண்டும் முயற்சிக்கவும், அல்லது HR அனுமதிக்கு அனுப்பவும். நீங்கள் அனுப்பினால் மட்டுமே HR பார்ப்பார்.', pc_introBlocked: 'சிக்கலைச் சரிசெய்து மீண்டும் முயற்சிக்கவும், அல்லது HR-இடம் உதவி கேளுங்கள்.',
  pc_retry: 'சரிசெய்து மீண்டும் முயற்சி', pc_send: 'HR அனுமதிக்கு அனுப்பு', pc_sending: 'அனுப்புகிறது…', pc_cancel: 'ரத்து செய்',
  pc_noteLabel: 'HR-க்கான காரணம் (அவசியம்)', pc_notePh: 'எ.கா. வாடிக்கையாளர் இடத்திற்குச் சென்றிருந்தேன்', pc_noteNeeded: 'சிறிய காரணத்தைச் சேர்க்கவும்', pc_sent: 'HR-க்கு அனுப்பப்பட்டது. அனுமதிக்காகக் காத்திருக்கிறது.',
  pc_LOCATION_OUTSIDE: 'நீங்கள் அலுவலக இடத்திற்கு வெளியே உள்ளீர்கள்', pc_LOCATION_OUTSIDE_h: 'அருகில் வாருங்கள் அல்லது துல்லியமான இருப்பிடத்தை இயக்கி மீண்டும் முயற்சிக்கவும்.',
  pc_LOCATION_MISSING: 'உங்கள் இருப்பிடம் கிடைக்கவில்லை', pc_LOCATION_MISSING_h: 'இந்தச் செயலிக்கு இருப்பிட அனுமதி அளித்து மீண்டும் முயற்சிக்கவும்.',
  pc_NETWORK: 'நீங்கள் அலுவலக வைஃபையில் இல்லை', pc_NETWORK_h: 'அலுவலக வைஃபையில் இணைந்து மீண்டும் முயற்சிக்கவும்.',
  pc_FACE_MISMATCH: 'உங்கள் முகம் பொருந்தவில்லை', pc_FACE_MISMATCH_h: 'நல்ல வெளிச்சத்தில் கேமராவை நேராகப் பார்த்து மீண்டும் முயற்சிக்கவும்.',
  pc_FACE_WEAK: 'முகப் பொருத்தம் பலவீனமாக உள்ளது', pc_FACE_WEAK_h: 'நல்ல வெளிச்சத்தில் கேமராவை நேராகப் பார்த்து மீண்டும் முயற்சிக்கவும்.',
  pc_FACE_NOT_ENROLLED: 'உங்கள் முகம் பதிவு செய்யப்படவில்லை', pc_FACE_NOT_ENROLLED_h: 'முகத்தைப் பதிவு செய்ய HR-இடம் கேளுங்கள். இதை HR-க்கு அனுப்பவும் முடியும்.',
  pc_FACE_MISSING: 'முகச் சரிபார்ப்பு தவிர்க்கப்பட்டது', pc_FACE_MISSING_h: 'கேமராவை அனுமதித்து மீண்டும் முயற்சிக்கவும்.',
  pc_DEVICE: 'இந்தத் தொலைபேசியைச் சரிபார்க்க முடியவில்லை', pc_DEVICE_h: 'நீங்கள் பதிவு செய்த தொலைபேசியைப் பயன்படுத்தவும், அல்லது HR-இடம் கேளுங்கள்.', loading: 'ஏற்றுகிறது…',
}
const hi: Dict = {
  morning: 'सुप्रभात', afternoon: 'नमस्कार', evening: 'शुभ संध्या', employee: 'कर्मचारी',
  home: 'होम', attendance: 'उपस्थिति', leave: 'छुट्टी', profile: 'प्रोफ़ाइल',
  myAttendance: 'मेरी उपस्थिति', leaveRequest: 'छुट्टी अनुरोध', myProfile: 'मेरी प्रोफ़ाइल', timeCorrection: 'समय सुधार',
  timeCorrections: 'समय सुधार', payslips: 'वेतन पर्ची', myFace: 'मेरा चेहरा', myPhone: 'मेरा फ़ोन', settings: 'सेटिंग्स', signOut: 'साइन आउट',
  todaysAttendance: 'आज की उपस्थिति', checkIn: 'चेक इन', checkOut: 'चेक आउट', checkInAgain: 'फिर से चेक इन',
  checkedIn: 'चेक इन हो गया', checkedOut: 'चेक आउट हो गया', notCheckedIn: 'चेक इन नहीं किया', onBreak: 'ब्रेक पर',
  startBreak: 'ब्रेक शुरू करें', endBreak: 'ब्रेक खत्म करें',
  thisMonth: 'इस महीने', lastMonth: 'पिछला महीना', custom: 'कस्टम', viewAll: 'सभी देखें',
  present: 'उपस्थित', overtime: 'ओवरटाइम', attendanceLog: 'उपस्थिति लॉग',
  language: 'भाषा', chooseLanguage: 'ऐप की भाषा चुनें', appSettings: 'ऐप',
  forgetId: 'सहेजा गया साइन-इन आईडी हटाएं', idCleared: 'सहेजा गया आईडी हटा दिया गया', reloadApp: 'ऐप रीलोड करें (नया संस्करण)',
  appName: 'ऐप', version: 'संस्करण', weeklyOff: 'साप्ताहिक छुट्टी',
  honourScore: 'ऑनर स्कोर', noScoreYet: 'इस महीने अभी स्कोर नहीं', lossOfPay: 'वेतन कटौती (LOP)', allowances: 'भत्ते', bonus: 'बोनस', netPay: 'शुद्ध वेतन',
  textSize: 'टेक्स्ट आकार', small: 'छोटा', normal: 'सामान्य', large: 'बड़ा',
  permissions: 'अनुमतियाँ', camera: 'कैमरा', location: 'लोकेशन', granted: 'अनुमति है', denied: 'ब्लॉक है', notAsked: 'अभी पूछा नहीं गया', unknown: 'अज्ञात', allow: 'अनुमति दें',
  permHelp: 'ब्लॉक होने पर फ़ोन सेटिंग्स > ऐप्स > Arudra Attender > अनुमतियाँ खोलें।',
  account: 'खाता', changePassword: 'पासवर्ड बदलें', currentPassword: 'मौजूदा पासवर्ड', newPassword: 'नया पासवर्ड (8+ अक्षर)', confirmPassword: 'नया पासवर्ड दोहराएँ',
  save: 'सहेजें', passwordChanged: 'पासवर्ड बदल दिया गया', passwordsDontMatch: 'नए पासवर्ड मेल नहीं खाते',
  aboutApp: 'जानकारी', company: 'कंपनी', developedBy: 'विकसित करने वाले', contact: 'संपर्क',
  h_dashboard: 'डैशबोर्ड', h_employees: 'कर्मचारी', h_attendance: 'उपस्थिति', h_leaveHol: 'छुट्टी और अवकाश', h_approvals: 'अनुमोदन',
  h_locations: 'स्थान', h_devices: 'डिवाइस / कियोस्क', h_payroll: 'वेतन', h_settings: 'सेटिंग्स',
  h_adminPortal: 'एडमिन पोर्टल', h_hrPortal: 'HR पोर्टल', h_admin: 'एडमिन', h_hr: 'HR',
  h_overview: 'आज के लिए आपके संगठन का सारांश यह है।', h_manage: 'अपने संगठन के लिए इस अनुभाग को प्रबंधित करें।',
  h_totalEmp: 'कुल कर्मचारी', h_allActive: 'सभी सक्रिय', h_inactive: 'निष्क्रिय', h_presentToday: 'आज उपस्थित', h_attPct: 'उपस्थिति',
  h_onLeave: 'छुट्टी पर', h_ofEmp: 'कर्मचारियों में से', h_pendingAppr: 'लंबित अनुमोदन', h_needsAction: 'आपकी कार्रवाई चाहिए',
  h_attTrend: 'उपस्थिति रुझान', h_last6: 'पिछले 6 दिन', h_todaysAtt: 'आज की उपस्थिति', h_absent: 'अनुपस्थित',
  h_quick: 'त्वरित कार्य', h_manageAll: 'सभी प्रबंधित करें', h_addEmp: 'कर्मचारी जोड़ें', h_markAtt: 'उपस्थिति दर्ज करें', h_approveReq: 'अनुरोध स्वीकृत करें',
  h_addLeave: 'छुट्टी जोड़ें', h_holiday: 'अवकाश', h_genReport: 'रिपोर्ट बनाएँ',
  h_tabRegister: 'रजिस्टर', h_tabCorrections: 'सुधार', h_tabLeave: 'छुट्टी', h_tabHolidays: 'अवकाश', h_tabToApprove: 'स्वीकृति हेतु',
  h_tabPhoto: 'फोटो अनुरोध', h_tabWeekly: 'साप्ताहिक छुट्टी', h_tabLocations: 'स्थान', h_tabWifi: 'वाई-फाई', h_tabPhones: 'फ़ोन', h_tabKiosks: 'कियोस्क',
  h_tabPayroll: 'वेतन', h_tabLop: 'वेतन कटौती समीक्षा', h_tabScores: 'सम्मान स्कोर', h_tabPaySettings: 'वेतन सेटिंग्स',
  h_tabGeneral: 'सामान्य सेटिंग्स', h_tabAppInfo: 'ऐप जानकारी', h_tabLanguage: 'भाषा',
  h_langScreenT: 'स्क्रीन की भाषा', h_langScreenD: 'केवल इस डिवाइस पर इस एडमिन कंसोल की भाषा।',
  h_langDefaultT: 'कर्मचारियों के लिए डिफ़ॉल्ट भाषा', h_langDefaultD: 'जिन कर्मचारियों ने भाषा नहीं चुनी है वे यही देखेंगे। हर कर्मचारी अपने ऐप में इसे बदल सकता है।',
  h_saved: 'सहेजा गया', h_save: 'सहेजें', h_saving: 'सहेज रहे हैं…',
  pc_title: 'एक जाँच पास नहीं हुई', pc_titleBlocked: 'यह पंच दर्ज नहीं हो सकता',
  pc_intro: 'इसे ठीक करके फिर कोशिश करें, या HR की मंज़ूरी के लिए भेजें। HR तभी देखेगा जब आप भेजेंगे।', pc_introBlocked: 'समस्या ठीक करके फिर कोशिश करें, या HR से मदद लें।',
  pc_retry: 'ठीक करके फिर कोशिश करें', pc_send: 'HR की मंज़ूरी के लिए भेजें', pc_sending: 'भेज रहे हैं…', pc_cancel: 'रद्द करें',
  pc_noteLabel: 'HR के लिए कारण (ज़रूरी)', pc_notePh: 'जैसे: क्लाइंट साइट पर था', pc_noteNeeded: 'कृपया छोटा कारण लिखें', pc_sent: 'HR को भेज दिया गया। मंज़ूरी का इंतज़ार है।',
  pc_LOCATION_OUTSIDE: 'आप ऑफ़िस की जगह से बाहर हैं', pc_LOCATION_OUTSIDE_h: 'पास आएँ, या सटीक लोकेशन चालू करके फिर कोशिश करें।',
  pc_LOCATION_MISSING: 'आपकी लोकेशन उपलब्ध नहीं है', pc_LOCATION_MISSING_h: 'इस ऐप को लोकेशन की अनुमति दें, फिर कोशिश करें।',
  pc_NETWORK: 'आप ऑफ़िस के वाई-फ़ाई पर नहीं हैं', pc_NETWORK_h: 'ऑफ़िस के वाई-फ़ाई से जुड़ें, फिर कोशिश करें।',
  pc_FACE_MISMATCH: 'आपका चेहरा मेल नहीं खाया', pc_FACE_MISMATCH_h: 'अच्छी रोशनी में कैमरे की ओर सीधे देखें, फिर कोशिश करें।',
  pc_FACE_WEAK: 'चेहरे का मिलान कमज़ोर था', pc_FACE_WEAK_h: 'अच्छी रोशनी में कैमरे की ओर सीधे देखें, फिर कोशिश करें।',
  pc_FACE_NOT_ENROLLED: 'आपका चेहरा दर्ज नहीं है', pc_FACE_NOT_ENROLLED_h: 'HR से चेहरा दर्ज करवाएँ। आप इसे HR को भेज भी सकते हैं।',
  pc_FACE_MISSING: 'चेहरे की जाँच छोड़ दी गई', pc_FACE_MISSING_h: 'कैमरे की अनुमति दें, फिर कोशिश करें।',
  pc_DEVICE: 'इस फ़ोन की जाँच नहीं हो सकी', pc_DEVICE_h: 'अपना पंजीकृत फ़ोन इस्तेमाल करें, या HR से पूछें।', loading: 'लोड हो रहा है…',
}
const DICTS: Record<Lang, Dict> = { en, ta, hi }

/** Re-renders when the language changes; returns a translate function. Missing keys fall back to English. */
export function useT() {
  const [lang, setL] = useState<Lang>(getLang())
  const [size, setS] = useState<TextSize>(getTextSize())
  useEffect(() => {
    const on = () => { setL(getLang()); setS(getTextSize()) }
    window.addEventListener(EVT, on)
    return () => window.removeEventListener(EVT, on)
  }, [])
  return { lang, size, t: (k: string) => DICTS[lang][k] ?? en[k] ?? k }
}

export type TextSize = 'small' | 'normal' | 'large'
const SIZE_KEY = 'attendance.textSize'
export function getTextSize(): TextSize {
  try { const v = localStorage.getItem(SIZE_KEY); if (v === 'small' || v === 'large') return v } catch { /* storage unavailable */ }
  return 'normal'
}
export function setTextSize(v: TextSize) {
  try { localStorage.setItem(SIZE_KEY, v) } catch { /* storage unavailable */ }
  window.dispatchEvent(new Event(EVT))
}
