/* תחקיר — all UI text in one place.
 *
 * The app is Hebrew, right to left. Anything the pilot reads lives here so
 * wording changes never mean hunting through the screens. Question labels are
 * NOT here: he owns those and edits them inside the app.
 */
(function (g) {
  'use strict';

  g.T = {
    app: 'תחקיר',

    // navigation
    navHome: 'בית',
    navLog: 'תחקירים',
    navPatterns: 'מגמות',
    navSettings: 'הגדרות',

    // home
    greetingReady: 'מוכן לטיסה.',
    greetingFirst: 'התחקיר הראשון.',
    newDebrief: 'תחקיר חדש',
    nextFlight: 'הטיסה הבאה',
    goalsForNextFlight: 'יעדים לטיסה הבאה',
    noGoalsYet: 'אין יעדים לטיסה הבאה',
    noGoalsHint: 'יעדים שתגדיר בסוף התחקיר יופיעו כאן לפני הטיסה הבאה.',
    addGoal: 'הוספת יעד',
    carriedOver: 'מטיסה קודמת',
    recentDebriefs: 'תחקירים אחרונים',
    viewAll: 'הכל',
    noDebriefs: 'אין עדיין תחקירים',
    noDebriefsHint: 'התחקיר הראשון יופיע כאן. הכל נשמר במכשיר הזה בלבד.',

    // stat tiles
    statHours: 'שעות טיסה',
    statHoursSub: 'טיסות נרשמו',
    statDebriefs: 'תחקירים',
    statGoals: 'יעדים שהושגו',
    statStreak: 'השבוע',
    statFlights: 'טיסות',

    // debrief form
    newDebriefTitle: 'תחקיר חדש',
    editDebriefTitle: 'עריכת תחקיר',
    save: 'שמירה',
    saveChanges: 'שמירת שינויים',
    draftSaved: 'טיוטה נשמרה',
    draftSaving: 'הטיוטה נשמרת תוך כדי כתיבה',
    yourAnswer: 'התשובה שלך',
    goalsThisFlight: 'יעדים לטיסה הזו',
    goalsThisFlightHint: 'סמן ✓ אם עמדת ביעד, ✗ אם לא. יעד שלא הושג עובר אוטומטית לטיסה הבאה.',
    goalMet: 'הושג',
    goalMissed: 'לא הושג',

    // log
    logTitle: 'תחקירים',
    search: 'חיפוש בכל התשובות',
    noMatches: 'אין תוצאות',
    noMatchesHint: 'נסה מילה אחרת או נקה את הסינון.',
    all: 'הכל',

    // detail
    debriefOn: 'תחקיר מתאריך',
    copyText: 'העתקה כטקסט',
    deleteDebrief: 'מחיקת התחקיר',
    notAnswered: 'לא נענה',
    shareDebrief: 'שיתוף',
    edit: 'עריכה',

    // patterns
    patternsTitle: 'מגמות',
    patternsEmpty: 'אין עדיין מה להראות',
    patternsEmptyHint: 'אחרי כמה תחקירים יופיע כאן מה חוזר על עצמו.',
    debriefsPerWeek: 'תחקירים לשבוע',
    lastWeeks: '8 השבועות האחרונים',
    goalFollowThrough: 'עמידה ביעדים',
    repeatedGoals: 'יעדים שחוזרים על עצמם',
    readAcross: 'קריאת תשובה אחת לאורך כל התחקירים',
    nothingInField: 'עדיין לא נכתב כאן דבר.',

    // settings
    settingsTitle: 'הגדרות',
    appearance: 'מראה',
    themeDark: 'כהה',
    themeLight: 'בהיר',
    themeAuto: 'אוטומטי',
    questions: 'שאלות התחקיר',
    questionsHint: 'הוספה, שינוי שם, סידור ומחיקה. השינויים חלים על התחקיר הבא.',
    addQuestion: 'הוספת שאלה',
    editQuestion: 'עריכת שאלה',
    questionLabel: 'שם השאלה',
    questionType: 'סוג תשובה',
    questionOptions: 'אפשרויות',
    questionOptionsHint: 'אפשרות אחת בכל שורה',
    systemQuestion: 'שאלת מערכת, אפשר לשנות שם אבל לא למחוק',
    moveUp: 'העלאה',
    moveDown: 'הורדה',
    restoreDefaults: 'שחזור שאלות ברירת המחדל',
    yourData: 'המידע שלך',
    exportCsv: 'ייצוא לגיליון',
    exportCsvSub: 'קובץ CSV',
    exportJson: 'ייצוא גיבוי',
    exportJsonSub: 'קובץ JSON, משחזר הכל',
    importJson: 'שחזור מגיבוי',
    importJsonSub: 'מתמזג עם מה שקיים',
    privacy: 'פרטיות',
    setCode: 'הגדרת קוד כניסה',
    changeCode: 'שינוי קוד הכניסה',
    removeCode: 'ביטול קוד הכניסה',
    codeOn: 'הקוד פעיל',
    codeOff: 'כבוי',
    needsHttps: 'דורש כתובת מאובטחת',
    privacyNote: 'לאפליקציה אין חשבון ואין שרת. שום דבר שנכתב כאן לא יוצא מהמכשיר. ' +
                 'קוד הכניסה מונע ממישהו שמרים את הטלפון לקרוא, אבל הוא לא מצפין את הקובץ.',
    deleteAll: 'מחיקת כל התחקירים',
    cannotUndo: 'לא ניתן לשחזר',
    storageNote: 'עובד גם בלי רשת',
    onThisDevice: 'תחקירים במכשיר הזה',

    // backup nudge
    backupTitle: 'כדאי לגבות.',
    backupNever: 'עוד לא ייצאת גיבוי.',
    backupDays: function (n) { return 'הגיבוי האחרון היה לפני ' + n + ' ימים.'; },
    backupBody: 'הכל קיים רק בטלפון הזה. ייצא קובץ ושמור אותו במקום בטוח.',

    // install
    installTitle: 'הוספה למסך הבית',
    installBody: 'לחץ על כפתור השיתוף ואז "הוסף למסך הבית". האפליקציה תיפתח במסך מלא ותעבוד גם בלי קליטה.',
    gotIt: 'הבנתי',

    // lock
    enterCode: 'הזן את הקוד',
    wrongCode: 'קוד שגוי',
    chooseCode: 'בחר קוד בן 4 ספרות',
    repeatCode: 'הזן שוב',
    codeMismatch: 'הקודים לא תואמים. נסה שוב.',
    codeOnToast: 'קוד הכניסה הופעל',
    codeOffToast: 'קוד הכניסה בוטל',
    codeFailed: 'לא ניתן להגדיר קוד כאן',

    // generic
    cancel: 'ביטול',
    confirm: 'אישור',
    add: 'הוספה',
    remove: 'הסרה',
    delete: 'מחיקה',
    done: 'סיום',
    optional: 'לא חובה',
    today: 'היום',
    yesterday: 'אתמול',
    daysAgo: function (n) { return 'לפני ' + n + ' ימים'; },
    savedToast: 'התחקיר נשמר',
    updatedToast: 'התחקיר עודכן',
    deletedToast: 'נמחק',
    copiedToast: 'הועתק',
    needSomething: 'מלא לפחות שדה אחד לפני שמירה',

    // question types
    typeText: 'שורה אחת',
    typeTextarea: 'טקסט חופשי',
    typeChoice: 'בחירה מרשימה',
    typeNumber: 'מספר',
    typeDate: 'תאריך',
    typeGoals: 'רשימת יעדים',

    // confirms
    confirmDeleteDebrief: function (d) { return 'למחוק את התחקיר מ־' + d + '?'; },
    confirmDeleteBody: 'התחקיר יימחק מהמכשיר הזה. לא ניתן לשחזר.',
    confirmDeleteAll: function (n) { return 'למחוק את כל ' + n + ' התחקירים?'; },
    confirmDeleteAllBody: 'הכל יימחק מהמכשיר. ייצא גיבוי קודם אם יש סיכוי שתרצה את זה בעתיד.',
    confirmDeleteQuestion: function (q) { return 'למחוק את "' + q + '"?'; },
    confirmDeleteQuestionBody: 'השאלה לא תופיע בתחקירים חדשים. תשובות קיימות יישמרו ויוצגו בתחקירים הישנים.',
    confirmCodeOff: 'לבטל את קוד הכניסה?',
    confirmCodeOffBody: 'כל מי שירים את הטלפון יוכל לפתוח את האפליקציה.'
  };
})(window);
