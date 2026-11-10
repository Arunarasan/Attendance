import { useEffect, useState } from 'react'

export type Lang = 'en' | 'ta' | 'hi'
export const LANGS: [Lang, string][] = [['en', 'English'], ['ta', 'தமிழ்'], ['hi', 'हिन्दी']]

const KEY = 'attendance.lang'
const EVT = 'lang-change'

export function getLang(): Lang {
  try { const v = localStorage.getItem(KEY); if (v === 'ta' || v === 'hi' || v === 'en') return v } catch { /* storage unavailable */ }
  return 'en'
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
  appName: 'App', version: 'Version',
  honourScore: 'Honour score', noScoreYet: 'No score yet this month', lossOfPay: 'Loss of pay', allowances: 'Allowances', bonus: 'Bonus', netPay: 'Net pay',
  textSize: 'Text size', small: 'Small', normal: 'Normal', large: 'Large',
  permissions: 'Permissions', camera: 'Camera', location: 'Location', granted: 'Allowed', denied: 'Blocked', notAsked: 'Not asked yet', unknown: 'Unknown', allow: 'Allow',
  permHelp: 'If blocked, open your phone Settings, Apps, AttendancePro, Permissions.',
  account: 'Account', changePassword: 'Change password', currentPassword: 'Current password', newPassword: 'New password (8+ characters)', confirmPassword: 'Confirm new password',
  save: 'Save', passwordChanged: 'Password changed', passwordsDontMatch: 'The new passwords do not match',
  aboutApp: 'About', company: 'Company', developedBy: 'Developed by', contact: 'Contact',
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
  appName: 'செயலி', version: 'பதிப்பு',
  honourScore: 'கௌரவ மதிப்பெண்', noScoreYet: 'இந்த மாதம் இன்னும் மதிப்பெண் இல்லை', lossOfPay: 'சம்பள இழப்பு', allowances: 'படிகள்', bonus: 'போனஸ்', netPay: 'நிகர சம்பளம்',
  textSize: 'எழுத்து அளவு', small: 'சிறியது', normal: 'சாதாரணம்', large: 'பெரியது',
  permissions: 'அனுமதிகள்', camera: 'கேமரா', location: 'இருப்பிடம்', granted: 'அனுமதிக்கப்பட்டது', denied: 'தடுக்கப்பட்டது', notAsked: 'இன்னும் கேட்கப்படவில்லை', unknown: 'தெரியவில்லை', allow: 'அனுமதி',
  permHelp: 'தடுக்கப்பட்டிருந்தால் தொலைபேசி அமைப்புகள் > செயலிகள் > AttendancePro > அனுமதிகள் என்பதைத் திறக்கவும்.',
  account: 'கணக்கு', changePassword: 'கடவுச்சொல் மாற்று', currentPassword: 'தற்போதைய கடவுச்சொல்', newPassword: 'புதிய கடவுச்சொல் (8+ எழுத்துகள்)', confirmPassword: 'புதிய கடவுச்சொல்லை உறுதிப்படுத்து',
  save: 'சேமி', passwordChanged: 'கடவுச்சொல் மாற்றப்பட்டது', passwordsDontMatch: 'புதிய கடவுச்சொற்கள் பொருந்தவில்லை',
  aboutApp: 'பற்றி', company: 'நிறுவனம்', developedBy: 'உருவாக்கியவர்', contact: 'தொடர்புக்கு',
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
  appName: 'ऐप', version: 'संस्करण',
  honourScore: 'ऑनर स्कोर', noScoreYet: 'इस महीने अभी स्कोर नहीं', lossOfPay: 'वेतन कटौती (LOP)', allowances: 'भत्ते', bonus: 'बोनस', netPay: 'शुद्ध वेतन',
  textSize: 'टेक्स्ट आकार', small: 'छोटा', normal: 'सामान्य', large: 'बड़ा',
  permissions: 'अनुमतियाँ', camera: 'कैमरा', location: 'लोकेशन', granted: 'अनुमति है', denied: 'ब्लॉक है', notAsked: 'अभी पूछा नहीं गया', unknown: 'अज्ञात', allow: 'अनुमति दें',
  permHelp: 'ब्लॉक होने पर फ़ोन सेटिंग्स > ऐप्स > AttendancePro > अनुमतियाँ खोलें।',
  account: 'खाता', changePassword: 'पासवर्ड बदलें', currentPassword: 'मौजूदा पासवर्ड', newPassword: 'नया पासवर्ड (8+ अक्षर)', confirmPassword: 'नया पासवर्ड दोहराएँ',
  save: 'सहेजें', passwordChanged: 'पासवर्ड बदल दिया गया', passwordsDontMatch: 'नए पासवर्ड मेल नहीं खाते',
  aboutApp: 'जानकारी', company: 'कंपनी', developedBy: 'विकसित करने वाले', contact: 'संपर्क',
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
