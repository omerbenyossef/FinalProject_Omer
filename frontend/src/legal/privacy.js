/* The privacy policy, as data rather than markup.

   It is deliberately not run through the translation table: that table is a
   flat list of short interface strings, and dropping paragraphs of legal text
   into it would be unreadable and impossible to keep aligned between the two
   languages. Each language gets its own document here, side by side, so a
   change to one is visibly a change the other needs too.

   Everything in it describes what the app actually does — the fields in
   models.py, the third parties in push_utils/email_utils/google_auth, and the
   anonymise-rather-than-delete behaviour of _delete_user_account. If any of
   those change, this changes with them. */

export const PRIVACY_UPDATED = "2026-10-25";

export const privacy = {
  he: {
    title: "מדיניות פרטיות",
    updated: "עודכן לאחרונה: 25 באוקטובר 2026",
    intro:
      "Rally היא אפליקציה לניהול ליגות ומשחקים חובבניים בטניס ובפאדל. המסמך הזה מסביר איזה מידע נאסף עליך, למה, מי רואה אותו, וכיצד אפשר להסיר אותו. הוא כתוב בלשון זכר מטעמי נוחות ומתייחס לכל המגדרים.",
    sections: [
      {
        h: "מי אחראי למידע",
        p: [
          "האחראי על המידע הוא עומר בן יוסף, המפעיל את Rally כשירות עצמאי.",
          "לכל שאלה, בקשה לעיון במידע, תיקון או מחיקה — אפשר לפנות לכתובת omerbenyossef77@gmail.com.",
        ],
      },
      {
        h: "איזה מידע נאסף",
        p: ["המידע שנאסף הוא זה שאתה מוסר בעצמך, ומה שנוצר תוך כדי שימוש באפליקציה:"],
        list: [
          "פרטי חשבון: שם, כתובת אימייל, וסיסמה. הסיסמה נשמרת מוצפנת בלבד (bcrypt) ואינה ניתנת לשחזור, גם לא על ידינו.",
          "פרטים שבחרת להוסיף: גיל, תמונת פרופיל, אזור מגורים, ומרחק הנסיעה שאתה מוכן לעשות למשחק.",
          "רמת משחק (NTRP) והיסטוריית השינויים שלה.",
          "משחקים: מועדים שנקבעו, המגרש שנבחר, תוצאות, ומי דיווח ואישר אותן.",
          "הודעות הצ'אט שאתה כותב לשחקן שמולך.",
          "העדפות התראות ושעות שקט.",
          "מזהה טכני של הדפדפן שלך, אם אישרת לקבל התראות.",
          "אם בחרת להתחבר עם Google: השם, כתובת האימייל ותמונת הפרופיל מחשבון הגוגל שלך, ומזהה פנימי של גוגל. התמונה נשמרת אצלנו פעם אחת בהרשמה, משמשת כתמונת הפרופיל שלך באפליקציה, ואפשר להחליף או להסיר אותה בכל רגע במסך ההגדרות. סיסמת הגוגל שלך לעולם אינה עוברת דרכנו.",
        ],
      },
      {
        h: "למה המידע משמש",
        p: [
          "המידע משמש אך ורק להפעלת השירות: ליצור ולנהל את החשבון שלך, לשבץ אותך למשחקים, לחשב דירוג וטבלאות, לאפשר לך ולשחקן שמולך לתאם ביניכם, ולשלוח לך הודעות על משחקים שלך.",
          "אנחנו לא מוכרים מידע, לא משתפים אותו עם מפרסמים, ולא משתמשים בו לפרסום.",
        ],
      },
      {
        h: "מה שחקנים אחרים רואים",
        p: [
          "שחקנים אחרים בליגות שאתה חבר בהן רואים את שמך, תמונת הפרופיל שלך, רמת המשחק שלך, ותוצאות המשחקים שלך בליגה. זהו הבסיס לטבלה ולדירוג.",
          "הודעות הצ'אט שלך גלויות לשחקן שמולך באותו משחק בלבד.",
          "כתובת האימייל שלך, הגיל שלך ושעות השקט שלך אינם גלויים לשחקנים אחרים.",
        ],
      },
      {
        h: "שירותים חיצוניים",
        p: ["המידע נשמר ומועבר דרך מספר ספקים, כל אחד לצורך מוגדר:"],
        list: [
          "Render — אחסון השרת ובסיס הנתונים.",
          "Vercel — אחסון האתר עצמו.",
          "Google — רק אם בחרת להתחבר באמצעות חשבון גוגל.",
          "שירותי ההתראות של הדפדפן שלך (Apple, Google או Mozilla, לפי המכשיר) — כדי להעביר אליך התראות. ההתראה עצמה מכילה את תוכן ההודעה.",
          "Gmail — לשליחת מייל איפוס סיסמה בלבד.",
        ],
        after: [
          "אין באפליקציה כלי מדידה, אנליטיקס או קוד מעקב של צד שלישי.",
          "האפליקציה מציגה קישורים לאתרי הזמנת מגרשים חיצוניים, כמו לזוז. ברגע שאתה עובר לאתר כזה, הוא אינו בשליטתנו וחלה עליו מדיניות הפרטיות שלו. אנחנו לא מעבירים אליו שום פרט עליך.",
        ],
      },
      {
        h: "מה נשמר בדפדפן שלך",
        p: [
          "האפליקציה שומרת בדפדפן שלך אסימון התחברות ומספר העדפות, כמו שפת הממשק. אלה נחוצים לתפקוד השירות ואינם משמשים למעקב. אין באפליקציה עוגיות פרסום.",
        ],
      },
      {
        h: "כמה זמן המידע נשמר",
        p: [
          "המידע נשמר כל עוד החשבון שלך קיים.",
          "כשאתה מוחק את חשבונך, הפרטים המזהים שלך מוסרים: השם וכתובת האימייל מוחלפים בערכים אנונימיים ולא ניתן להתחבר לחשבון שוב. תוצאות של משחקים שכבר שוחקו נשארות במערכת, בלי הפרטים האישיים שלך, משום שהן חלק מההיסטוריה ומהדירוג של השחקנים שהתמודדו מולך — מחיקתן הייתה משנה את התוצאות שלהם. משחקים שעוד לא שוחקו נמחקים.",
        ],
      },
      {
        h: "אבטחה",
        p: [
          "התקשורת בין האפליקציה לשרת מוצפנת, והסיסמאות נשמרות מוצפנות בלבד. יחד עם זאת, אף שירות אינו חסין לחלוטין, ואיננו יכולים להתחייב לאבטחה מוחלטת.",
        ],
      },
      {
        h: "הזכויות שלך",
        p: [
          "אתה רשאי לעיין במידע שנשמר עליך, לבקש את תיקונו, ולמחוק את חשבונך. חלק מהפעולות זמינות ישירות במסך ההגדרות; לכל יתר הבקשות אפשר לפנות לכתובת omerbenyossef77@gmail.com ונטפל בהן תוך זמן סביר.",
        ],
      },
      {
        h: "גיל",
        p: [
          "השירות מיועד למשתמשים מגיל 16 ומעלה. איננו אוספים ביודעין מידע על מי שצעיר מכך. אם נודע לנו על חשבון כזה, הוא יוסר.",
        ],
      },
      {
        h: "שינויים במדיניות",
        p: [
          "ייתכן שהמדיניות תתעדכן. התאריך בראש העמוד מציין את מועד העדכון האחרון, ושינוי מהותי יובא לידיעת המשתמשים באפליקציה.",
        ],
      },
    ],
  },

  en: {
    title: "Privacy Policy",
    updated: "Last updated: 25 October 2026",
    intro:
      "Rally is an app for organising amateur tennis and padel leagues and matches. This page explains what information is collected about you, why, who can see it, and how to remove it.",
    sections: [
      {
        h: "Who is responsible",
        p: [
          "The data controller is Omer Ben Yossef, who runs Rally as an independent service.",
          "For any question, or to access, correct or delete your information, write to omerbenyossef77@gmail.com.",
        ],
      },
      {
        h: "What is collected",
        p: ["What you give us, and what is created as you use the app:"],
        list: [
          "Account details: name, email address and password. The password is stored only as a bcrypt hash and cannot be recovered, by us or anyone else.",
          "Details you choose to add: age, profile photo, area, and how far you are willing to travel for a match.",
          "Your playing level (NTRP) and the history of how it changed.",
          "Matches: agreed times, the chosen court, results, and who reported and confirmed them.",
          "The chat messages you write to your opponent.",
          "Notification preferences and quiet hours.",
          "A technical identifier for your browser, if you allowed notifications.",
          "If you sign in with Google: the name, email address and profile photo on your Google account, and a Google identifier. The photo is copied once when you sign up, becomes your profile photo in the app, and can be replaced or removed at any time in the settings screen. Your Google password never passes through us.",
        ],
      },
      {
        h: "What it is used for",
        p: [
          "Only to run the service: to create and manage your account, pair you for matches, work out ratings and standings, let you and your opponent arrange a match, and tell you about your own matches.",
          "We do not sell your information, share it with advertisers, or use it for advertising.",
        ],
      },
      {
        h: "What other players see",
        p: [
          "Players in leagues you belong to can see your name, photo, playing level, and your results in that league. That is what the standings are made of.",
          "Your chat messages are visible only to the opponent in that match.",
          "Your email address, your age and your quiet hours are not visible to other players.",
        ],
      },
      {
        h: "Third parties",
        p: ["Your information is stored and carried by a few providers, each for one purpose:"],
        list: [
          "Render — the server and database.",
          "Vercel — hosting for the app itself.",
          "Google — only if you chose to sign in with a Google account.",
          "Your browser's notification service (Apple, Google or Mozilla, depending on the device) — to deliver notifications. The notification carries its own text.",
          "Gmail — to send password reset emails, and nothing else.",
        ],
        after: [
          "The app contains no analytics, measurement or third-party tracking code.",
          "The app links to external court booking sites such as Lazuz. Once you follow such a link you are on their site, under their privacy policy, and we send them nothing about you.",
        ],
      },
      {
        h: "What is kept in your browser",
        p: [
          "The app keeps a sign-in token and a few preferences, such as your interface language, in your browser. These are needed for the service to work and are not used for tracking. There are no advertising cookies.",
        ],
      },
      {
        h: "How long it is kept",
        p: [
          "Your information is kept for as long as your account exists.",
          "When you delete your account, your identifying details are removed: your name and email are replaced with anonymous values and the account can no longer be signed into. Results of matches already played remain, without your personal details, because they are part of the history and rating of the players you faced — removing them would change their results. Matches not yet played are deleted.",
        ],
      },
      {
        h: "Security",
        p: [
          "Traffic between the app and the server is encrypted, and passwords are stored only as hashes. No service is completely secure, and we cannot promise absolute security.",
        ],
      },
      {
        h: "Your rights",
        p: [
          "You may see what is stored about you, ask for it to be corrected, and delete your account. Some of this is available directly in the settings screen; for anything else write to omerbenyossef77@gmail.com and we will deal with it within a reasonable time.",
        ],
      },
      {
        h: "Age",
        p: [
          "The service is for people aged 16 and over. We do not knowingly collect information about anyone younger. If we learn of such an account, it will be removed.",
        ],
      },
      {
        h: "Changes",
        p: [
          "This policy may be updated. The date at the top shows when it last changed, and a material change will be brought to users' attention in the app.",
        ],
      },
    ],
  },
};
