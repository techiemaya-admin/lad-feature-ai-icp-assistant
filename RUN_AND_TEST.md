# How to Run and Test ICP Questions System

Complete guide to run backend and frontend together.

## Prerequisites

1. **Node.js** (v18+)
2. **PostgreSQL** database running
3. **Gemini API Key** (for answer processing)

---

## Step 1: Database Setup

### Option A: Using psql
```bash
cd lad-feature-ai-icp-assistant/migrations
psql -U postgres -d lad_dev -f 008_create_icp_questions_table.sql
```

### Option B: Using Node.js script
```bash
cd lad-feature-ai-icp-assistant
node scripts/run-migration.js
```

### Verify Database
```sql
SELECT COUNT(*) FROM icp_questions WHERE category = 'lead_generation';
-- Should return 7
```

---

## Step 2: Environment Variables

### Backend (.env file in lad-feature-ai-icp-assistant/)
```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=lad_dev
DB_USER=postgres
DB_PASSWORD=your_password

# Gemini API
GEMINI_API_KEY=your_gemini_api_key_here

# Server
PORT=3000
NODE_ENV=development
```

### Frontend (.env.local in LAD-Frontend/web/)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

---

## Step 3: Install Dependencies

### Backend
```bash
cd lad-feature-ai-icp-assistant
npm install
```

### Frontend
```bash
cd LAD-Frontend/web
npm install
```

---

## Step 4: Run Backend

### Terminal 1: Backend Server
```bash
cd lad-feature-ai-icp-assistant
npm start
# OR for development with auto-reload:
npm run dev
```

**Expected Output:**
```
Server running on http://localhost:3000
Routes registered:
  GET  /api/ai-icp-assistant/onboarding/icp-questions
  GET  /api/ai-icp-assistant/onboarding/icp-questions/:stepIndex
  POST /api/ai-icp-assistant/onboarding/icp-answer
```

---

## Step 5: Run Frontend

### Terminal 2: Frontend Server
```bash
cd LAD-Frontend/web
npm run dev
```

**Expected Output:**
```
- ready started server on 0.0.0.0:3001
- Local:        http://localhost:3001
```

---

## Step 6: Test Backend API

### Terminal 3: Test API (Optional)

#### Test 1: Get All Questions
```bash
curl http://localhost:3000/api/ai-icp-assistant/onboarding/icp-questions?category=lead_generation
```

**Expected:** JSON with 7 questions

#### Test 2: Get Specific Question
```bash
curl http://localhost:3000/api/ai-icp-assistant/onboarding/icp-questions/1?category=lead_generation
```

**Expected:** First question JSON

#### Test 3: Process Answer
```bash
curl -X POST http://localhost:3000/api/ai-icp-assistant/onboarding/icp-answer \
  -H "Content-Type: application/json" \
  -d '{
    "currentStepIndex": 1,
    "userAnswer": "Logistics companies, SaaS founders",
    "category": "lead_generation"
  }'
```

**Expected:** Next question (step 2) or clarification request

---

## Step 7: Test Frontend

1. **Open Browser:** `http://localhost:3001` (or your frontend port)

2. **Navigate to Onboarding:**
   - Go to `/onboarding` page
   - Or click "Lead Generation & Outreach" button

3. **Test Chat Flow:**
   - Questions should load from API (check Network tab)
   - Answer each question
   - Verify progression through all 7 steps
   - Check that no hardcoded text appears

4. **Test Form Flow:**
   - Switch to form-based onboarding
   - Verify questions load from API
   - Fill out the form
   - Submit and verify

---

## Step 8: Verify Everything Works

### ✅ Checklist

- [ ] Database has 7 questions
- [ ] Backend server running on port 3000
- [ ] Frontend server running
- [ ] API endpoints return questions
- [ ] Frontend loads questions from API
- [ ] Chat flow progresses through steps
- [ ] Gemini processes answers (requires API key)
- [ ] No hardcoded text in frontend
- [ ] No errors in browser console
- [ ] No errors in backend logs

---

## Troubleshooting

### Backend Issues

**Error: GEMINI_API_KEY not set**
```bash
export GEMINI_API_KEY=your_key
# OR add to .env file
```

**Error: Database connection failed**
- Check database is running
- Verify DB credentials in .env
- Check database name exists

**Error: Table doesn't exist**
- Run migration: `psql -U postgres -d lad_dev -f migrations/008_create_icp_questions_table.sql`

### Frontend Issues

**Error: API calls failing**
- Check `NEXT_PUBLIC_API_URL` in .env.local
- Verify backend is running
- Check CORS settings

**Error: Questions not loading**
- Check browser Network tab for API calls
- Verify backend routes are registered
- Check browser console for errors

**Error: TypeScript errors**
- Restart TypeScript server in IDE
- Run `npm run lint` to check for issues

---

## Quick Test Commands

```bash
# Test backend API
curl http://localhost:3000/api/ai-icp-assistant/onboarding/icp-questions

# Test with answer
curl -X POST http://localhost:3000/api/ai-icp-assistant/onboarding/icp-answer \
  -H "Content-Type: application/json" \
  -d '{"currentStepIndex": 1, "userAnswer": "Logistics companies"}'

# Check database
psql -U postgres -d lad_dev -c "SELECT step_index, question FROM icp_questions ORDER BY step_index;"
```

---

## Development Workflow

1. **Make changes to backend:**
   - Backend auto-reloads with `npm run dev`
   - Test API endpoints

2. **Make changes to frontend:**
   - Frontend auto-reloads with `npm run dev`
   - Check browser for changes

3. **Database changes:**
   - Update migration file
   - Re-run migration
   - Or update directly in database

---

## Production Deployment

1. Set environment variables in production
2. Run database migration
3. Build frontend: `npm run build`
4. Start backend: `npm start`
5. Start frontend: `npm start`

---

## Next Steps

- ✅ System is running
- ✅ Questions load from database
- ✅ Frontend uses API
- ✅ Gemini processes answers
- 🎉 Ready for testing!

