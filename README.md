# ASIN Manager – V1

## מבנה הפרויקט
```
asin-manager/
├── backend/          # Node.js + Express + TypeScript + BullMQ
├── frontend/         # React + Vite + TypeScript
└── README.md
```

## הרצה מקומית

### דרישות מקדימות
- Node.js 18+
- Redis (לתור BullMQ)
- חשבון Supabase

### 1. Clone + Install
```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

### 2. הגדרת משתני סביבה
```bash
# backend/.env
cp backend/.env.example backend/.env
# מלא את הפרטים: DATABASE_URL, REDIS_URL, AMAZON_API_KEY
```

### 3. הרצת DB migrations
```bash
cd backend
npx prisma migrate dev
```

### 4. הרצת Redis (Docker)
```bash
docker run -d -p 6379:6379 redis:alpine
```

### 5. הרצת Backend
```bash
cd backend
npm run dev
```

### 6. הרצת Frontend
```bash
cd frontend
npm run dev
```

## URLs
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- BullMQ Dashboard: http://localhost:3001/admin/queues
