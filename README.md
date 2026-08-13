# THE GATEHUB — Next-Generation Document Intelligence & Learning Platform

> **Engineered by Shoeb Ahmed**  
> THE GATEHUB is a world-class, production-grade educational platform featuring a **Premium Document Intelligence Engine**, **Interactive Classroom Studio**, **Assessment Studio & Quiz Builder**, and **AI Course Architect**.

---

## 🚀 Key Features

### 📄 Premium Document Intelligence Engine
- **Visual Educational Document Model (DOG)**: Converts DOCX and PDF documents into high-fidelity Object Graphs without destructive OCR or string-parsing heuristics.
- **Strict Question Container Ownership**: Enforces strict container boundaries where Question $X$ starts strictly on explicit markers (`Question X`, `QX:`, `Problem X:`, `1.`, `12.`) and ends strictly on Question $X+1$.
- **Native Asset Recovery**:
  - **100% Binary Media Stream Recovery**: Inline, floating, and anchored DrawingML, VML, JPEG, PNG, SVG, BMP, and TIFF assets.
  - **TeX / MathML Math Formulas**: Native OMML, MathML, and LaTeX formula preservation.
  - **Monaco Code Blocks**: Preserves indentation, spaces, tabs, comments, and syntax formatting.
  - **HTML Table Grids**: Cell matrices with merged cells (`colspan`/`rowspan`), borders, and headers.
  - **Lists & Hyperlinks**: Preserves multi-level ordered lists, bullet lists, and interactive hyperlinks.

### 🎥 Interactive Classroom Studio
- Real-time live session hosting with WebSocket synchronization.
- Student join workflows, waiting rooms, proctoring, and live interaction tools (Polls, MCQs, Open Answer, Word Cloud).
- Instructor-paced and student-paced live player controls.

### 📝 Assessment Studio & Quiz Builder
- Question Bank management, collection organizing, and AI-assisted item authoring.
- Drag-and-drop Quiz Builder with live question type catalog and validation.
- Multi-format exports and instant assessment deployment.

### 🤖 AI Course Architect & Authoring Studio
- Multi-agent AI course generation pipeline for syllabus, theory, code examples, quizzes, and projects.
- Retrieval-Augmented Generation (RAG) and LaTeX document compile engine.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18 with TypeScript & Vite
- **Styling**: Vanilla CSS, TailwindCSS, Framer Motion
- **State & Data**: TanStack Query (React Query), Zustand, React Hook Form, Zod
- **Code & Content**: Monaco Editor, KaTeX, Mermaid.js, Lucide Icons

### Backend
- **Runtime**: Node.js ES Modules with Express & TypeScript
- **Database & ORM**: PostgreSQL with Prisma ORM
- **Document Processing**: JSZip, OpenXML DOM Parsers, PDF Native Stream Pipeline, Mammoth
- **AI & Integrations**: OpenAI API, Google OAuth, Unsplash, Pexels

---

## 📁 Repository Structure

```
THE-GATEHUB/
├── backend/                  # Express REST API & Realtime Services
│   ├── prisma/               # Database Schema, Migrations, Seed & Purge Scripts
│   │   ├── schema.prisma     # Production PostgreSQL Schema
│   │   ├── seed.ts           # System Account & Taxonomy Seeder
│   │   └── purge_data.ts     # Safe Production Data Purging Script
│   ├── src/
│   │   ├── controllers/      # API Route Controllers
│   │   ├── middlewares/      # Auth, Error Handling, & Validation
│   │   ├── routes/           # Express Endpoint Routing
│   │   ├── services/         # Business Logic & Extraction Pipeline
│   │   │   ├── assessmentStudio/  # Assessment & Import Services
│   │   │   ├── classroomStudio/   # Realtime Classroom Engine
│   │   │   └── extraction/        # Two-Pass Document Intelligence Engine
│   │   └── ws/               # WebSocket Realtime Servers
│   ├── .env.example          # Backend Environment Template
│   └── Dockerfile            # Production Backend Container Spec
│
├── frontend/                 # React Single-Page Web Application
│   ├── src/
│   │   ├── components/       # Reusable UI & Studio Components
│   │   ├── hooks/            # Custom React Hooks
│   │   ├── lib/              # API Clients, Utilities, & Types
│   │   ├── pages/            # Instructor & Student Application Views
│   │   └── store/            # Application State Management
│   ├── .env.example          # Frontend Environment Template
│   └── Dockerfile            # Production Frontend Container Spec
│
├── shared/                   # Shared TypeScript Interfaces & Types
├── docker-compose.yml        # Docker Multi-Container Compose Configuration
├── render.yaml               # Render Cloud Infrastructure Blueprint
└── README.md                 # Project Documentation
```

---

## 💻 Local Development Setup

### Prerequisites
- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **PostgreSQL**: v15.x or higher (or Docker)

### 1. Clone & Install
```bash
git clone https://github.com/991627aishu/THE-GATEHUB-Learn-with-Shoeb-Ahmed-.git
cd THE-GATEHUB-Learn-with-Shoeb-Ahmed-
```

### 2. Configure Environment Variables
Copy environment templates in `backend` and `frontend`:
```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

### 3. Database Initialization
```bash
cd backend
npm install
npx prisma migrate deploy
npx prisma db seed
```

### 4. Start Development Servers
In two separate terminals:
```bash
# Terminal 1: Backend Server (Port 5000)
cd backend
npm run dev

# Terminal 2: Frontend Client (Port 5173)
cd frontend
npm run dev
```

Visit `http://localhost:5173` to access the application.

---

## 🐳 Docker Deployment

To launch the complete platform using Docker Compose:

```bash
docker-compose up --build -d
```

This starts:
- **PostgreSQL Database**: Port `5432`
- **Backend Service**: Port `5000`
- **Frontend Service**: Port `80`

---

## ☁️ Cloud Deployment (Render / AWS / DigitalOcean)

The repository includes a production-ready `render.yaml` specification:

1. Connect your repository to Render.
2. Render will automatically detect `render.yaml` and provision:
   - **PostgreSQL Instance**: `gatehub-db`
   - **Node Web Service**: `gatehub-backend`
   - **Static Web Service**: `gatehub-frontend`

---

## 📄 License & Author

**Author**: Shoeb Ahmed  
**Project**: THE GATEHUB Learning Platform  
**License**: Proprietary / Production Ready  
