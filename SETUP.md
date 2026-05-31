# הוראות הגדרה והפעלה

## 1. התקנת dependencies

```bash
pip install -r requirements.txt
playwright install chromium
```

## 2. הגדרת פרטי יצירת קשר

```bash
cp .env.example .env
```
פתח את `.env` ומלא את שמך, טלפון ואימייל.

## 3. הגדרת ההזמנה

פתח `config.json` ועדכן:

| שדה | תיאור | דוגמה |
|-----|--------|-------|
| `restaurant_name` | שם המסעדה לחיפוש | `"מסעדת הים"` |
| `restaurant_city` | עיר (לחיפוש מדויק יותר) | `"תל אביב"` |
| `booking.reservation_day` | יום הסעודה | `"saturday"` |
| `booking.reservation_time` | שעת הסעודה | `"20:00"` |
| `booking.guests` | מספר סועדים ברירת מחדל | `2` |
| `booking.advance_days` | כמה ימים קדימה להזמין | `5` |
| `scheduler.run_day` | יום הפעלת הסקריפט | `"monday"` |
| `scheduler.run_time` | שעת הפעלת הסקריפט | `"10:00"` |

## 4. הרצה

### בדיקה ראשונה (dry run – לא ישלח הזמנה)
```bash
python restaurant_booking.py --dry-run
```

### הזמנה לפי מספר סועדים מסוים
```bash
python restaurant_booking.py --guests 4
```

### הפעלת ה-scheduler השבועי
```bash
python scheduler.py
```
הסקריפט ירוץ ברקע ויפעיל הזמנה אוטומטית כל שבוע.

### הפעלה מיידית דרך ה-scheduler
```bash
python scheduler.py --now --guests 3
```

## 5. הפעלה אוטומטית עם cron (Linux/Mac)

כדי שה-scheduler יפעל אוטומטית גם אחרי הפעלה מחדש:
```bash
crontab -e
```
הוסף שורה (מריץ כל יום שני ב-10:00):
```
0 10 * * 1 cd /path/to/FinalProject_Omer && python scheduler.py --now >> scheduler.log 2>&1
```

## פתרון בעיות

- **צילומי מסך**: בכל שגיאה נשמרים ב-`screenshots/` לניפוי שגיאות
- **לוגים**: `booking.log` ו-`scheduler.log` מתעדים כל פעולה
- **SMS / אימות**: אם Ontopo דורש קוד SMS, הסקריפט ייעצר – הפעל עם `headless: false` בconfig כדי לראות את הדפדפן
